// The renderer host (architecture §4.7, §4.9): one WebGPURenderer per page,
// the GPU device's resource cache, and the worlds it draws.
//
// - `WebGPURenderer` with timestamp tracking, a reversed depth buffer and no
//   MSAA (anti-aliasing is the pipeline's), awaited `init()`, then the backend
//   proof written on the canvas (`data-forge-backend`, the full proof in
//   `data-forge-backend-proof`) and the badge.
// - Size follows the container (ResizeObserver); the pixel ratio is asked
//   every frame, so a move to another monitor is picked up: the device ratio
//   capped and scaled by the quality settings (`effectiveDevicePixelRatio`).
// - Quality is handed in (`setQuality`, the runtime's quality driver); until
//   then the renderer runs at `DEFAULT_QUALITY_LEVEL`.
// - The camera is handed in (viewer, editor, game camera).
// - Device loss, v1 (phase 3 decision 10): drawing stops for good and the
//   listeners hear it; the page shows the renderer-free screen with "reload".
//   Rebuilding on a new device is a later decision.

import { PerspectiveCamera, WebGPURenderer, type Camera } from "three/webgpu";
import type { FeatureDef } from "../../core/index.ts";
import { effectiveDevicePixelRatio, resolveQualitySettings, type QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { createDirectPipeline } from "../pipeline/directPipeline.ts";
import type { AssetUrls } from "../resources/assetUrls.ts";
import { createGltfModelSource, type GltfModelSource } from "../resources/gltfModels.ts";
import { createResourceCache, type ResourceCache } from "../resources/resourceCache.ts";
import type { ModelSource } from "../resources/worldResources.ts";
import type { RenderBindingDef } from "../sync/renderBinding.ts";
import { createRenderFeature, type RenderWorld } from "../sync/renderWorld.ts";
import { mountBadge } from "./badge.ts";
import { readBackendProof, type BackendProof } from "./backendProof.ts";
import { createPerfSampler, type PerfQuality, type PerfSampler } from "./perfSampler.ts";

/** The effective quality the renderer draws with. */
export interface RenderQuality extends PerfQuality {
  readonly settings: QualitySettings;
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
  /** The device's pixels per CSS pixel; default the window's. */
  readonly devicePixelRatio?: () => number;
}

export interface RenderHost {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGPURenderer;
  readonly proof: BackendProof;
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
    antialias: false,
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
  const badge = mountBadge(document, container, proof, options.dev);

  const cache = createResourceCache();
  const gltf: GltfModelSource = createGltfModelSource(renderer, options.assetUrls);
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
  let camera: Camera = new PerspectiveCamera();
  let world: RenderWorld | null = null;
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

  const pipeline = createDirectPipeline(renderer);
  const perf = createPerfSampler(renderer, proof, () => quality, (json) => {
    canvas.dataset.forgePerf = json;
  });

  return {
    canvas,
    renderer,
    proof,
    cache,
    get world() {
      return world;
    },
    feature: (features, name) =>
      createRenderFeature({
        cache,
        models,
        bindings: options.bindings,
        features,
        name,
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
    },
    get quality() {
      return quality;
    },
    frame(now) {
      if (lost || world === null) return;
      applySize();
      pipeline.render(world.scene, camera);
      perf.frame(now);
    },
    perf,
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
      pipeline.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
