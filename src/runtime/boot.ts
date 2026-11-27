// Booting the game (architecture §4.7; F10): features -> registry -> render ->
// level -> world -> frame loop. A failure at any stage is shown on the boot
// screen, which needs no renderer: an error before the renderer exists is
// still seen. An error in a frame stops the loop and shows the same screen.
//
// The render stage is optional (phase 3 decision 2): a headless boot (Node,
// check:projects) has none and its world runs without render. With one, the
// renderer initialises before the level loads, the world installs the
// render's `forge.render` feature after every other feature, and each frame
// draws after the world ticked. When the GPU device is lost the loop stops
// for good and the screen offers a reload (decision 10).
//
// Everything that touches the page is handed in (the screen, the frame
// scheduler), so boot runs and is tested in Node too.

import {
  createSchemaRegistry,
  defineFeature,
  installFeatures,
  normalizeLevel,
  type ClassResolver,
  type FeatureDef,
  type Issue,
  type SchemaRegistry,
} from "../core/index.ts";
import { assembleActors, assembleLevel } from "./assembler.ts";
import { CellStreamingKey, createCellStreaming, type CellSource, type CellStreaming } from "./streaming/cellStreaming.ts";
import type { StreamingSource } from "../engine/world/streamingPolicy.ts";
import { HlodSourceKey } from "../engine/world/hlod.ts";
import type { HlodIndex } from "../core/level/hlod.ts";
import type { LevelFoliageIndex } from "../core/level/foliage.ts";
import { LevelFoliageSourceKey } from "../engine/foliage/levelFoliageSource.ts";
import { PhysicsRuntimeKey, PreparedPhysicsKey, WORLD_PHYSICS_ID, type ModelCollisionGeometry, type ModelCollisionSource } from "../engine/physics/physicsService.ts";
import { loadRapier } from "../engine/physics/physicsSubsystem.ts";
import { InputHostKey, type InputHost } from "../engine/input/inputService.ts";
import { BehaviorDefinitionsKey } from "../engine/behavior/worldBehavior.ts";
import { WorldAudioHostKey, type WorldAudioHost } from "../engine/audio/worldAudio.ts";
import { TerrainResidencyKey, type HeadlessTerrainSource } from "../engine/terrain/terrainResidency.ts";
import { gameModuleSubsystem, type GameModuleDef } from "./gameModule.ts";
import { installWorldCheckpoint, type CheckpointOptions } from "./persistence/worldCheckpoint.ts";
import { BrowserUiHostKey, type BrowserUiHost } from "./ui/uiHost.ts";
import { WorldJsonAssetsKey, type WorldJsonLoader } from "../engine/world/worldAssets.ts";
import { LoadProgressTracker } from "../engine/loading/loadProgress.ts";
import type { FrameCaptureListener } from "../engine/perf/frameCapture.ts";
import { TimeControlKey } from "../engine/time/timeControl.ts";
import { createWorld, WorldError, type World } from "./world.ts";

export type BootStage = "project" | "features" | "render" | "level" | "world" | "frame";

export interface BootErrorView {
  readonly title: string;
  readonly message: string;
  /** One line per issue, then the stack when there is one. */
  readonly details: readonly string[];
  /** The screen offers to reload the page (the GPU device was lost). */
  readonly reload?: boolean;
}

export interface BootScreen {
  info(title: string, message: string): void;
  progress?(message: string, fraction: number): void;
  error(view: BootErrorView): void;
  /** The game is running: the screen gets out of the way. */
  clear(): void;
}

export interface FrameScheduler {
  /** Calls `frame` with a timestamp in milliseconds; returns a handle for `cancel`. */
  request(frame: (time: number) => void): number;
  cancel(handle: number): void;
}

/** The render stage (src/render's level viewer has this shape). */
export interface BootRender {
  /** Creates the renderer; a failure stops the boot at the "render" stage. */
  init(): Promise<void>;
  /** The `forge.render` feature for a world that installs `features`. */
  feature(features: readonly FeatureDef[]): FeatureDef;
  /** Draws a frame after the world ticked; `time` in ms. */
  frame(time: number, world: World): void;
  ready?(): boolean;
  /** Called once if the GPU device is lost. */
  onLost(listener: (message: string) => void): void;
  dispose(): void;
  /** Where cells stream around (the camera until phase 6's player); none streams nothing. */
  streamingSources?(): readonly StreamingSource[];
  /** Holds the ready signal while the returned release is not called (cells loading). */
  busy?(): () => void;
  /** The quality's view distance multiplier now. */
  viewDistanceMultiplier?(): number;
}

