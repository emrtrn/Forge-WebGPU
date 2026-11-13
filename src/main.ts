// Application entry: boot the served project (architecture §4.7, §4.8).
// Engine features are collected from their folders, so a new feature changes
// no file here; the game module comes from the project (virtual module).
// Render bindings are collected the same way, from `features/*/render.ts`
// (phase 3 decision 2: `feature.ts` never names them), and handed to the
// render host through the level viewer.
//
// Quality: the player's stored graphics preferences (`forge.userSettings`)
// pick the profile; the runtime quality driver (hardware hint, one-time
// measurement, adaptive steps) feeds the renderer through the viewer.
//
// `?level=<project-relative folder>` opens another level than the project's
// start level (the render smoke and reference scenes use it); `?forceWebGL`
// is the labelled WebGL2 test mode (architecture §4.10), never a WebGPU run.
//
// Development only: `window.__forgeDev` pauses the frame loop and steps it at
// a fixed rate, pairing each frame with its GPU time and Sky Light captures,
// and starts World Environment transitions (the capture measurement, plan
// phase 3 step 7: `npm run measure:sky-capture`).

import type { FeatureDef } from "./core/index.ts";
import { createSaveClient, isJsonAssetType } from "./core/index.ts";
import { loadDevAssetUrls, assetUrlsFromIndex, type AssetUrls } from "./render/resources/assetUrls.ts";
import type { RenderBindingDef } from "./render/sync/renderBinding.ts";
import { benchmarkSkyCapture } from "./render/host/captureBench.ts";
import { createLevelViewer } from "./render/viewer/levelViewer.ts";
import { UserSettingsStore } from "./engine/persistence/userSettingsStore.ts";
import type { HardwareHintInputs } from "./engine/perf/hardwareHints.ts";
import { WorldEnvironmentKey } from "./engine/environment/worldEnvironmentRuntime.ts";
import { bootErrorView, bootGame, type BootRender } from "./runtime/boot.ts";
import { createBootScreen } from "./runtime/bootScreen.ts";
import { createLocalStorageAdapter } from "./runtime/persistence/localStorageAdapter.ts";
import { loadProjectLevel } from "./runtime/projectLevel.ts";
import { createRuntimeQuality } from "./runtime/quality/runtimeQuality.ts";
import { createSteppableScheduler } from "./runtime/steppableScheduler.ts";
import gameModule from "virtual:forge/game-module";

const featureModules = import.meta.glob<{ default: FeatureDef }>("./features/*/feature.ts", { eager: true });
const features = Object.keys(featureModules)
  .sort()
  .map((path) => featureModules[path]!.default);
// The renderer reads material assets with their type (render cannot import a feature).
const materialType = features.flatMap((feature) => feature.assetTypes).find((type) => type.name === "forge.material" && isJsonAssetType(type)) ?? null;
const bindingModules = import.meta.glob<{ default: RenderBindingDef }>("./features/*/render.ts", { eager: true });
const bindings = Object.keys(bindingModules)
  .sort()
  .map((path) => bindingModules[path]!.default);

const root = document.querySelector<HTMLElement>("#app") ?? document.body;
const viewport = document.querySelector<HTMLElement>("#viewport") ?? document.body;
const screen = createBootScreen(document, root);
const client = createSaveClient({ fetch: (input, init) => fetch(input, init as RequestInit | undefined) });
const strict = import.meta.env.DEV;
const params = new URLSearchParams(location.search);

