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
// `?debug` mounts the diagnostics panel (render/viewer/debug), loaded only
// then, through a dynamic import.
//
// Development only: `?play=<id>` is the editor's Play (plan phase 4 step 8):
// the level and camera of that play session, read through its layer (the
// editor's unsaved files over the project's). A session the dev server no
// longer holds (it restarted) shows an information screen.
//
// Development only: `window.__forgeDev` pauses the frame loop and steps it at
// a fixed rate, pairing each frame with its GPU time and Sky Light captures,
// and starts World Environment transitions (the capture measurement, plan
// phase 3 step 7: `npm run measure:sky-capture`), and installs GPU-driven
// foliage batches for the render smoke (phase 5c step 5.1).

import type { CameraPose } from "./render/viewer/cameraPose.ts";
import type { DevGpuDriven } from "./render/gpu/gpuDrivenDev.ts";
import type { FeatureDef } from "./core/index.ts";
import { createSaveClient, createStaticContentClient, isJsonAssetType, LevelSettingsKey, STATIC_CONTENT_DIR, staticContentFile, type ContentClient, type LevelSettings } from "./core/index.ts";
import { loadDevAssetUrls, assetUrlsFromIndex, type AssetUrls } from "./render/resources/assetUrls.ts";
import type { RenderBindingDef } from "./render/sync/renderBinding.ts";
import { benchmarkSkyCapture } from "./render/host/captureBench.ts";
import { createLevelViewer } from "./render/viewer/levelViewer.ts";
import { parseStaticPath } from "./render/triangles/staticPath.ts";
import { UserSettingsStore } from "./engine/persistence/userSettingsStore.ts";
import type { HardwareHintInputs } from "./engine/perf/hardwareHints.ts";
import { WorldEnvironmentKey } from "./engine/environment/worldEnvironmentRuntime.ts";
import { CellStreamingKey } from "./runtime/streaming/cellStreaming.ts";
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
const pageFetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array }) =>
  fetch(input, init as RequestInit | undefined);
// Development reads (and the editor writes) through the dev server; a production build reads the
// static content tools/build-content.ts wrote under the page's base URL (plan phase 4 step 2b). The
// condition is a build-time constant, so the save client is not in a game build.
const pageClient: ContentClient = import.meta.env.DEV
  ? createSaveClient({ fetch: pageFetch })
  : createStaticContentClient({ fetch: pageFetch, baseUrl: import.meta.env.BASE_URL });
const strict = import.meta.env.DEV;
const params = new URLSearchParams(location.search);

