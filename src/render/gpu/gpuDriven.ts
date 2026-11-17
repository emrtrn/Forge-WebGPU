// The host's GPU-driven drawing (phase 5c steps 5.1 / 5.2): the batches of
// every world, culled once a frame before the frame renders, for the main
// camera and every shadow view, all their dispatches in one compute pass.
//
// Shadow views (5.2): the directional lights the scene's last render lit
// with a shadow (three's lights node). A cascaded sun gives one view per
// cascade: its node places the cascades for this frame's camera here, before
// the render, exactly as the render does again (the placement depends on the
// camera and the light only), so the cull sees the cascade cameras the
// shadow pass will use. Any other directional shadow is one view. Each
// shadow camera gets its view's layer (`shadowViewLayer`), which three's
// shadow pass keeps. Spot and point light shadows are not shadow views.
//
// Camera views (R9a step 1): a camera that draws the scene besides the main
// one registers a `CameraViewSource` (`add`); a planar reflection's view is
// the main view mirrored through its plane (`mirrorCullView`: distances from
// the mirrored eye). Each gets its own layer; every registered camera loses
// the other views' layers, so it never draws the main camera's lists.
//
// Render bundles (5.3): with `bundle: true` a GPU batch's opaque draws are a
// `BundleGroup` three records per camera (gpuDrivenBatch.ts; off by default,
// no measured gain).
//
// Draw counting: three counts no indirect draw in `renderer.info` (and no
// draw inside a render bundle); `lastDraws` is the draws of the last
// culled frame three did not count, which the `?debug` readout and the perf
// witness add to three's count.
//
// The GPU path needs WebGPU (compute atomics, indirect draws). On the WebGL2
// test backend `supported` is false and `createBatch` builds the CPU twin
// (`cpuDrivenBatch.ts`: the CPU reference culls, instanced meshes draw; user
// decision 2026-11-17), behind the same interface.

import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import {
  Matrix4,
  Vector3,
  WebGPUCoordinateSystem,
  type Camera,
  type ComputeNode,
  type DirectionalLight,
  type Light,
  type Object3D,
  type Scene,
  type WebGPURenderer,
} from "three/webgpu";
import { frustumPlanesOf, mirrorCullView, type InstanceCullView } from "../../engine/world/instanceCulling.ts";
import { createCpuDrivenBatch } from "./cpuDrivenBatch.ts";
import {
  cameraViewLayer, createGpuDrivenBatch, MAIN_VIEW_LAYER, MAX_CAMERA_VIEWS, MAX_SHADOW_VIEWS, shadowViewLayer,
  type GpuCullView, type GpuDrivenBatch, type GpuDrivenBatchOptions,
} from "./gpuDrivenBatch.ts";

/**
 * A camera that draws the scene besides the main one (R9a step 1), asked
 * every frame before the cull. `camera` is the camera that will draw;
 * `mirror` (unit normal, offset: n·p + c = 0) makes the view the main view
 * reflected through it (a planar reflection: its camera is placed during the
 * render, after the cull); without it the camera's own matrices are culled.
 * `active` false: it will not draw this frame (no view; it still loses the
 * main view's layer).
 */
export interface CameraViewSource {
  view(main: Camera): { readonly camera: Camera; readonly mirror?: readonly [number, number, number, number]; readonly active: boolean } | null;
}

/** Every layer a GPU-driven view owns: shadow views, the main view, camera views (layer 0 is no view's). */
const VIEW_LAYER_BITS = ((1 << (cameraViewLayer(MAX_CAMERA_VIEWS - 1) + 1)) - 1) & ~1;

/** Where cameras that draw the scene register (`RenderBindingContext.cameraViews`). */
export interface CameraViews {
  /** Registers a camera view; the returned function removes it. */
  add(source: CameraViewSource): () => void;
}

export interface GpuDrivenStats {
  readonly batches: number;
  readonly instances: number;
  /** Draws of every view in the last culled frame (counted by three or not). */
  readonly draws: number;
  /** Views of the last culled frame: the main camera and its shadow views. */
  readonly views: number;
  /** Render bundle re-record marks so far, every batch (5.3; each camera records once per mark). */
  readonly bundleUpdates: number;
}

