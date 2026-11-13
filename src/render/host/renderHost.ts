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
// - Device loss, v1 (phase 3 decision 10): drawing stops for good and the
//   listeners hear it; the page shows the renderer-free screen with "reload".
//   Rebuilding on a new device is a later decision.
// - Sky Light captures are counted with their CPU time (`captures`, the perf
//   witness's `skyCaptures`); `gpuTime()` resolves the last frame's GPU time,
//   so a stepped measurement can pair the two (plan phase 3 step 7).

import { PerspectiveCamera, PMREMGenerator, TimestampQuery, WebGPURenderer, type Camera } from "three/webgpu";
import type { FeatureDef, JsonAssetTypeDef } from "../../core/index.ts";
import { effectiveDevicePixelRatio, resolveQualitySettings, type QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { probeMrtBudget, type MrtProbeResult, type ProbeDevice } from "../pipeline/mrtProbe.ts";
import { createFramePipeline } from "../pipeline/renderPipeline.ts";
import type { AssetUrls } from "../resources/assetUrls.ts";
import { createGltfModelSource, type GltfModelSource } from "../resources/gltfModels.ts";
import { createResourceCache, type ResourceCache } from "../resources/resourceCache.ts";
import { createSurfaceMaterials } from "../resources/surfaceMaterials.ts";
import { createTerrainSource } from "../resources/terrains.ts";
import { createTextureSource } from "../resources/textures.ts";
import type { ModelSource } from "../resources/worldResources.ts";
import type { EnvironmentCapture, RenderBindingDef } from "../sync/renderBinding.ts";
import { createRenderFeature, type RenderWorld } from "../sync/renderWorld.ts";
import { mountBadge } from "./badge.ts";
import { readBackendProof, type BackendProof } from "./backendProof.ts";
import { createPerfSampler, type PerfQuality, type PerfSampler } from "./perfSampler.ts";

/** The effective quality the renderer draws with. */
export interface RenderQuality extends PerfQuality {
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

export interface RenderHostOptions {
  readonly document: Document;
  /** The element the canvas fills; its size is the drawing size. */
  readonly container: HTMLElement;
  /** Development: the badge always shows. */
  readonly dev: boolean;
  /** The labelled WebGL2 test mode (§4.10); never counts as a WebGPU run. */
  readonly forceWebGL?: boolean;
  readonly bindings: readonly RenderBindingDef[];
  readonly assetUrls: AssetUrls;
  /** The `forge.material` asset type, to read material assets (render cannot import the feature). */
  readonly materialType?: JsonAssetTypeDef | null;
  /** The device's pixels per CSS pixel; default the window's. */
  readonly devicePixelRatio?: () => number;
}

export interface RenderHost {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGPURenderer;
  readonly proof: BackendProof;
  /** The MRT budget on this device; null on the WebGL2 backend. */
  readonly mrtProbe: MrtProbeResult | null;
  readonly cache: ResourceCache;
  /** The world being drawn, once one attached. */
  readonly world: RenderWorld | null;
  /** The `forge.render` feature for a world that installs `features`. */
  feature(features: readonly FeatureDef[], name: string): FeatureDef;
  setCamera(camera: Camera): void;
  /** The effective quality (profile, adaptive reductions); applies the pixel ratio next frame. */
  setQuality(quality: RenderQuality): void;
  readonly quality: RenderQuality;
  /** Draws the presented world; `now` in ms. Does nothing once the device is lost. */
  frame(now: number): void;
  readonly perf: PerfSampler;
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

  const cache = createResourceCache();
  const gltf: GltfModelSource = createGltfModelSource(renderer, options.assetUrls);
  const materials = createSurfaceMaterials({
    urls: options.assetUrls,
    type: options.materialType ?? null,
    textures: createTextureSource(options.assetUrls, gltf.ktx2, () => renderer.getMaxAnisotropy()),
    textureOwner: cache.owner("material textures"),
    strict: options.dev,
  });
  const terrains = createTerrainSource({ urls: options.assetUrls, materials });
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
    if (renderer.shadowMap.enabled === quality.settings.shadowsEnabled) return;
    renderer.shadowMap.enabled = quality.settings.shadowsEnabled;
    world?.scene.traverse((object) => {
      const material = (object as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] }).material;
      if (!material) return;
      for (const one of Array.isArray(material) ? material : [material]) one.needsUpdate = true;
    });
  };
  let camera: Camera = new PerspectiveCamera();
  let world: RenderWorld | null = null;
  applyShadowSwitch();
  let width = 0;
  let height = 0;
  let lost = false;
  const lostListeners: ((message: string) => void)[] = [];

  const applySize = (): void => {
    const ratio = pixelRatio();
    if (ratio !== renderer.getPixelRatio()) renderer.setPixelRatio(ratio);
    const rect = container.getBoundingClientRect();
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
  }));

  return {
    canvas,
    renderer,
    proof,
    mrtProbe,
    cache,
    get world() {
      return world;
    },
    feature: (features, name) =>
      createRenderFeature({
        cache,
        models,
        materials,
        terrains,
        bindings: options.bindings,
        features,
        name,
        camera: () => camera,
        quality: () => quality.settings,
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
    setQuality(next) {
      quality = next;
      applyShadowSwitch();
    },
    get quality() {
      return quality;
    },
    frame(now) {
      if (lost || world === null) return;
      applySize();
      pipeline.render(world.scene, camera, world.output, quality.settings);
      perf.frame(now);
    },
    perf,
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
      observer.disconnect();
      badge?.remove();
      gltf.dispose();
      pmrem.dispose();
      pipeline.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