async function assetUrls(): Promise<AssetUrls> {
  try {
    return await loadDevAssetUrls(async (url, headers) => {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json();
    });
  } catch (error) {
    // A production build has no dev server; its asset directory comes with the dist work (phase 4).
    if (strict) throw error;
    return assetUrlsFromIndex({}, (file) => file);
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Coarse browser hints for the starting profile (Forge's collectHardwareHints); the GPU from the WebGPU adapter. */
function hardwareHints(gpu: string | null): HardwareHintInputs {
  const touch = navigator.maxTouchPoints > 0 || "ontouchstart" in window || window.matchMedia("(pointer: coarse)").matches;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  return {
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGb: typeof memory === "number" ? memory : null,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    devicePixelRatio: window.devicePixelRatio,
    isTouch: touch,
    webglRenderer: gpu,
  };
}

async function start(): Promise<void> {
  let startLevel = "";
  try {
    const identity = await client.identity();
    document.title = identity.project.name ?? "Forge WebGPU";
    if (identity.project.problems.length > 0) {
      screen.error({ ...bootErrorView("project", new Error(identity.project.root)), details: identity.project.problems });
      return;
    }
    startLevel = params.get("level") ?? identity.project.startLevel;
  } catch (error) {
    screen.error(bootErrorView("project", error));
    return;
  }
  let urls: AssetUrls;
  try {
    urls = await assetUrls();
  } catch (error) {
    screen.error(bootErrorView("project", error));
    return;
  }
  const pageStorage = storage();
  const viewer = createLevelViewer({
    document,
    container: viewport,
    dev: import.meta.env.DEV,
    forceWebGL: params.has("forceWebGL"),
    bindings,
    assetUrls: urls,
    materialType: materialType && isJsonAssetType(materialType) ? materialType : null,
    storage: pageStorage,
  });
  let settingsStore: UserSettingsStore | null = null;
  try {
    settingsStore = pageStorage ? new UserSettingsStore({ storage: createLocalStorageAdapter(pageStorage) }) : null;
  } catch {
    settingsStore = null;
  }
  const quality = createRuntimeQuality({
    store: settingsStore,
    apply: (state) => viewer.setQuality(state),
    signals: () => viewer.signals() ?? { metrics: { frameTimeMs: 0, averageFrameTimeMs: 0, p95FrameTimeMs: 0, spikeCount: 0, sampleWindowSeconds: 0, sampleCount: 0, estimatedRefreshIntervalMs: 0 }, drawCalls: 0, triangles: 0, textures: 0 },
    log: (message) => console.info(`forge quality: ${message}`),
  });
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === settingsStore?.storageKey()) quality.storageChanged();
  });
  let lastFrame: number | null = null;
  const render: BootRender = {
    init: async () => {
      await viewer.init();
      quality.start(hardwareHints(viewer.gpuName()));
    },
    feature: (installed) => viewer.feature(installed),
    frame: (time) => {
      viewer.frame(time);
      if (lastFrame !== null) quality.tick((time - lastFrame) / 1000);
      lastFrame = time;
    },
    onLost: (listener) => viewer.onLost(listener),
    dispose: () => viewer.dispose(),
  };
  const scheduler = createSteppableScheduler(
    { request: (frame) => requestAnimationFrame(frame), cancel: (handle) => cancelAnimationFrame(handle) },
    () => performance.now(),
  );
  const booted = await bootGame({
    features,
    ...(gameModule ? { gameModule } : {}),
    render,
    strict,
    loadLevel: async (registry) => (startLevel === "" ? null : loadProjectLevel(client, startLevel, registry, strict)),
    screen,
    scheduler,
    warn: (issues) => console.warn("Level data report", issues),
  });
  if (import.meta.env.DEV && booted) {
    const environment = () => booted.world.services.get(WorldEnvironmentKey)?.controller ?? null;
    const transitions: { reached: boolean | null }[] = [];
    (window as unknown as { __forgeDev?: unknown }).__forgeDev = {
      pause: () => scheduler.pause(),
      resume: () => scheduler.resume(),
      /** One frame `ms` after the last: its CPU time, GPU time, Sky Light captures and hour. */
      async step(ms: number) {
        const before = viewer.host?.captures ?? { count: 0, cpuMs: 0 };
        const counted = { count: before.count, cpuMs: before.cpuMs };
        const started = performance.now();
        const ran = scheduler.step(ms);
        const cpuMs = performance.now() - started;
        const gpuMs = ran ? ((await viewer.host?.gpuTime()) ?? null) : null;
        const after = viewer.host?.captures ?? counted;
        return {
          ran,
          cpuMs,
          gpuMs,
          captures: after.count - counted.count,
          captureCpuMs: after.cpuMs - counted.cpuMs,
          hour: environment()?.current()?.hour ?? null,
          transitioning: environment()?.transitioning ?? false,
        };
      },
      /** Starts a transition; its outcome lands in `transitions[index]`. */
      transitionTo(request: { hour: number; seconds: number }) {
        const entry: { reached: boolean | null } = { reached: null };
        transitions.push(entry);
        void (environment()?.transitionTo(request) ?? Promise.resolve(false)).then((reached) => {
          entry.reached = reached;
        });
        return transitions.length - 1;
      },
      transitions,
      setHour: (hour: number) => environment()?.setHour(hour),
      /** The Sky Light capture alone, `count` times back to back (pause first). */
      captureBench: (count: number) => (viewer.host ? benchmarkSkyCapture(viewer.host, count) : Promise.resolve(null)),
    };
  }
}

void start();