async function assetUrls(): Promise<AssetUrls> {
  const fetchJson = async (url: string, headers: Record<string, string> = {}): Promise<unknown> => {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  };
  if (import.meta.env.DEV) return loadDevAssetUrls(fetchJson);
  const base = `${import.meta.env.BASE_URL.replace(/\/+$/, "")}/${STATIC_CONTENT_DIR}`;
  const body = (await fetchJson(`${base}/asset-files.json`)) as { assets?: Parameters<typeof assetUrlsFromIndex>[0] };
  return assetUrlsFromIndex(body.assets ?? {}, (file) => `${base}/${staticContentFile(file).split("/").map(encodeURIComponent).join("/")}`);
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
  let client = pageClient;
  let cameraPose: CameraPose | null = null;
  try {
    const identity = await client.identity();
    document.title = identity.project.name ?? "Forge WebGPU";
    if (identity.project.problems.length > 0) {
      screen.error({ ...bootErrorView("project", new Error(identity.project.root)), details: identity.project.problems });
      return;
    }
    startLevel = params.get("level") ?? identity.project.startLevel;
    // A build-time constant: a game build has no play sessions and no save client.
    const play = params.get("play");
    if (import.meta.env.DEV && play !== null) {
      const playing = createSaveClient({ fetch: pageFetch, play });
      const session = await playing.playSession(play);
      if (!session) {
        screen.info("Play session ended", "The dev server no longer holds this play session (it restarted). Press Play in the editor again.");
        return;
      }
      client = playing;
      startLevel = session.level;
      cameraPose = session.camera;
      document.title = `${identity.project.name ?? "Forge WebGPU"} · Play`;
    }
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
    ...(import.meta.env.DEV && params.get("buildingStreaming") === "off" ? { buildingStreaming: false } : {}),
    forceWebGL: params.has("forceWebGL"),
    // Development measurement (plan 5c R9.0): force the static batches' path.
    ...(import.meta.env.DEV && params.has("staticPath") ? { staticPath: parseStaticPath(params.get("staticPath")) } : {}),
    ...(import.meta.env.DEV && params.has("staticCell") ? { staticCellSize: Math.max(0, Number(params.get("staticCell")) || 0) } : {}),
    bindings,
    assetUrls: urls,
    materialType: materialType && isJsonAssetType(materialType) ? materialType : null,
    storage: pageStorage,
    cameraPose,
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
    streamingSources: () => [{ position: [viewer.camera.position.x, viewer.camera.position.z] }],
    busy: () => viewer.host?.cache.busy() ?? (() => {}),
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
  if (booted && params.has("debug")) {
    const { attachDebugPanel } = await import("./render/viewer/debug/debugPanel.ts");
    attachDebugPanel(document, {
      host: () => viewer.host,
      environment: () => booted.world.services.get(WorldEnvironmentKey)?.controller.current() ?? null,
    });
  }
  if (import.meta.env.DEV && booted) {
    const environment = () => booted.world.services.get(WorldEnvironmentKey)?.controller ?? null;
    let devGpu: Promise<DevGpuDriven> | null = null;
    let devHeavy: import("./render/gpu/heavyPropsDev.ts").DevHeavyProps | null = null;
    const devGpuDriven = () => (devGpu ??= import("./render/gpu/gpuDrivenDev.ts").then(({ createDevGpuDriven }) => createDevGpuDriven(() => viewer.host)));
    const transitions: { reached: boolean | null }[] = [];
    (window as unknown as { __forgeDev?: unknown }).__forgeDev = {
      /** Read-only dev access for selectable render-path probes (R7). */
      host: () => viewer.host,
      pause: () => scheduler.pause(),
      resume: () => scheduler.resume(),
      /** Phase 5b: cell streaming, HLOD proxies, the resource cache and the GPU's live objects in one snapshot (measure:streaming). */
      streaming() {
        const scene = viewer.host?.world?.scene;
        const proxies = scene?.getObjectByName("hlod")?.children ?? [];
        const memory = viewer.host?.renderer.info.memory;
        return {
          cells: booted.world.services.get(CellStreamingKey)?.snapshot() ?? null,
          hlod: { loaded: proxies.length, visible: proxies.filter((proxy) => proxy.visible).length },
          cache: viewer.host?.cache.stats() ?? null,
          gpu: memory ? { geometries: memory.geometries, textures: memory.textures } : null,
          camera: viewer.camera.position.toArray(),
        };
      },
      /** This frame's cell streaming work (ms) and active cells: cheap enough to read every frame. */
      streamingFrame() {
        const cells = booted.world.services.get(CellStreamingKey)?.snapshot();
        return cells ? { ms: cells.lastFrameMs, active: cells.active, actors: cells.actors, pending: viewer.host?.cache.stats().pending ?? 0 } : null;
      },
      /** Plan phase W3: the precipitation cover's draws so far and in the last frame; null without a world. */
      precipitationCover: () => viewer.host?.world?.cover?.stats ?? null,
      /** Moves the game camera (measure:streaming's route), looking at a point when given. */
      moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]) {
        viewer.camera.position.set(x, y, z);
        if (look) viewer.camera.lookAt(look[0], look[1], look[2]);
        viewer.camera.updateMatrixWorld();
      },
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
          submitMs: viewer.host?.renderSubmitMs ?? null,
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
      /** An actor of the running world (its id, name and transform); null when it is not there. The editor smoke reads Play with it. */
      actor: (id: string) => {
        const actor = booted.world.context.actor(id as Parameters<typeof booted.world.context.actor>[0]);
        return actor ? { id: actor.id, name: actor.name, transform: structuredClone(actor.transform) } : null;
      },
      setHour: (hour: number) => environment()?.setHour(hour),
      setSurface: (surface: { snowCoverage?: number; wetness?: number; puddleFill?: number; snowDepth?: number }) => environment()?.setSurface(surface),
      /** Plan phase W: the late layer (rain, snow) drawn or not, to compare in one session. */
      setLateVisible: (visible: boolean) => {
        const root = viewer.host?.world?.late?.root;
        if (root) root.visible = visible;
      },
      /** Plan phase W: the weather at once. */
      setWeather: (preset: "clear" | "cloudy" | "rain" | "snow" | "fog", intensity?: number) => environment()?.setWeather(preset, intensity),
      /** Plan phase W2: a timed weather change; its outcome lands in `transitions[index]`. */
      transitionWeather(request: { preset: "clear" | "cloudy" | "rain" | "snow" | "fog"; intensity?: number; seconds: number }) {
        const entry: { reached: boolean | null } = { reached: null };
        transitions.push(entry);
        void (environment()?.transitionWeather(request) ?? Promise.resolve(false)).then((reached) => {
          entry.reached = reached;
        });
        return transitions.length - 1;
      },
      /** Vegetation plan PG2: the season at once, or a timed change in simulation seconds. */
      setSeason: (season: "spring" | "summer" | "autumn" | "winter") => environment()?.setSeason(season),
      transitionSeason: (request: { season: "spring" | "summer" | "autumn" | "winter"; seconds: number }) => {
        void environment()?.transitionSeason(request);
      },
      environmentState: () => environment()?.current() ?? null,
      /** The Sky Light capture alone, `count` times back to back (pause first). */
      captureBench: (count: number) => (viewer.host ? benchmarkSkyCapture(viewer.host, count) : Promise.resolve(null)),
      /** Spawns actors from raw documents (normalised as an edit's); their ids. */
      spawn: (raw: unknown[]) => booted.world.context.spawnActors(raw).map((actor) => actor.id),
      /** Removes actors of the running world (plan phase W2: a level measured without its World Environment). */
      destroy: (ids: string[]) => booted.world.context.destroyActors(ids as Parameters<typeof booted.world.context.destroyActors>[0]),
      /** The ids of the actors that carry a World Environment. */
      worldEnvironmentActors: () => booted.world.context.componentsOf("forge.worldEnvironment").map((entry) => entry.actor.id),
      /** Plan 5c R9a: overrides level settings for this session (e.g. a test interior's). */
      levelSettings: (patch: Partial<LevelSettings>) => {
        const holder = booted.world.services.get(LevelSettingsKey);
        if (holder) holder.current = { ...holder.current, ...patch };
        return holder?.current ?? null;
      },
      /** World heights of the first drawn terrain at X / Z points (its live tiles); null off it or where no tile is loaded. */
      async terrainHeights(points: readonly (readonly [number, number])[]) {
        const scene = viewer.host?.world?.scene;
        const [{ taggedTerrainViews }, { terrainHeightAt }] = await Promise.all([import("./render/sync/debugTags.ts"), import("./engine/terrain/terrainHeightQuery.ts")]);
        const tagged = scene ? taggedTerrainViews(scene)[0] : undefined;
        return points.map(([x, z]) => (tagged ? terrainHeightAt(tagged.def, tagged.view.source, x, z) : null));
      },
      /** A puddle's fill outcome (plan phase 5a step 6); undefined before it has one. */
      async puddleResult(actor: string, key = "puddle") {
        const { PuddleStatusKey } = await import("./features/puddle/schema.ts");
        return booted.world.services.get(PuddleStatusKey)?.result(actor as Parameters<typeof booted.world.context.actor>[0], key);
      },
      /** G8 (plan phase 5a step 5): the drawn terrain read back from the GPU against its collider and its CPU twin; null without a terrain. */
      async terrainColliderMatch(options?: { size?: number }) {
        const host = viewer.host;
        if (!host) return null;
        const { measureTerrainColliderMatch } = await import("./render/viewer/debug/terrainColliderMatch.ts");
        return measureTerrainColliderMatch(host, options);
      },
      /** Phase 5c step 5.1: GPU-driven foliage batches from given instances, their GPU counts against the CPU reference. */
      gpuDriven: {
        install: async (types: Parameters<DevGpuDriven["install"]>[0], cullScale: number, castShadow?: boolean, bundle?: boolean) => (await devGpuDriven()).install(types, cullScale, castShadow, bundle),
        check: async () => (await devGpuDriven()).check(),
        level: async () => (await devGpuDriven()).level(),
        levelFar: async () => (await devGpuDriven()).levelFar(),
        levelVisible: async (visible: boolean) => (await devGpuDriven()).levelVisible(visible),
        levelActive: async (active: boolean) => (await devGpuDriven()).levelActive(active),
        stats: () => viewer.host?.gpuDriven.stats() ?? null,
        bundleRecords: async () => (await devGpuDriven()).bundleRecords(),
        remove: async () => (await devGpuDriven()).remove(),
        mirror: async (plane: Parameters<DevGpuDriven["mirror"]>[0]) => (await devGpuDriven()).mirror(plane),
      },
      /** Plan 5c R9b: the drawn world's zones after the last frame (zones, camera zone, visible, batches hidden / shadow only). */
      zones: () => viewer.host?.world?.zones?.stats() ?? null,
      /** Plan 5c R9a O5: high-poly props through the engine's static batch (`render/gpu/heavyPropsDev.ts`). */
      heavyProps: {
        install: async (matrices: number[], segments: number, path: "instanced" | "gpu" | "auto") => {
          const { createDevHeavyProps } = await import("./render/gpu/heavyPropsDev.ts");
          devHeavy ??= createDevHeavyProps(() => viewer.host);
          return devHeavy.install(matrices, segments, path);
        },
        remove: () => devHeavy?.remove(),
      },
      /** Vegetation plan PG1: path A of a stone material (every pixel in the shader) for the A / C measurement. */
      async proceduralStone(guid: string, metersPerRepeat?: number) {
        const scene = viewer.host?.world?.scene;
        if (!scene) return 0;
        const { applyProceduralStone } = await import("./render/materials/proceduralStoneDev.ts");
        return applyProceduralStone(scene, guid, metersPerRepeat);
      },
      /** Vegetation plan PG3: every foliage / plant batch draws this LOD at any distance (the impostor is the last); null: by screen size. */
      async foliageLod(lod: number | null) {
        const { setFoliageLodOverride } = await import("./render/foliage/foliageBatches.ts");
        setFoliageLodOverride(lod);
      },
      /** Plan 5c F3: fields laid over a Foliage Type as it is read (e.g. `far`, `family`); null removes them. The level's foliage grows again. */
      async foliageType(guid: string, patch: Record<string, unknown> | null) {
        const { setFoliageTypeOverride } = await import("./features/foliage/render.ts");
        setFoliageTypeOverride(guid, patch);
      },
    };
  }
}