export interface GpuDrivenDrawing extends CameraViews {
  /** The GPU path (WebGPU); false: batches are the CPU twin (WebGL2). */
  readonly supported: boolean;
  createBatch(options: GpuDrivenBatchOptions): GpuDrivenBatch;
  /** Disposes the batch and stops culling it. */
  removeBatch(batch: GpuDrivenBatch): void;
  /** Culls the batches drawn in `scene` for `camera` and the shadow views; before the frame's render. */
  cull(scene: Object3D, camera: Camera): void;
  /** The main view of the last cull (the CPU reference's input), null before one. */
  readonly lastView: InstanceCullView | null;
  /** Every view of the last cull, the main view first, then shadow views, then camera views. */
  readonly lastViews: readonly GpuCullView[];
  /** The batches the last cull dispatched. */
  readonly lastBatches: readonly GpuDrivenBatch[];
  /** Draws of the last culled frame `renderer.info` did not count. */
  readonly lastDraws: number;
  /**
   * Triangles the GPU path drew that `renderer.info` did not count, every
   * view: the last known value. Asking refreshes it in the background (an
   * asynchronous read of the visible counts, at most twice a second); 0 on
   * the WebGL2 twin, whose triangles three counts.
   */
  uncountedTriangles(): number;
  stats(): GpuDrivenStats;
  dispose(): void;
}

function inScene(object: Object3D, scene: Object3D): boolean {
  for (let at: Object3D | null = object; at; at = at.parent) if (at === scene) return true;
  return false;
}

type ShadowCaster = DirectionalLight & { shadow: DirectionalLight["shadow"] & { shadowNode?: unknown } };

/** The shadow cameras the frame's directional shadows will render with, cascades in order. */
export function shadowCamerasOf(lights: readonly Light[]): Camera[] {
  const cascadeLights = new Set<Object3D>();
  for (const light of lights) {
    const node = (light as ShadowCaster).shadow?.shadowNode;
    if (node instanceof CSMShadowNode) for (const cascade of node.lights) cascadeLights.add(cascade);
  }
  const cameras: Camera[] = [];
  for (const light of lights) {
    const caster = light as ShadowCaster;
    if (!caster.isDirectionalLight || !caster.castShadow || cascadeLights.has(caster) || !caster.shadow) continue;
    const node = caster.shadow.shadowNode;
    if (node instanceof CSMShadowNode) {
      // Not set up before its first render: no cascades to cull for yet.
      if (node.camera === null) continue;
      node.updateBefore(undefined as never);
      for (const cascade of node.lights as DirectionalLight[]) {
        cascade.shadow.updateMatrices(cascade);
        cameras.push(cascade.shadow.camera);
      }
    } else {
      caster.shadow.updateMatrices(caster);
      cameras.push(caster.shadow.camera);
    }
  }
  return cameras;
}

