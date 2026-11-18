// The renderer host (architecture §4.7, §4.9): one WebGPURenderer per page,
// the GPU device's resource cache, and the worlds it draws.
//
// - `WebGPURenderer` with timestamp tracking, a reversed depth buffer and
//   MSAA on the canvas (`antialias`: a level drawn without a post-process
//   pass gets it, as every Forge WebGL level did; user decision 2026-11-13;
//   the pipeline's scene pass has none, its anti-aliasing is TRAA / SMAA),
//   awaited `init()`, then the backend proof written on the canvas
//   (`data-forge-backend`, the full proof in `data-forge-backend-proof`), the
//   MRT budget probed on the device (`data-forge-mrt-probe`) and the badge.
// - Frames go through the frame pipeline (render/pipeline): rebuilt when the
//   plan (quality profile, Post Process switches), the world or the camera
//   changes, never per frame.
// - Size follows the container (ResizeObserver); the pixel ratio is asked
//   every frame, so a move to another monitor is picked up: the device ratio
//   capped and scaled by the quality settings (`effectiveDevicePixelRatio`).
// - Quality is handed in (`setQuality`, the runtime's quality driver); until
//   then the renderer runs at `DEFAULT_QUALITY_LEVEL`.
// - The camera is handed in (viewer, editor, game camera).
// - An overlay (the editor's drawing layer, plan phase 4 step 3) draws after
//   the frame, before the perf witness reads it: it gets the frame's scene,
//   camera and, when the frame went through the pipeline, its scene depth.
// - Device loss, v1 (phase 3 decision 10): drawing stops for good and the
//   listeners hear it; the page shows the renderer-free screen with "reload".
//   Rebuilding on a new device is a later decision.
// - Sky Light captures are counted with their CPU time (`captures`, the perf
//   witness's `skyCaptures`); `gpuTime()` resolves the last frame's GPU time,
//   so a stepped measurement can pair the two (plan phase 3 step 7).