export interface LoadedLevel {
  /** The level document as read (it is normalised here). */
  readonly level: unknown;
  readonly resolveClass?: ClassResolver;
  /**
   * The level's cells, when they stream (phase 5b): `level` is then the
   * persistent layer. With a renderer they stream around its sources; a
   * headless boot adds them all at once.
   */
  readonly cells?: CellSource;
  /** The level's HLOD proxies (phase 5b), drawn for streamed cells that are not active. */
  readonly hlod?: { readonly index: HlodIndex; load(file: string): Promise<ArrayBuffer | null> };
  /** The level's painted foliage (plan 5c F4): its index and cell files, streamed by the foliage binding. */
  readonly foliage?: { readonly index: LevelFoliageIndex; load(file: string): Promise<ArrayBuffer | null> };
}

export interface BootOptions {
  /** Engine features; the game module's come after them. */
  readonly features: readonly FeatureDef[];
  readonly gameModule?: GameModuleDef;
  /** The renderer; none in a headless boot. */
  readonly render?: BootRender;
  readonly input?: InputHost;
  readonly audio?: WorldAudioHost;
  readonly ui?: BrowserUiHost;
  readonly loadJsonAsset?: WorldJsonLoader;
  /** Resolved model bounds and authored collision settings, independent of the renderer. */
  readonly modelCollision?: ModelCollisionSource;
  readonly modelGeometry?: ModelCollisionGeometry;
  /** Reads all tiles for a headless start, before the first physics step. */
  readonly headlessTerrain?: HeadlessTerrainSource;
  readonly checkpoint?: CheckpointOptions;
  /** True in development: data loss stops the boot. */
  readonly strict: boolean;
  /** Null when there is nothing to open. Gets the registry the features were installed into. */
  readonly loadLevel: (registry: SchemaRegistry) => Promise<LoadedLevel | null>;
  readonly screen: BootScreen;
  readonly scheduler: FrameScheduler;
  /** Supplying a millisecond clock enables CPU frame profiling for diagnostics. */
  readonly frameProfileClock?: () => number;
  /** Warnings that did not stop the boot (a production build's data report). */
  readonly warn?: (issues: readonly Issue[]) => void;
}

export interface RunningGame {
  readonly world: World;
  /** In diagnostics mode, delivers the next completed frame once. */
  readonly armFrameCapture?: (listener: FrameCaptureListener) => void;
  /** Stops the loop and disposes the world. */
  stop(): void;
}

const STAGE_TITLE: Record<BootStage, string> = {
  project: "The project cannot be opened",
  features: "The engine's features could not be installed",
  render: "The renderer could not be started",
  level: "The level could not be loaded",
  world: "The world could not be started",
  frame: "The game stopped",
};

function issueLine(issue: Issue): string {
  return `${issue.severity} ${issue.code}${issue.path === "" ? "" : ` ${issue.path}`}: ${issue.message}`;
}

/** What the boot screen shows for an error: pure, so it is tested without a page. */
export function bootErrorView(stage: BootStage, error: unknown, issues: readonly Issue[] = []): BootErrorView {
  const all = [...issues, ...(error instanceof WorldError ? error.issues : [])];
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? error.stack.split("\n").slice(1).map((line) => line.trim()) : [];
  return { title: STAGE_TITLE[stage], message, details: [...all.map(issueLine), ...stack] };
}

class StageError extends Error {
  readonly issues: readonly Issue[];
  constructor(message: string, issues: readonly Issue[]) {
    super(message);
    this.issues = issues;
  }
}