export function createGpuDriven(renderer: WebGPURenderer): GpuDrivenDrawing {
  const supported = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  const batches = new Map<GpuDrivenBatch, Object3D>();
  const cameraSources = new Set<CameraViewSource>();
  const viewProjection = new Matrix4();
  const position = new Vector3();
  let lastViews: GpuCullView[] = [];
  let lastBatches: GpuDrivenBatch[] = [];
  let lastDraws = 0;
  let draws = 0;
  let removedUpdates = 0;
  let triangles = 0;
  let reading = false;
  let askedAt = -Infinity;
  const readTriangles = async (): Promise<void> => {
    let sum = 0;
    for (const batch of lastBatches) {
      for (let view = 0; view < batch.views; view += 1) {
        const counts = await batch.readCounts(renderer, view);
        counts.forEach((count, lod) => { sum += count * (batch.lodTriangles[lod] ?? 0); });
      }
    }
    triangles = sum;
  };

  const planesOf = (camera: Camera): Float32Array | null => {
    // Before its first WebGPU render a camera may still hold a WebGL-style projection.
    const webgpuClip = (camera as { coordinateSystem?: number }).coordinateSystem === WebGPUCoordinateSystem;
    if (supported && !webgpuClip) return null;
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    return frustumPlanesOf(viewProjection.elements, webgpuClip ? "zeroToOne" : "minusOneToOne");
  };

  return {
    supported,
    createBatch(options) {
      const batch = supported ? createGpuDrivenBatch(renderer, options) : createCpuDrivenBatch(renderer, options);
      batches.set(batch, options.parent);
      return batch;
    },
    removeBatch(batch) {
      if (!batches.delete(batch)) return;
      removedUpdates += batch.bundleUpdates;
      batch.dispose();
      lastBatches = lastBatches.filter((entry) => entry !== batch);
    },
    add(source) {
      cameraSources.add(source);
      return () => { cameraSources.delete(source); };
    },
    cull(scene, camera) {
      lastBatches = [];
      lastViews = [];
      lastDraws = 0;
      draws = 0;
      // The main view's meshes are drawn by the main camera only (R9a step 1).
      camera.layers.enable(MAIN_VIEW_LAYER);
      const viewBits = VIEW_LAYER_BITS;
      // Every other camera that draws the scene loses the main view's layer, with or without a view.
      const sources = [...cameraSources].map((source) => source.view(camera));
      for (const entry of sources) if (entry) entry.camera.layers.mask = camera.layers.mask & ~viewBits;
      if (batches.size === 0) return;
      const planes = planesOf(camera);
      if (!planes) return;
      camera.getWorldPosition(position);
      const origin: [number, number, number] = [position.x, position.y, position.z];
      const main: GpuCullView = { planes, origin, role: "main", layer: MAIN_VIEW_LAYER };
      const views: GpuCullView[] = [main];
      if (renderer.shadowMap.enabled) {
        const lights = renderer.lighting.getNode(scene as Scene).getLights() as Light[];
        let shadows = 0;
        for (const shadowCamera of shadowCamerasOf(lights)) {
          const shadowPlanes = shadows >= MAX_SHADOW_VIEWS ? null : planesOf(shadowCamera);
          // A camera without a view this frame must not keep a layer another view now owns.
          const base = camera.layers.mask & ~viewBits;
          if (!shadowPlanes) { shadowCamera.layers.mask = base; continue; }
          shadows += 1;
          // Distances stay the main camera's: what it culls or fades, its shadow does too.
          const layer = shadowViewLayer(shadows);
          shadowCamera.layers.mask = base | (1 << layer);
          views.push({ planes: shadowPlanes, origin, role: "shadow", layer });
        }
      }
      let cameras = 0;
      for (const entry of sources) {
        if (!entry?.active || cameras >= MAX_CAMERA_VIEWS) continue;
        const own = entry.mirror ? mirrorCullView(main, entry.mirror) : (() => {
          const cameraPlanes = planesOf(entry.camera);
          if (!cameraPlanes) return null;
          entry.camera.getWorldPosition(position);
          return { planes: cameraPlanes, origin: [position.x, position.y, position.z] as [number, number, number] };
        })();
        if (!own) continue;
        const layer = cameraViewLayer(cameras++);
        entry.camera.layers.enable(layer);
        views.push({ ...own, role: "camera", layer });
      }
      const dispatches: ComputeNode[] = [];
      for (const [batch, parent] of batches) {
        // An empty batch still dispatches: its arguments go back to zero instances.
        if (!inScene(parent, scene)) continue;
        dispatches.push(...batch.prepare(views));
        lastBatches.push(batch);
        lastDraws += batch.uncountedDraws;
        draws += batch.lastDraws;
      }
      lastViews = views;
      if (dispatches.length > 0) renderer.compute(dispatches);
    },
    get lastView() { return lastViews[0] ?? null; },
    get lastViews() { return lastViews; },
    get lastBatches() { return lastBatches; },
    get lastDraws() { return lastDraws; },
    uncountedTriangles() {
      if (!supported) return 0;
      const now = performance.now();
      if (!reading && now - askedAt > 500) {
        askedAt = now;
        reading = true;
        void readTriangles().catch(() => undefined).finally(() => { reading = false; });
      }
      return lastBatches.length > 0 ? triangles : 0;
    },
    stats() {
      let instances = 0, bundleUpdates = removedUpdates;
      for (const batch of batches.keys()) { instances += batch.instances.count; bundleUpdates += batch.bundleUpdates; }
      return { batches: batches.size, instances, draws, views: lastViews.length, bundleUpdates };
    },
    dispose() {
      for (const batch of batches.keys()) batch.dispose();
      batches.clear();
      cameraSources.clear();
      lastBatches = [];
      lastViews = [];
    },
  };
}
