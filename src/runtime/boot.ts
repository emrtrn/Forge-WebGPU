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
import { assembleLevel } from "./assembler.ts";
import { gameModuleSubsystem, type GameModuleDef } from "./gameModule.ts";
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
  frame(time: number): void;
  /** Called once if the GPU device is lost. */
  onLost(listener: (message: string) => void): void;
  dispose(): void;
}

export interface LoadedLevel {
  /** The level document as read (it is normalised here). */
  readonly level: unknown;
  readonly resolveClass?: ClassResolver;
}

export interface BootOptions {
  /** Engine features; the game module's come after them. */
  readonly features: readonly FeatureDef[];
  readonly gameModule?: GameModuleDef;
  /** The renderer; none in a headless boot. */
  readonly render?: BootRender;
  /** True in development: data loss stops the boot. */
  readonly strict: boolean;
  /** Null when there is nothing to open. Gets the registry the features were installed into. */
  readonly loadLevel: (registry: SchemaRegistry) => Promise<LoadedLevel | null>;
  readonly screen: BootScreen;
  readonly scheduler: FrameScheduler;
  /** Warnings that did not stop the boot (a production build's data report). */
  readonly warn?: (issues: readonly Issue[]) => void;
}

export interface RunningGame {
  readonly world: World;
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
  try {
    const features = [...options.features, ...(options.gameModule?.features ?? [])];
    if (options.gameModule) {
      features.push(defineFeature({ id: options.gameModule.id, subsystems: [gameModuleSubsystem(options.gameModule)] }));
    }
    const registry = createSchemaRegistry();
    installFeatures(features, registry);

    if (render) {
      stage = "render";
      await render.init();
    }

    stage = "level";
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
    // The render feature comes last: its renderSync runs after everything moved.
    const worldFeatures = render ? [...features, render.feature(features)] : features;
    world = createWorld({ strict: options.strict, registry, resolveClass, features: worldFeatures });
    world.init();
    const assembled = assembleLevel(world, level.value, { strict: options.strict, resolveClass });
    // A missing class is already reported by normalisation; report it once.
    const seen = new Set(warnings.map((issue) => `${issue.code} ${issue.path}`));
    warnings.push(...assembled.issues.filter((issue) => !seen.has(`${issue.code} ${issue.path}`)));
    if (warnings.length > 0) options.warn?.(warnings);
    world.beginPlay();
  } catch (error) {
    if (world !== null) disposeQuietly(world);
    if (render) disposeRenderQuietly(render);
    screen.error(bootErrorView(stage, error, error instanceof StageError ? error.issues : []));
    return null;
  }

  const running = world;
  let handle: number | null = null;
  let last: number | null = null;
  let halted = false;
  const halt = (view: BootErrorView): void => {
    halted = true;
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
      running.tick(dt);
      render?.frame(time);
    } catch (error) {
      halt(bootErrorView("frame", error));
      return;
    }
    handle = options.scheduler.request(frame);
  };
  render?.onLost((message) => {
    if (!halted) halt({ ...bootErrorView("render", new Error(message)), title: "The graphics device was lost", reload: true });
  });
  screen.clear();
  handle = options.scheduler.request(frame);

  return {
    world: running,
    stop() {
      halted = true;
      if (handle !== null) options.scheduler.cancel(handle);
      handle = null;
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