import { Group, PerspectiveCamera, PMREMGenerator, TimestampQuery, WebGPURenderer, type Camera, type Object3D, type Scene, type Texture } from "three/webgpu";
import type { FeatureDef, JsonAssetTypeDef } from "../../core/index.ts";
import { effectiveDevicePixelRatio, resolveQualitySettings, type QualityExtensions, type QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { probeMrtBudget, type MrtProbeResult, type ProbeDevice } from "../pipeline/mrtProbe.ts";
import { createFramePipeline } from "../pipeline/renderPipeline.ts";
import type { AssetUrls } from "../resources/assetUrls.ts";
import { createGltfModelSource, type GltfModelSource } from "../resources/gltfModels.ts";
import { createResourceCache, type ResourceCache } from "../resources/resourceCache.ts";
import { disposeResource } from "../resources/disposeResource.ts";
import { createSurfaceMaterials } from "../resources/surfaceMaterials.ts";
import { createTerrainSource } from "../resources/terrains.ts";
import { createTextureSource } from "../resources/textures.ts";
import { createWorldResources, type JsonAssetSource, type ModelSource, type WorldResources } from "../resources/worldResources.ts";
import type { EnvironmentCapture, RenderBindingDef } from "../sync/renderBinding.ts";
import { createRenderFeature, type RenderWorld } from "../sync/renderWorld.ts";
import { mountBadge } from "./badge.ts";
import { readBackendProof, type BackendProof } from "./backendProof.ts";
import { createPerfSampler, type PerfQuality, type PerfSampler } from "./perfSampler.ts";
import { createGpuDriven, type GpuDrivenDrawing } from "../gpu/gpuDriven.ts";
import { createTriangleDrawing, type TriangleDrawing } from "../triangles/triangleDrawing.ts";
import { createTriangleSource } from "../triangles/triangleSource.ts";
import type { StaticPath } from "../triangles/staticPath.ts";

/** The effective quality the renderer draws with. */
export interface RenderQuality extends PerfQuality {
  /** A game's opt-in scales (Forge's fork-owned quality extensions); the view distance multiplier scales the camera's far plane. */
  readonly extensions?: QualityExtensions;
  readonly settings: QualitySettings;
}

/** Far plane of the Sky Light capture's cube camera (Forge's CAPTURE_FAR). */
const ENVIRONMENT_CAPTURE_FAR = 1000;

/** Sky Light captures so far and the CPU time they took. */
export interface CaptureStats {
  readonly count: number;
  readonly cpuMs: number;
}

/** Forge's renderer booted at Ultra's ratio (min(dpr, 2)) before any profile applied. */
export const DEFAULT_QUALITY_LEVEL = "ultra";

/** What an overlay draws a frame with. */
export interface OverlayFrame {
  readonly renderer: WebGPURenderer;
  /** The presented world's scene. */
  readonly scene: Scene;
  /** The frame's camera, unjittered again (TRAA clears its view offset after the pipeline). */
  readonly camera: Camera;
  /** The scene pass's depth; null when the frame was drawn straight to the canvas. */
  readonly sceneDepth: Texture | null;
}

/** Draws over the presented frame (the editor's drawing layer). */
export interface RenderOverlay {
  render(frame: OverlayFrame): void;
}

export interface RenderHostOptions {
  readonly document: Document;
  /** The element the canvas fills; its size is the drawing size. */
  readonly container: HTMLElement;
  /** Development: the badge always shows. */
  readonly dev: boolean;
  /** The labelled WebGL2 test mode (§4.10); never counts as a WebGPU run. */
  readonly forceWebGL?: boolean;
  /** Which static batches take the GPU-driven automatic LOD path (R9.4; `?staticPath=` measures); default `auto` (R9b S1). */
  readonly staticPath?: StaticPath;
  /** Static batches split by world cell of this size in metres (plan 5c R9a); default 0, off. */
  readonly staticCellSize?: number;
  readonly bindings: readonly RenderBindingDef[];
  readonly assetUrls: AssetUrls;
  /** The `forge.material` asset type, to read material assets (render cannot import the feature). */
  readonly materialType?: JsonAssetTypeDef | null;
  /** The device's pixels per CSS pixel; default the window's. */
  readonly devicePixelRatio?: () => number;
}

export interface RenderHost {
  /** Temporarily presents an editor preview on the same canvas/device. Release restores the level. */
  preview(container: HTMLElement, draw: (renderer: WebGPURenderer, width: number, height: number) => void): () => void;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGPURenderer;
  readonly proof: BackendProof;
  /** The MRT budget on this device; null on the WebGL2 backend. */
  readonly mrtProbe: MrtProbeResult | null;
  readonly cache: ResourceCache;
  /**
   * A typed view of the cache for a user that is no world (the editor's
   * thumbnails, plan phase 4 step 6b): the same model, material, terrain and
   * texture sources the worlds draw with.
   */
  resources(name: string): WorldResources;
  /** The world being drawn, once one attached. */
  readonly world: RenderWorld | null;
  /** The `forge.render` feature for a world that installs `features`. */
  feature(features: readonly FeatureDef[], name: string, options?: { readonly prepare?: boolean; readonly buildingStreaming?: boolean }): FeatureDef;
  /** CPU geometry queries may inspect batches while their GPU pipelines prepare. */
  preparingObjects(): readonly Object3D[];
  /** Shared serial warmup queue with the target scene's lights and MRT formats. */
  prepare(objects: readonly Object3D[], scene: Scene, signal?: AbortSignal): Promise<void>;
  setCamera(camera: Camera): void;
  readonly camera: Camera;
  /** Draws after every frame; null removes it. */
  setOverlay(overlay: RenderOverlay | null): void;
  /** The effective quality (profile, adaptive reductions); applies the pixel ratio next frame. */
  setQuality(quality: RenderQuality): void;
  readonly quality: RenderQuality;
  /** Draws the presented world; `now` in ms. Does nothing once the device is lost. */
  frame(now: number): void;
  readonly perf: PerfSampler;
  /** GPU-driven batches (phase 5c step 5): culled for the camera before each frame renders. */
  readonly gpuDriven: GpuDrivenDrawing;
  /** R7 selectable infrastructure; existing static bindings opt in at R9. */
  readonly triangles: TriangleDrawing;
  /** Automatic LOD loads served from the derived cache / produced by the worker so far (R9.0). */
  triangleCache(): { readonly hits: number; readonly generated: number };
  /** CPU wall time of the last frame's cull, render and overlay submission, ms (never GPU time). */
  readonly renderSubmitMs: number;
  /** Sky Light (PMREM) captures since the host started. */
  readonly captures: CaptureStats;
  /** The host's PMREM capture (the bindings get it as `ctx.capture`). */
  readonly capture: EnvironmentCapture;
  /**
   * GPU time (ms) of the renders since the last resolve, the last frame's
   * when several frames are pending; null without timestamp queries. Shares
   * three's pending resolve with the perf witness.
   */
  gpuTime(): Promise<number | null>;
  /** Called once if the GPU device is lost. */
  onDeviceLost(listener: (message: string) => void): void;
  readonly lost: boolean;
  dispose(): void;
}

export async function createRenderHost(options: RenderHostOptions): Promise<RenderHost> {
  const { document, container } = options;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display: block; width: 100%; height: 100%;";
  canvas.setAttribute("data-testid", "forge-canvas");
  container.append(canvas);

  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    trackTimestamp: true,
    reversedDepthBuffer: true,
    forceWebGL: options.forceWebGL === true,
  });
  try {
    await renderer.init();
  } catch (error) {
    canvas.remove();
    throw error;
  }
  const proof = readBackendProof(renderer, document.defaultView?.navigator.userAgent ?? "");
  canvas.dataset.forgeBackend = proof.backend;
  canvas.dataset.forgeBackendProof = JSON.stringify(proof);
  const device = (renderer.backend as unknown as { device?: ProbeDevice }).device;
  const mrtProbe = proof.isWebGPUBackend && device ? await probeMrtBudget(device) : null;
  if (mrtProbe) {
    canvas.dataset.forgeMrtProbe = JSON.stringify(mrtProbe);
    if (!mrtProbe.ok) console.error(`forge render: the full MRT set (${mrtProbe.bytes} bytes per sample) does not fit this device: ${mrtProbe.error}`);
  }
  const badge = mountBadge(document, container, proof, options.dev);

  // Evicted entries free their GPU objects; a material gives back its textures first (phase 5b step 5).
  let releaseMaterialTextures: (material: unknown) => void = () => {};
  const cache = createResourceCache({
    now: () => performance.now(),
    dispose: (key, value) => {
      if (key.startsWith("material:")) releaseMaterialTextures(value);
      disposeResource(key, value);
    },
  });
  const gltf: GltfModelSource = createGltfModelSource(renderer, options.assetUrls);
  const textures = createTextureSource(options.assetUrls, gltf.ktx2, () => renderer.getMaxAnisotropy());
  const materials = createSurfaceMaterials({
    urls: options.assetUrls,
    type: options.materialType ?? null,
    textures,
    textureOwner: cache.owner("material textures"),
    strict: options.dev,
  });
  releaseMaterialTextures = (material) => materials.releaseTextures(material);
  const terrains = createTerrainSource({ urls: options.assetUrls, materials });
  const jsonAssets: JsonAssetSource = {
    async load(guid) {
      const url = options.assetUrls.url(guid);
      if (url === null) throw new Error(`forge render: asset ${guid} is not in the asset index`);
      const response = await fetch(url, { headers: { ...options.assetUrls.headers } });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json() as Promise<unknown>;
    },
  };
  const models: ModelSource = {
    load: (guid) =>
      gltf.load(guid).catch((error: unknown) => {
        console.warn(`forge render: model ${guid} could not be loaded`, error);
        throw error;
      }),
  };

  const deviceRatio = options.devicePixelRatio ?? (() => document.defaultView?.devicePixelRatio ?? 1);
  let quality: RenderQuality = { settings: resolveQualitySettings(DEFAULT_QUALITY_LEVEL), level: DEFAULT_QUALITY_LEVEL, adaptive: false, reductionDepth: 0 };
  const pixelRatio = (): number => effectiveDevicePixelRatio(deviceRatio(), quality.settings);
  // The profile's master shadow switch. Lit materials are rebuilt when it flips
  // (Forge's invalidateMaterialsForShadowToggle: a program compiled for the
  // other state would sample a missing shadow map).
  const applyShadowSwitch = (): void => {
    const enabled = quality.settings.shadowsEnabled && world?.shadowsEnabled !== false;
    if (renderer.shadowMap.enabled === enabled) return;
    renderer.shadowMap.enabled = enabled;
    world?.scene.traverse((object) => {
      const material = (object as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] }).material;
      if (!material) return;
      for (const one of Array.isArray(material) ? material : [material]) one.needsUpdate = true;
    });
  };
  let camera: Camera = new PerspectiveCamera();
  let world: RenderWorld | null = null;
  let overlay: RenderOverlay | null = null;
  let previewSurface: HTMLElement | null = null;
  let previewDraw: ((renderer: WebGPURenderer, width: number, height: number) => void) | null = null;
  applyShadowSwitch();
  let width = 0;
  let height = 0;
  let lost = false;
  const warmups: { objects: readonly Object3D[]; scene: Scene; signal?: AbortSignal; resolve(): void; reject(error: unknown): void }[] = [];
  let compiling = false;
  const preparing = new Map<Object3D, { scene: Scene; signal?: AbortSignal }>();
  const prepare = (objects: readonly Object3D[], scene: Scene, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    const entry = { scene, ...(signal ? { signal } : {}) };
    for (const object of objects) preparing.set(object, entry);
    const clear = (): void => { for (const object of objects) preparing.delete(object); };
    warmups.push({ objects, scene, ...(signal ? { signal } : {}), resolve: () => { clear(); resolve(); }, reject: (error) => { clear(); reject(error); } });
  });
  const pumpWarmups = (): void => {
    if (compiling || lost) return;
    let work = warmups.shift();
    while (work?.signal?.aborted) { work.resolve(); work = warmups.shift(); }
    if (!work) return;
    const current = work;
    compiling = true;
    const staging = new Group(); staging.add(...work.objects); staging.updateMatrixWorld(true);
    const culling = work.objects.map((object) => object.frustumCulled);
    for (const object of work.objects) object.frustumCulled = false;
    // The batch is detached from the visible scene; the target scene supplies
    // its lights/environment and the frame pipeline supplies the pass formats.
    const compiled = previewDraw ? renderer.compileAsync(staging, camera, work.scene) : pipeline.compile(staging, work.scene, camera);
    work.objects.forEach((object, index) => { object.frustumCulled = culling[index]!; });
    void compiled.then(() => {
      staging.clear();
      current.resolve();
    }, (error: unknown) => {
      staging.clear();
      if (current.signal?.aborted) {
        current.resolve();
      } else current.reject(error);
    }).finally(() => { compiling = false; });
  };
  const lostListeners: ((message: string) => void)[] = [];

  const applySize = (): void => {
    const ratio = pixelRatio();
    if (ratio !== renderer.getPixelRatio()) renderer.setPixelRatio(ratio);
    const rect = (previewSurface ?? container).getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    if (camera instanceof PerspectiveCamera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  };
  const observer = new ResizeObserver(() => applySize());
  observer.observe(container);

  renderer.onDeviceLost = (info) => {
    if (lost) return;
    lost = true;
    const message = `${info.api} device lost: ${info.message}${info.reason ? ` (${info.reason})` : ""}`;
    console.error(`forge render: ${message}`);
    canvas.style.visibility = "hidden";
    for (const listener of lostListeners) listener(message);
  };

  const pipeline = createFramePipeline(renderer);
  const gpuDriven = createGpuDriven(renderer);
  const triangleSource = createTriangleSource(options.dev);
  const triangles = createTriangleDrawing(renderer, gpuDriven, triangleSource);
  // R9b S1: heavy parts draw GPU-driven with automatic LOD, light ones instanced (`staticPath.ts`).
  const staticPath: StaticPath = options.staticPath ?? "auto";
  // Plan 5c R9a step a: off by default (`?staticCell=` measures); R9b Z3 splits by zone instead.
  const staticCellSize = options.staticCellSize ?? 0;
  // The Sky Light capture (Forge's captureSkyEnvironment): the scene seen from
  // its origin, prefiltered into a PMREM. A render target never gets the
  // output's tone mapping, so the map stays linear.
  const pmrem = new PMREMGenerator(renderer);
  const captures = { count: 0, cpuMs: 0 };
  const counted = <T>(run: () => T): T => {
    const started = performance.now();
    const result = run();
    captures.count += 1;
    captures.cpuMs += performance.now() - started;
    return result;
  };
  const capture: EnvironmentCapture = {
    capture(scene, size) {
      const target = counted(() => pmrem.fromScene(scene, 0, 0.1, ENVIRONMENT_CAPTURE_FAR, { size }));
      return {
        texture: target.texture,
        recapture: (next) => void counted(() => pmrem.fromScene(next, 0, 0.1, ENVIRONMENT_CAPTURE_FAR, { size, renderTarget: target })),
        dispose: () => target.dispose(),
      };
    },
  };
  let renderSubmitMs = 0;
  const perf = createPerfSampler(renderer, proof, () => quality, (json) => {
    canvas.dataset.forgePerf = json;
  }, () => ({
    pipeline: pipeline.plan.direct ? "direct" : pipeline.plan.passes.join(","),
    mrt: pipeline.plan.mrt.map((target) => target.name).join(","),
    mrtBytes: pipeline.plan.mrtBytes,
    pipelineBuilds: pipeline.builds,
    toneMapping: world?.output.toneMapping ?? null,
    exposure: world ? Math.round(world.output.exposure * 1e4) / 1e4 : null,
    mrtProbeBytes: mrtProbe?.bytes ?? null,
    mrtProbeLimit: mrtProbe?.limit ?? null,
    mrtProbeOk: mrtProbe?.ok ?? null,
    skyCaptures: captures.count,
    renderSubmitMs,
  }), () => gpuDriven.lastDraws, () => gpuDriven.uncountedTriangles());

  return {
    preview(surface, draw) {
      if (previewSurface) throw new Error("Only one asset preview can own the renderer.");
      const previousWorld = world;
      const previousCamera = camera;
      const parent = canvas.parentNode!, next = canvas.nextSibling;
      previewSurface = surface; previewDraw = draw;
      surface.append(canvas);
      observer.observe(surface);
      width = height = 0;
      applySize();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        observer.unobserve(surface);
        previewSurface = null; previewDraw = null; world = previousWorld; camera = previousCamera;
        parent.insertBefore(canvas, next?.parentNode === parent ? next : null);
        width = height = 0;
        applySize();
        canvas.dataset.assetPreviewMemory = JSON.stringify(renderer.info.memory);
      };
    },
    canvas,
    renderer,
    proof,
    mrtProbe,
    cache,
    get world() {
      return world;
    },
    prepare,
    preparingObjects: () => [...preparing].filter(([, entry]) => entry.scene === world?.scene && !entry.signal?.aborted).map(([object]) => object),
    feature: (features, name, featureOptions) =>
      createRenderFeature({
        cache,
        models,
        materials,
        terrains,
        textures,
        jsonAssets,
        bindings: options.bindings,
        cameraViews: gpuDriven,
        gpuDriven,
        staticCellSize: () => staticCellSize,
        buildingStreaming: featureOptions?.buildingStreaming === true,
        modelBounds: (guid) => options.assetUrls.modelBounds?.(guid) ?? null,
        features,
        name,
        camera: () => camera,
        // The LOD path's readiness waits on compileAsync: only worlds that prepare take it.
        ...(featureOptions?.prepare === false ? {} : { prepare, triangles, staticPath: () => staticPath }),
        quality: () => quality.settings,
        viewDistanceMultiplier: () => quality.extensions?.viewDistanceMultiplier ?? 1,
        capture,
        attach: (attached) => {
          world = attached;
        },
        detach: (detached) => {
          if (world === detached) world = null;
        },
      }),
    setCamera(next) {
      camera = next;
      width = 0;
      height = 0;
      applySize();
    },
    get camera() {
      return camera;
    },
    resources: (name) => createWorldResources(cache, name, models, materials, terrains, textures, jsonAssets),
    setOverlay(next) {
      overlay = next;
    },
    setQuality(next) {
      quality = next;
      applyShadowSwitch();
    },
    get quality() {
      return quality;
    },
    frame(now) {
      if (lost) return;
      // compileAsync resumes between frames with its captured pass state.
      // The presented frame always starts at the canvas, outside an MRT pass.
      renderer.setRenderTarget(null); renderer.setMRT(null);
      if (previewDraw) { applySize(); previewDraw(renderer, width, height); pumpWarmups(); return; }
      if (world === null) return;
      applySize();
      cache.update();
      applyShadowSwitch();
      if (options.dev) canvas.dataset.forgeShadows = String(renderer.shadowMap.enabled);
      const submitted = performance.now();
      // Plan 5c R9b: each zoned batch's mode and the GPU-driven zone masks for this camera, before the LOD update and the cull read them.
      world.zones?.update(camera);
      gpuDriven.setZoneMasks(world.zones?.masks ?? null);
      triangles.update(camera, quality.settings.foliageCullDistanceScale, world.zones ?? null);
      gpuDriven.cull(world.scene, camera, quality.settings.shadowCasterMinTexels);
      pipeline.render(world.scene, camera, world.output, quality.settings);
      overlay?.render({ renderer, scene: world.scene, camera, sceneDepth: pipeline.sceneDepth });
      // CPU wall time for render traversal / encoding / submission; never GPU execution time.
      renderSubmitMs = performance.now() - submitted;
      perf.frame(now);
      pumpWarmups();
    },
    perf,
    gpuDriven,
    triangles,
    triangleCache: () => triangleSource.stats(),
    get renderSubmitMs() { return renderSubmitMs; },
    captures,
    capture,
    async gpuTime() {
      if (!proof.timestampQuery || lost) return null;
      const ms = await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
      return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
    },
    onDeviceLost(listener) {
      lostListeners.push(listener);
    },
    get lost() {
      return lost;
    },
    dispose() {
      for (const work of warmups.splice(0)) work.reject(new Error("Render host disposed during warmup"));
      observer.disconnect();
      badge?.remove();
      gltf.dispose();
      pmrem.dispose();
      pipeline.dispose();
      triangles.dispose();
      triangleSource.dispose();
      gpuDriven.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
