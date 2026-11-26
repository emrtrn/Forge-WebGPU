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
  StorageBufferAttribute,
  Vector3,
  WebGPUCoordinateSystem,
  type Camera,
  type ComputeNode,
  type DirectionalLight,
  type Light,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
} from "three/webgpu";
import { frustumPlanesOf, mirrorCullView, type InstanceCullView } from "../../engine/world/instanceCulling.ts";
import { SCENE_SOURCE_KEY } from "../../engine/perf/sceneCost.ts";
import { cascadeTexelSize, type ShadowCasterProfile } from "../../engine/world/shadowCasters.ts";
import { SUN_CASCADE_MAX } from "../../engine/world/sunCascades.ts";
import {
  createInstancedShadowCasters, instancedCasterMask, SHADOW_CASTER_LAYERS, VISIBLE_CASTER_LAYERS,
  type InstancedShadowCasters, type ShadowCasterCount,
} from "../sync/shadowCasterLayers.ts";
import { createCpuDrivenBatch } from "./cpuDrivenBatch.ts";
import {
  cameraViewLayer, COVER_LAYER, coverViewLayer, createGpuDrivenBatch, MAIN_VIEW_LAYER, MAX_CAMERA_VIEWS, MAX_COVER_VIEWS, MAX_SHADOW_VIEWS, shadowViewLayer, ZONE_MASK_WORDS, ZONE_SHADOW_LAYER,
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

/**
 * A precipitation cover camera (plan phase W3): a top-down depth view of the
 * statics, asked every frame before the cull. `active` true only on a frame
 * it draws; it is culled like a shadow view (distances from the main camera)
 * by the batches that cover (`precipitationCover`). Its camera sees its view
 * layer and {@link COVER_LAYER} only.
 */
export interface CoverViewSource {
  view(main: Camera): { readonly camera: Camera; readonly active: boolean } | null;
}

/** Every layer a GPU-driven view owns: shadow views, the main view, camera views (layer 0 is no view's). */
const VIEW_LAYER_BITS = ((1 << (cameraViewLayer(MAX_CAMERA_VIEWS - 1) + 1)) - 1) & ~1;

/** Where cameras that draw the scene register (`RenderBindingContext.cameraViews`). */
export interface CameraViews {
  /** Registers a camera view; the returned function removes it. */
  add(source: CameraViewSource): () => void;
}

/** What a render binding may do with the GPU-driven drawing: own batches (`RenderBindingContext.gpuDriven`). */
export type GpuDrivenBatches = Pick<GpuDrivenDrawing, "createBatch" | "removeBatch"> & {
  readonly instancedCasters?: InstancedShadowCasters;
};

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
  /** Registers a precipitation cover camera (at most {@link MAX_COVER_VIEWS}); the returned function removes it. */
  addCover(source: CoverViewSource): () => void;
  /** The GPU path (WebGPU); false: batches are the CPU twin (WebGL2). */
  readonly supported: boolean;
  readonly instancedCasters: InstancedShadowCasters;
  createBatch(options: GpuDrivenBatchOptions): GpuDrivenBatch;
  /**
   * This frame's zone masks (plan 5c R9b; `ZONE_MASK_WORDS` u32 each): the
   * main and camera views draw the instances whose zone slot is set in
   * `main`, shadow views those set in `shadow`; null draws every zone.
   * Every batch culls by them (an instance in no zone is slot 0, always set).
   */
  setZoneMasks(masks: { readonly main: Uint32Array; readonly shadow: Uint32Array } | null): void;
  /** Disposes the batch and stops culling it. */
  removeBatch(batch: GpuDrivenBatch): void;
  /** Culls the batches drawn in `scene` for `camera` and the shadow views; before the frame's render. */
  cull(scene: Object3D, camera: Camera, minCasterTexels?: number): void;
  shadowCasterStats(): {
    readonly instanced: readonly ShadowCasterCount[];
    readonly driven: readonly ShadowCasterCount[];
    readonly foliage: readonly ShadowCasterCount[];
  };
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

interface ShadowView {
  readonly camera: Camera;
  readonly cascade?: number;
  readonly profile?: ShadowCasterProfile;
}

/** The directional shadow cameras in render order, with thresholds on initialized CSM views. */
function shadowViewsOf(lights: readonly Light[], minTexels: number): ShadowView[] {
  const cascadeLights = new Set<Object3D>();
  for (const light of lights) {
    const node = (light as ShadowCaster).shadow?.shadowNode;
    if (node instanceof CSMShadowNode) for (const cascade of node.lights) cascadeLights.add(cascade);
  }
  const cameras: ShadowView[] = [];
  for (const light of lights) {
    const caster = light as ShadowCaster;
    if (!caster.isDirectionalLight || !caster.castShadow || cascadeLights.has(caster) || !caster.shadow) continue;
    const node = caster.shadow.shadowNode;
    if (node instanceof CSMShadowNode) {
      // Not set up before its first render: no cascades to cull for yet.
      if (node.camera === null) continue;
      node.updateBefore(undefined as never);
      const cascades = node.lights as DirectionalLight[];
      const texels = cascades.map(({ shadow }) =>
        cascadeTexelSize((shadow.camera.right - shadow.camera.left) / shadow.camera.zoom, shadow.mapSize.width));
      const { near, far: cameraFar } = node.camera as PerspectiveCamera;
      const far = Math.min(cameraFar, node.maxFar);
      const splits = node.breaks.map(split => near + split * (far - near));
      const profile = minTexels > 0 && Number.isFinite(minTexels) && texels.length <= SUN_CASCADE_MAX
        && texels.length === splits.length && texels.every((texel, i) => texel > (texels[i - 1] ?? 0))
        && splits.every((split, i) => Number.isFinite(split) && split > (splits[i - 1] ?? 0))
        ? { texels, splits, minTexels } : undefined;
      for (const [index, cascade] of cascades.entries()) {
        cascade.shadow.updateMatrices(cascade);
        cameras.push({ camera: cascade.shadow.camera, ...(profile ? { cascade: index + 1, profile } : {}) });
      }
    } else {
      caster.shadow.updateMatrices(caster);
      cameras.push({ camera: caster.shadow.camera });
    }
  }
  return cameras;
}

export function createGpuDriven(renderer: WebGPURenderer): GpuDrivenDrawing {
  const supported = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  const batches = new Map<GpuDrivenBatch, Object3D>();
  const instancedCasters = createInstancedShadowCasters();
  const cameraSources = new Set<CameraViewSource>();
  const coverSources = new Set<CoverViewSource>();
  const viewProjection = new Matrix4();
  const position = new Vector3();
  let lastViews: GpuCullView[] = [];
  let lastBatches: GpuDrivenBatch[] = [];
  let lastDraws = 0;
  // R9b zone masks: the main view's words, then the shadow views'; all set until zones say otherwise.
  const zoneMasks = new StorageBufferAttribute(new Uint32Array(ZONE_MASK_WORDS * 2).fill(0xffffffff), 1);
  let draws = 0;
  let removedUpdates = 0;
  let triangles = 0;
  let drivenShadows: ShadowCasterCount[] = [];
  let foliageShadows: ShadowCasterCount[] = [];
  let reading = false;
  let askedAt = -Infinity;
  const readTriangles = async (): Promise<void> => {
    let sum = 0;
    const cascades = new Map(lastViews.flatMap(view => view.cascade === undefined ? [] : [[view.layer, view.cascade] as const]));
    const shadows = Array.from({ length: Math.max(0, ...cascades.values()) }, () => ({ batches: 0, instances: 0 }));
    const foliage = shadows.map(() => ({ batches: 0, instances: 0 }));
    const active = lastBatches.map(batch => ({ batch, layers: batch.viewLayers, mode: batch.zoneMode,
      foliage: batch.meshes[0]?.userData[SCENE_SOURCE_KEY] === "foliage" }));
    for (const { batch, layers, mode, foliage: isFoliage } of active) {
      for (const [view, layer] of layers.entries()) {
        if (mode === "shadow" && layer >= MAIN_VIEW_LAYER) continue;
        const counts = await batch.readCounts(renderer, view);
        counts.forEach((count, lod) => { sum += count * (batch.lodTriangles[lod] ?? 0); });
        const cascade = cascades.get(layer);
        const instances = counts.reduce((total, count) => total + count, 0);
        if (cascade !== undefined && instances > 0) {
          const counts = (isFoliage ? foliage : shadows)[cascade - 1]!;
          counts.batches += 1;
          counts.instances += instances;
        }
      }
    }
    triangles = sum;
    drivenShadows = shadows;
    foliageShadows = foliage;
  };
  const refreshCounts = (): void => {
    const now = performance.now();
    if (!reading && now - askedAt > 500) {
      askedAt = now;
      reading = true;
      void readTriangles().catch(() => undefined).finally(() => { reading = false; });
    }
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
    supported, instancedCasters,
    shadowCasterStats() {
      if (lastBatches.length > 0) refreshCounts();
      const hasCascades = lastBatches.length > 0 && lastViews.some(view => view.cascade !== undefined);
      return { instanced: instancedCasters.stats(), driven: hasCascades ? drivenShadows : [], foliage: hasCascades ? foliageShadows : [] };
    },
    createBatch(options) {
      const zoned = { ...options, zoneMasks };
      const batch = supported ? createGpuDrivenBatch(renderer, zoned) : createCpuDrivenBatch(renderer, zoned);
      batches.set(batch, options.parent);
      return batch;
    },
    setZoneMasks(masks) {
      const words = zoneMasks.array as Uint32Array;
      let changed = false;
      for (let i = 0; i < ZONE_MASK_WORDS * 2; i += 1) {
        const next = masks === null ? 0xffffffff : (i < ZONE_MASK_WORDS ? masks.main[i] : masks.shadow[i - ZONE_MASK_WORDS]) ?? 0;
        if (words[i] !== next >>> 0) { words[i] = next >>> 0; changed = true; }
      }
      if (changed) zoneMasks.needsUpdate = true;
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
    addCover(source) {
      coverSources.add(source);
      return () => { coverSources.delete(source); };
    },
    cull(scene, camera, minCasterTexels = 0) {
      lastBatches = [];
      lastViews = [];
      lastDraws = 0;
      draws = 0;
      // The main view's meshes are drawn by the main camera only (R9a step 1).
      camera.layers.enable(MAIN_VIEW_LAYER);
      camera.layers.mask = (camera.layers.mask & ~SHADOW_CASTER_LAYERS) | VISIBLE_CASTER_LAYERS;
      const viewBits = VIEW_LAYER_BITS;
      // Every other camera that draws the scene loses the main view's layer, with or without a view.
      const sources = [...cameraSources].map((source) => source.view(camera));
      for (const entry of sources) if (entry) entry.camera.layers.mask = camera.layers.mask & ~viewBits;
      // Shadow cameras also draw the instanced meshes of hidden zones that always cast (R9b), with or without batches.
      const lights = renderer.shadowMap.enabled ? renderer.lighting.getNode(scene as Scene).getLights() as Light[] : [];
      const shadowViews = shadowViewsOf(lights, minCasterTexels);
      const profiles = new Set(shadowViews.flatMap(view => view.profile ? [view.profile] : []));
      // A batch has one class. If there is more than one CSM layout, leave
      // instanced casting unrestricted while GPU views use their own layouts.
      const profile = profiles.size === 1 ? [...profiles][0]! : null;
      const casterCameras = new Set(shadowViews.filter(view => profile !== null && view.profile === profile).map(view => view.camera));
      instancedCasters.update(scene, camera, profile, casterCameras);
      const base = (camera.layers.mask & ~(viewBits | VISIBLE_CASTER_LAYERS | SHADOW_CASTER_LAYERS)) | (1 << ZONE_SHADOW_LAYER);
      for (const view of shadowViews) {
        view.camera.layers.mask = base | instancedCasterMask(profile !== null && view.profile === profile ? view.cascade : undefined);
      }
      // Each cover camera draws its own view layer and the CPU-drawn covers (plan phase W3).
      const covers = [...coverSources].slice(0, MAX_COVER_VIEWS).map((source, index) => ({ entry: source.view(camera), layer: coverViewLayer(index) }));
      for (const { entry, layer } of covers) if (entry) entry.camera.layers.mask = (1 << layer) | (1 << COVER_LAYER);
      if (batches.size === 0) return;
      const planes = planesOf(camera);
      if (!planes) return;
      camera.getWorldPosition(position);
      const origin: [number, number, number] = [position.x, position.y, position.z];
      const main: GpuCullView = { planes, origin, role: "main", layer: MAIN_VIEW_LAYER };
      const views: GpuCullView[] = [main];
      if (renderer.shadowMap.enabled) {
        let shadows = 0;
        for (const view of shadowViews) {
          const shadowPlanes = shadows >= MAX_SHADOW_VIEWS ? null : planesOf(view.camera);
          if (!shadowPlanes) continue;
          const layer = shadowViewLayer(++shadows);
          view.camera.layers.enable(layer);
          const caster = view.profile && view.cascade !== undefined ? {
            minCasterRadius: view.profile.texels[view.cascade - 1]! * view.profile.minTexels,
            casterProfile: view.profile, cascade: view.cascade,
          } : {};
          views.push({ planes: shadowPlanes, origin, role: "shadow", layer, ...caster });
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
      for (const { entry, layer } of covers) {
        if (!entry?.active) continue;
        const coverPlanes = planesOf(entry.camera);
        if (coverPlanes) views.push({ planes: coverPlanes, origin, role: "cover", layer });
      }
      const dispatches: ComputeNode[] = [];
      for (const [batch, parent] of batches) {
        // An empty batch still dispatches: its arguments go back to zero instances.
        if (!inScene(parent, scene)) continue;
        // A hidden zone's batch (R9b): no cull, its meshes stay hidden.
        if (batch.zoneMode === "hidden") continue;
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
      refreshCounts();
      return lastBatches.length > 0 ? triangles : 0;
    },
    stats() {
      let instances = 0, bundleUpdates = removedUpdates;
      for (const batch of batches.keys()) { instances += batch.instances.count; bundleUpdates += batch.bundleUpdates; }
      return { batches: batches.size, instances, draws, views: lastViews.length, bundleUpdates };
    },
    dispose() {
      instancedCasters.clear();
      zoneMasks.dispose?.();
      for (const batch of batches.keys()) batch.dispose();
      batches.clear();
      cameraSources.clear();
      coverSources.clear();
      lastBatches = [];
      lastViews = [];
    },
  };
}