/** Returns the running game, or null when the boot stopped (the screen says why). */
export async function bootGame(options: BootOptions): Promise<RunningGame | null> {
  const { screen, render } = options;
  let stage: BootStage = "features";
  let world: World | null = null;
  let streaming: CellStreaming | null = null;
  let checkpoint: ReturnType<typeof installWorldCheckpoint> | null = null;
  const progress = new LoadProgressTracker();
  progress.expectAll(render?.ready ? ["features", "render", "level", "world", "assets"] : ["features", "render", "level", "world"]);
  const update = (message: string, completed?: string) => {
    if (completed) progress.markLoaded(completed);
    screen.progress?.(message, progress.snapshot().fraction);
  };
  try {
    update("Preparing engine features");
    const features = [...options.features, ...(options.gameModule?.features ?? [])];
    if (options.gameModule) {
      features.push(defineFeature({ id: options.gameModule.id, subsystems: [gameModuleSubsystem(options.gameModule)] }));
    }
    const registry = createSchemaRegistry();
    installFeatures(features, registry);

    if (render) {
      stage = "render";
      update("Preparing graphics", "features");
      await render.init();
    } else {
      progress.markLoaded("features");
    }

    stage = "level";
    update("Reading level", "render");
    const loaded = await options.loadLevel(registry);
    if (loaded === null) {
      if (render) disposeRenderQuietly(render);
      screen.info("Nothing to open", "No project is open. The project contract (samples/starter) brings the first one.");
      return null;
    }
    const resolveClass: ClassResolver = loaded.resolveClass ?? (() => undefined);
    const level = normalizeLevel(loaded.level, { strict: options.strict, registry, resolveClass });
    if (!level.ok || !level.value) {
      throw new StageError("The level has errors.", level.issues);
    }
    const warnings = level.issues.filter((issue) => issue.severity === "warning");

    stage = "world";
    update("Starting the world", "level");
    const needsPhysics = features.some((feature) => feature.subsystems.some((subsystem) => subsystem.id === WORLD_PHYSICS_ID));
    const rapier = needsPhysics ? await loadRapier() : undefined;
    // The render feature comes last: its renderSync runs after everything moved.
    const worldFeatures = render ? [...features, render.feature(features)] : features;
    world = createWorld({ strict: options.strict, registry, resolveClass, features: worldFeatures });
    if (options.input) world.services.provide(InputHostKey, options.input);
    if (options.audio) world.services.provide(WorldAudioHostKey, options.audio);
    if (options.ui) world.services.provide(BrowserUiHostKey, options.ui);
    if (options.loadJsonAsset) world.services.provide(WorldJsonAssetsKey, options.loadJsonAsset);
    world.services.provide(BehaviorDefinitionsKey, new Map(options.gameModule?.behaviors?.map((entry) => [entry.id, entry])));
    if (rapier) world.services.provide(PreparedPhysicsKey, {
      rapier, ...(options.modelCollision ? { model: options.modelCollision } : {}),
      ...(options.modelGeometry ? { triangles: options.modelGeometry } : {}),
    });
    if (options.checkpoint) checkpoint = installWorldCheckpoint(world, level.value.id, {
      registry, resolveClass, strict: options.strict,
    }, options.checkpoint);
    world.init();
    const initial = checkpoint ? { ...level.value, actors: checkpoint.persistentActors(level.value.actors) } : level.value;
    const assembled = assembleLevel(world, initial, { strict: options.strict, resolveClass });
    // A missing class is already reported by normalisation; report it once.
    const seen = new Set(warnings.map((issue) => `${issue.code} ${issue.path}`));
    warnings.push(...assembled.issues.filter((issue) => !seen.has(`${issue.code} ${issue.path}`)));
    // Painted foliage streams with the camera in the foliage binding (plan 5c F4), not with the cells' actors: a level
    // whose actors are all in the persistent layer has no cell streaming and may have foliage (5d step 6).
    if (loaded.foliage && render) world.services.provide(LevelFoliageSourceKey, { index: loaded.foliage.index, load: loaded.foliage.load });
    if (loaded.cells && render?.streamingSources) {
      const live = world;
      streaming = createCellStreaming({
        world: live,
        source: loaded.cells,
        level: level.value.id,
        ...(checkpoint ? { ledger: checkpoint.ledger } : {}),
        registry,
        resolveClass,
        strict: options.strict,
        settings: () => level.value!.settings,
        ...(render.viewDistanceMultiplier ? { viewDistanceMultiplier: () => render.viewDistanceMultiplier!() } : {}),
        ...(render.busy ? { busy: () => render.busy!() } : {}),
        warn: (message, issues) => options.warn?.(issues && issues.length > 0 ? issues : [{ code: "invalid-document", severity: "warning", path: "", message }]),
        clock: () => (typeof performance === "undefined" ? Date.now() : performance.now()),
      });
      if (streaming) {
        const active = streaming;
        live.services.provide(CellStreamingKey, active);
        if (loaded.hlod) live.services.provide(HlodSourceKey, { index: loaded.hlod.index, load: loaded.hlod.load, isCellActive: (key) => active.isCellActive(key) });
      }
    } else if (loaded.cells) {
      // No renderer: no camera to stream around; the whole level is assembled (headless checks).
      const signal = new AbortController().signal;
      for (const key of loaded.cells.cells) {
        const read = await loaded.cells.read(key, signal);
        warnings.push(...read.issues.filter((issue) => issue.severity === "warning"));
        if (options.strict && read.issues.some((issue) => issue.severity === "error")) throw new StageError(`Cell ${key} has errors.`, read.issues);
        const actors = checkpoint?.persistentActors(read.payload.actors) ?? read.payload.actors;
        warnings.push(...assembleActors(world, actors, { strict: options.strict, resolveClass }).issues);
      }
    }
    if (!render && rapier && options.headlessTerrain) {
      const residency = world.services.get(TerrainResidencyKey);
      if (residency) {
        const documents = new Map<string, ReturnType<HeadlessTerrainSource>>();
        for (const { actor, key, component } of world.context.componentsOf("forge.terrain")) {
          const asset = component.data;
          if (typeof asset !== "string") continue;
          let document = documents.get(asset);
          if (!document) documents.set(asset, document = options.headlessTerrain(asset));
          residency.place({ actor: actor.id, component: key, document: await document });
        }
      }
    }
    checkpoint?.restoreSpawned();
    if (checkpoint) warnings.push(...checkpoint.issues);
    await world.services.get(PhysicsRuntimeKey)?.ready();
    if (warnings.length > 0) options.warn?.(warnings);
    world.beginPlay();
  } catch (error) {
    streaming?.dispose();
    if (world !== null) disposeQuietly(world);
    if (render) disposeRenderQuietly(render);
    screen.error(bootErrorView(stage, error, error instanceof StageError ? error.issues : []));
    return null;
  }

  const running = world;
  const now = options.frameProfileClock;
  const profile = now ? { now, profiler: running.enableProfiling(now) } : undefined;
  let sceneSeconds = 0;
  let armedCapture: FrameCaptureListener | undefined;
  let handle: number | null = null;
  let last: number | null = null;
  let halted = false;
  let waitingForAssets = typeof render?.ready === "function";
  const halt = (view: BootErrorView): void => {
    halted = true;
    armedCapture = undefined;
    waitingForAssets = false;
    if (handle !== null) options.scheduler.cancel(handle);
    handle = null;
    if (running.state === "playing") {
      try {
        running.endPlay("error");
      } catch {
        // the world may be in no state to end; the report below is what matters
      }
    }
    screen.error(view);
  };
  const frame = (time: number): void => {
    handle = null;
    if (halted) return;
    const dt = last === null ? 0 : (time - last) / 1000;
    last = time;
    try {
      const frameStart = profile?.now() ?? 0;
      if (streaming && render?.streamingSources) streaming.update(render.streamingSources());
      checkpoint?.restoreSpawned();
      const listener = armedCapture;
      armedCapture = undefined;
      const timeControl = listener ? running.services.get(TimeControlKey) : undefined;
      const paused = timeControl?.paused ?? false;
      const timeScale = timeControl?.timeScale ?? 1;
      const advanced = running.tick(dt);
      if (render) {
        const renderStart = profile?.now() ?? 0;
        render.frame(time, running);
        if (profile) profile.profiler.record("render", profile.now() - renderStart);
      }
      if (waitingForAssets && render?.ready?.()) {
        waitingForAssets = false;
        progress.markLoaded("assets");
        screen.clear();
      }
      if (profile) {
        sceneSeconds += advanced;
        profile.profiler.recordFrame(profile.now() - frameStart);
        if (listener && !halted) {
          const captured = profile.profiler.captureFrame();
          const context = { sceneSeconds, paused, timeScale };
          // Building the table happens outside the frame it describes.
          queueMicrotask(() => { if (!halted) listener(captured, context); });
        }
        profile.profiler.endFrame();
      }
    } catch (error) {
      halt(bootErrorView("frame", error));
      return;
    }
    handle = options.scheduler.request(frame);
  };
  render?.onLost((message) => {
    if (!halted) halt({ ...bootErrorView("render", new Error(message)), title: "The graphics device was lost", reload: true });
  });
  if (waitingForAssets) update("Loading scene assets", "world");
  else screen.clear();
  handle = options.scheduler.request(frame);

  return {
    world: running,
    ...(profile ? { armFrameCapture(listener: FrameCaptureListener) { if (!halted) armedCapture = listener; } } : {}),
    stop() {
      halted = true;
      armedCapture = undefined;
      if (handle !== null) options.scheduler.cancel(handle);
      handle = null;
      if (waitingForAssets) screen.clear();
      streaming?.dispose();
      running.dispose();
      render?.dispose();
    },
  };
}

function disposeRenderQuietly(render: BootRender): void {
  try {
    render.dispose();
  } catch {
    // the boot error is what gets reported
  }
}

function disposeQuietly(world: World): void {
  try {
    world.dispose();
  } catch {
    // a world that failed to start may fail to stop; the boot error is reported instead
  }
}
