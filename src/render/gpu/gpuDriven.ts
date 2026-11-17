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
// Draw counting: three counts no indirect draw in `renderer.info` (and no
// draw inside a render bundle, 5.3); `lastDraws` is the draws of the last
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
import { frustumPlanesOf, type InstanceCullView } from "../../engine/world/instanceCulling.ts";
import { createCpuDrivenBatch } from "./cpuDrivenBatch.ts";
import { createGpuDrivenBatch, MAX_SHADOW_VIEWS, shadowViewLayer, type GpuDrivenBatch, type GpuDrivenBatchOptions } from "./gpuDrivenBatch.ts";

export interface GpuDrivenStats {
  readonly batches: number;
  readonly instances: number;
  /** Draws of every view in the last culled frame (counted by three or not). */
  readonly draws: number;
  /** Views of the last culled frame: the main camera and its shadow views. */
  readonly views: number;
}

export interface GpuDrivenDrawing {
  /** The GPU path (WebGPU); false: batches are the CPU twin (WebGL2). */
  readonly supported: boolean;
  createBatch(options: GpuDrivenBatchOptions): GpuDrivenBatch;
  /** Disposes the batch and stops culling it. */
  removeBatch(batch: GpuDrivenBatch): void;
  /** Culls the batches drawn in `scene` for `camera` and the shadow views; before the frame's render. */
  cull(scene: Object3D, camera: Camera): void;
  /** The main view of the last cull (the CPU reference's input), null before one. */
  readonly lastView: InstanceCullView | null;
  /** Every view of the last cull, the main view first. */
  readonly lastViews: readonly InstanceCullView[];
  /** The batches the last cull dispatched. */
  readonly lastBatches: readonly GpuDrivenBatch[];
  /** Draws of the last culled frame `renderer.info` did not count. */
  readonly lastDraws: number;
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
  const viewProjection = new Matrix4();
  const position = new Vector3();
  let lastViews: InstanceCullView[] = [];
  let lastBatches: GpuDrivenBatch[] = [];
  let lastDraws = 0;
  let draws = 0;

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
      batch.dispose();
      lastBatches = lastBatches.filter((entry) => entry !== batch);
    },
    cull(scene, camera) {
      lastBatches = [];
      lastViews = [];
      lastDraws = 0;
      draws = 0;
      if (batches.size === 0) return;
      const planes = planesOf(camera);
      if (!planes) return;
      camera.getWorldPosition(position);
      const origin: [number, number, number] = [position.x, position.y, position.z];
      const views: InstanceCullView[] = [{ planes, origin }];
      if (renderer.shadowMap.enabled) {
        const lights = renderer.lighting.getNode(scene as Scene).getLights() as Light[];
        for (const shadowCamera of shadowCamerasOf(lights)) {
          const shadowPlanes = views.length > MAX_SHADOW_VIEWS ? null : planesOf(shadowCamera);
          // A camera without a view this frame must not keep a layer another view now owns.
          if (!shadowPlanes) { shadowCamera.layers.mask = camera.layers.mask; continue; }
          // Distances stay the main camera's: what it culls or fades, its shadow does too.
          shadowCamera.layers.mask = camera.layers.mask | (1 << shadowViewLayer(views.length));
          views.push({ planes: shadowPlanes, origin });
        }
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
    stats() {
      let instances = 0;
      for (const batch of batches.keys()) instances += batch.instances.count;
      return { batches: batches.size, instances, draws, views: lastViews.length };
    },
    dispose() {
      for (const batch of batches.keys()) batch.dispose();
      batches.clear();
      lastBatches = [];
      lastViews = [];
    },
  };
}