// Development only: the editor UI kit's page, every component's generated form (plan phase 4 step 1).
// The condition is a build-time constant, so a production build drops the import and its chunk.
if (import.meta.env.DEV && params.has("editor-kit")) {
  void import("./editor/ui/gallery.ts").then(({ showKitGallery }) => showKitGallery(document, features));
} else if (import.meta.env.DEV && params.has("editor")) {
  void openEditor();
} else {
  void start();
}

/** Development only: the editor (plan phase 4), the project's start level or `?level=`. */
async function openEditor(): Promise<void> {
  try {
    const identity = await pageClient.identity();
    if (identity.project.problems.length > 0) {
      screen.error({ ...bootErrorView("project", new Error(identity.project.root)), details: identity.project.problems });
      return;
    }
    const level = params.get("level") ?? identity.project.startLevel;
    if (level === "") {
      screen.info("Nothing to open", "The project has no start level; open one with ?editor&level=<folder>.");
      return;
    }
    const urls = await assetUrls();
    const { startEditor } = await import("./editor/main.ts");
    await startEditor({
      document,
      features: [...features, ...(gameModule?.features ?? [])],
      bindings,
      client: createSaveClient({ fetch: pageFetch }),
      assetUrls: urls,
      materialType: materialType && isJsonAssetType(materialType) ? materialType : null,
      forceWebGL: params.has("forceWebGL"),
      projectName: identity.project.name ?? identity.project.id ?? "Project",
      level,
      readOnly: identity.project.readOnly,
    });
  } catch (error) {
    screen.error(bootErrorView("project", error));
  }
}
