import { describe, expect, test } from "vitest";
import { defineComponent, defineFeature, defineSaveState, defineSubsystem, num, type FeatureDef, type SaveGameDoc } from "../core/index.ts";
import { actorId, assetId, Collider, Driver, Fog, levelId, StaticMesh } from "../core/level/testKit.ts";
import { bootErrorView, bootGame, type BootErrorView, type BootOptions, type BootRender, type BootScreen } from "./boot.ts";
import { createBootScreen } from "./bootScreen.ts";
import { defineGameModule } from "./gameModule.ts";
import { WorldError } from "./world.ts";
import { CheckpointKey } from "../engine/persistence/checkpointService.ts";
import { createMemoryStorageAdapter, SaveGameStore } from "../engine/persistence/saveGameStore.ts";
import type { FrameCaptureListener } from "../engine/perf/frameCapture.ts";
import { TimeControl, TimeControlKey } from "../engine/time/timeControl.ts";

const components = defineFeature({ id: "test.components", components: [Fog, Collider, StaticMesh, Driver] });
const LEVEL = { schema: "forge.level/1", id: levelId("1"), actors: [{ id: actorId("1"), name: "Fog", components: { fog: { type: "test.fog@2" } } }] };

function harness(overrides: Partial<BootOptions> = {}) {
  const shown: { kind: string; title: string; view?: BootErrorView }[] = [];
  const screen: BootScreen = {
    info: (title) => shown.push({ kind: "info", title }),
    error: (view) => shown.push({ kind: "error", title: view.title, view }),
    clear: () => shown.push({ kind: "clear", title: "" }),
  };
  const frames = new Map<number, (time: number) => void>();
  let next = 1;
  const scheduler = {
    request: (frame: (time: number) => void) => {
      frames.set(next, frame);
      return next++;
    },
    cancel: (handle: number) => void frames.delete(handle),
  };
  /** Runs the pending frame at `time` ms. */
  const step = (time: number): void => {
    const [handle, frame] = [...frames][0] ?? [];
    if (handle === undefined) throw new Error("no frame pending");
    frames.delete(handle);
    frame!(time);
  };
  const options: BootOptions = {
    features: [components],
    strict: true,
    loadLevel: async () => ({ level: LEVEL }),
    screen,
    scheduler,
    ...overrides,
  };
  return { options, shown, step, pending: () => frames.size };
}

function ticker(log: string[]): FeatureDef {
  return defineFeature({
    id: "test.ticker",
    subsystems: [
      defineSubsystem({
        id: "test.ticker",
        tickGroups: ["physics"],
        create: () => ({
          beginPlay: () => log.push("feature beginPlay"),
          tick: (_group, dt) => log.push(`tick ${dt}`),
          endPlay: (reason) => log.push(`feature endPlay ${reason}`),
        }),
      }),
    ],
  });
}

describe("bootGame", () => {
  test("a checkpoint restores the level's stamped actor state, destruction, spawned actor and game state", async () => {
    const Counter = defineComponent("test.counter", 1, { value: num({ default: 0, persist: true }) }, {
      persistTransform: true, state: { ticks: num({ default: 0 }) },
    });
    const Progress = defineSaveState("test.progress", 1, { wave: num({ default: 1 }) });
    const feature = defineFeature({ id: "test.checkpoint", components: [Counter], saveStates: [Progress] });
    const counter = {
      id: actorId("c"), name: "Counter",
      components: { counter: { type: "test.counter@1" } },
    };
    const target = { id: actorId("d"), name: "Removed target", components: {} };
    const loadLevel = async () => ({ level: { ...LEVEL, actors: [counter, target] } });
    const storage = createMemoryStorageAdapter();
    const store = new SaveGameStore<SaveGameDoc>({ gameId: "checkpoint-fixture", storage, schema: 1 });
    const first = await bootGame(harness({ features: [feature], loadLevel, checkpoint: { store } }).options);
    expect(first).not.toBeNull();
    const current = first!.world.context.actor(counter.id)!;
    current.components.counter!.value = 3;
    current.components.counter!.ticks = 7;
    current.transform.p = [3, 2, 1];
    first!.world.context.destroyActors([target.id]);
    const [spawned] = first!.world.context.spawnActors([{ ...counter, id: actorId("e") }]);
    spawned!.transform.p = [5, 4, 3];
    const saves = first!.world.services.require(CheckpointKey);
    saves.setState(Progress, { wave: 2 });
    expect(saves.save("quick")).toBe(true);
    first!.stop();

    const second = await bootGame(harness({ features: [feature], loadLevel, checkpoint: { store, initialSlot: "quick" } }).options);
    expect(second).not.toBeNull();
    try {
      expect(second!.world.context.actor(counter.id)).toMatchObject({
        transform: { p: [3, 2, 1] }, components: { counter: { value: 3, ticks: 7 } },
      });
      expect(second!.world.context.actor(spawned!.id)).toMatchObject({ origin: "spawned", transform: { p: [5, 4, 3] } });
      expect(second!.world.context.actor(target.id)).toBeUndefined();
      expect(second!.world.services.require(CheckpointKey).state(Progress)).toEqual({ wave: 2 });
    } finally {
      second!.stop();
    }
  });

  test("nothing to open: an info screen, no world", async () => {
    const { options, shown } = harness({ loadLevel: async () => null });
    expect(await bootGame(options)).toBeNull();
    expect(shown).toEqual([{ kind: "info", title: "Nothing to open" }]);
  });

  test("a level boots, the screen clears, frames tick the world with real dt; stop disposes", async () => {
    const log: string[] = [];
    const { options, shown, step, pending } = harness({ features: [components, ticker(log)] });
    const game = await bootGame(options);
    expect(game?.world.state).toBe("playing");
    expect(game?.armFrameCapture).toBeUndefined();
    expect(shown).toEqual([{ kind: "clear", title: "" }]);
    step(1000);
    step(1016);
    step(1066);
    expect(log).toEqual(["feature beginPlay", "tick 0", "tick 0.016", "tick 0.05"]);
    game!.stop();
    expect(game!.world.state).toBe("disposed");
    expect(pending()).toBe(0);
  });

  test("each stage that fails says which, with the issues", async () => {
    const twice = await harnessBoot({ features: [components, components] });
    expect(twice).toMatchObject({ kind: "error", title: "The engine's features could not be installed" });

    const broken = await harnessBoot({ loadLevel: async () => ({ level: { ...LEVEL, actors: [{ id: actorId("1"), layer: 1 }] } }) });
    expect(broken).toMatchObject({ kind: "error", title: "The level could not be loaded" });
    expect(broken.view?.details[0]).toBe("error unknown-field actors[0].layer: An actor has no such field; dropped.");

    const missingClass = await harnessBoot({ loadLevel: async () => ({ level: { ...LEVEL, actors: [{ id: actorId("1"), class: assetId("9") }] } }) });
    expect(missingClass.view?.details[0]).toMatch(/^error dangling-reference actors\[0\]\.class/);

    const failingInit = defineFeature({ id: "test.bad", subsystems: [defineSubsystem({ id: "test.bad", create: () => { throw new Error("no GPU budget"); } })] });
    const init = await harnessBoot({ features: [components, failingInit] });
    expect(init).toMatchObject({ kind: "error", title: "The world could not be started", view: { message: "no GPU budget" } });
  });

  test("a production build boots through data loss and reports it", async () => {
    const reported: string[] = [];
    const { options } = harness({
      strict: false,
      loadLevel: async () => ({ level: { ...LEVEL, actors: [...LEVEL.actors, { id: actorId("2"), class: assetId("9") }] } }),
      warn: (issues) => reported.push(...issues.map((issue) => `${issue.code} ${issue.path}`)),
    });
    const game = await bootGame(options);
    expect(game?.world.state).toBe("playing");
    expect(reported).toEqual(["dangling-reference actors[1].class"]);
    expect([...game!.world.context.actors()].map((actor) => actor.name)).toEqual(["Fog"]);
  });

  test("an error in a frame stops the loop, ends play with 'error' and shows the screen", async () => {
    const log: string[] = [];
    const exploding = defineFeature({
      id: "test.boom",
      subsystems: [defineSubsystem({ id: "test.boom", tickGroups: ["postPhysics"], create: () => ({ tick: () => { throw new Error("boom"); } }) })],
    });
    const { options, shown, step, pending } = harness({ features: [components, ticker(log), exploding] });
    await bootGame(options);
    step(0);
    expect(pending()).toBe(0);
    expect(log.at(-1)).toBe("feature endPlay error");
    expect(shown.at(-1)).toMatchObject({ kind: "error", title: "The game stopped", view: { message: "boom" } });
  });

  test("the game module's features install after the engine's; its hooks run last", async () => {
    const log: string[] = [];
    const gameModule = defineGameModule({
      id: "mygame.main",
      features: [ticker(log)],
      onBeginPlay: (ctx) => log.push(`game beginPlay, ${ctx.componentsOf("test.fog").length} fog`),
      onEndPlay: (_ctx, reason) => log.push(`game endPlay ${reason}`),
    });
    const { options } = harness({ gameModule });
    const game = await bootGame(options);
    game!.stop();
    expect(log).toEqual(["feature beginPlay", "game beginPlay, 1 fog", "game endPlay stopped", "feature endPlay stopped"]);
  });

  describe("the render stage", () => {
    function fakeRender(log: string[], options: { initFails?: boolean } = {}) {
      let lost: ((message: string) => void) | null = null;
      const render: BootRender = {
        init: async () => {
          log.push("render init");
          if (options.initFails) throw new Error("WebGPU is not available");
        },
        feature: (features) => {
          log.push(`render feature after ${features.map((feature) => feature.id).join(", ")}`);
          return defineFeature({
            id: "forge.render",
            subsystems: [
              defineSubsystem({
                id: "forge.render",
                tickGroups: ["renderSync"],
                create: () => ({ tick: (group) => log.push(`render ${group}`) }),
              }),
            ],
          });
        },
        frame: (time) => log.push(`draw ${time}`),
        onLost: (listener) => void (lost = listener),
        dispose: () => log.push("render dispose"),
      };
      return { render, lose: (message: string) => lost?.(message) };
    }

    test("init before the level; its feature installs last; each frame draws after the tick", async () => {
      const log: string[] = [];
      const { render } = fakeRender(log);
      const { options, step } = harness({
        features: [components, ticker(log)],
        render,
        loadLevel: async () => {
          log.push("load level");
          return { level: LEVEL };
        },
      });
      const game = await bootGame(options);
      step(10);
      game!.stop();
      expect(log).toEqual([
        "render init",
        "load level",
        "render feature after test.components, test.ticker",
        "feature beginPlay",
        "tick 0",
        "render renderSync",
        "draw 10",
        "feature endPlay stopped",
        "render dispose",
      ]);
    });

    test("a renderer that cannot start stops the boot at the render stage", async () => {
      const log: string[] = [];
      const { render } = fakeRender(log, { initFails: true });
      const shown = await harnessBoot({ render, loadLevel: async () => (log.push("load level"), { level: LEVEL }) });
      expect(shown).toMatchObject({ kind: "error", title: "The renderer could not be started", view: { message: "WebGPU is not available" } });
      expect(log).toEqual(["render init", "render dispose"]);
    });

    test("diagnostics capture one completed CPU frame with World and render timing", async () => {
      let clock = 0;
      const log: string[] = [];
      const { render } = fakeRender(log);
      const measured = defineFeature({ id: "test.measured", subsystems: [defineSubsystem({
        id: "test.measured", tickGroups: ["physics"], create: () => ({ tick() { clock += 2; } }),
      })] });
      const { options, step } = harness({
        features: [components, measured],
        render: { ...render, frame: () => { clock += 5; } },
        frameProfileClock: () => clock,
      });
      const game = (await bootGame(options))!;
      try {
        const timeControl = new TimeControl();
        timeControl.setTimeScale(2);
        game.world.services.provide(TimeControlKey, timeControl);
        step(1000);

        const captures: Parameters<FrameCaptureListener>[] = [];
        game.armFrameCapture!((...args) => captures.push(args));
        expect(captures).toHaveLength(0);
        step(1230);
        await Promise.resolve();
        const [frame, context] = captures[0]!;
        expect(frame).toMatchObject({ totalMs: 7, averageTotalMs: 7, windowFrames: 2 });
        expect(frame.regions).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: "engine", parent: null, frameMs: 2 }),
          expect.objectContaining({ id: "test.measured", parent: "engine", frameMs: 2 }),
          expect.objectContaining({ id: "render", parent: null, frameMs: 5 }),
        ]));
        expect(context).toEqual({ sceneSeconds: 0.2, paused: false, timeScale: 2 });

        step(1246);
        await Promise.resolve();
        expect(captures).toHaveLength(1);
      } finally {
        game.stop();
      }
    });

    test("loading progress stays visible until the renderer settles its initial scene assets", async () => {
      const { render } = fakeRender([]);
      let ready = false;
      const progress: [string, number][] = [];
      const { options, shown, step } = harness({ render: { ...render, ready: () => ready } });
      const game = await bootGame({ ...options, screen: { ...options.screen, progress: (message, value) => progress.push([message, value]) } });
      expect(game).not.toBeNull();
      try {
        expect(progress.map(([, value]) => value)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
        expect(progress.at(-1)?.[0]).toBe("Loading scene assets");
        step(16);
        expect(shown).toEqual([]);
        ready = true;
        step(32);
        expect(shown).toEqual([{ kind: "clear", title: "" }]);
      } finally {
        game?.stop();
      }
    });

    test("a lost device stops the loop for good, ends play and offers a reload", async () => {
      const log: string[] = [];
      const { render, lose } = fakeRender(log);
      const { options, shown, pending } = harness({ features: [components, ticker(log)], render });
      const game = await bootGame(options);
      lose("WebGPU device lost: GPU hung (unknown)");
      expect(pending()).toBe(0);
      expect(game!.world.state).toBe("ended");
      expect(log.at(-1)).toBe("feature endPlay error");
      expect(shown.at(-1)).toMatchObject({
        kind: "error",
        title: "The graphics device was lost",
        view: { message: "WebGPU device lost: GPU hung (unknown)", reload: true },
      });
      lose("again");
      expect(shown.filter((entry) => entry.kind === "error")).toHaveLength(1);
    });
  });

  async function harnessBoot(overrides: Partial<BootOptions>) {
    const { options, shown } = harness(overrides);
    expect(await bootGame(options)).toBeNull();
    return shown.at(-1)!;
  }
});

describe("the boot screen", () => {
  test("the error view lists issues, then the stack", () => {
    const error = new WorldError("bad", [{ code: "invalid-value", severity: "error", path: "a.b", message: "nope" }]);
    const view = bootErrorView("world", error);
    expect(view.title).toBe("The world could not be started");
    expect(view.details[0]).toBe("error invalid-value a.b: nope");
    expect(view.details.length).toBeGreaterThan(1);
  });

  test("text goes in as text, never as markup", () => {
    interface Fake { tag: string; textContent: string | null; children: Fake[]; attributes: Record<string, string>; style: { cssText: string }; append(...nodes: Fake[]): void; replaceChildren(...nodes: Fake[]): void; setAttribute(name: string, value: string): void }
    const make = (tag: string): Fake => {
      const node: Fake = {
        tag,
        textContent: null,
        children: [],
        attributes: {},
        style: { cssText: "" },
        append: (...nodes) => void node.children.push(...nodes),
        replaceChildren: (...nodes) => void (node.children = nodes),
        setAttribute: (name, value) => void (node.attributes[name] = value),
      };
      return node;
    };
    const root = make("div");
    const screen = createBootScreen({ createElement: make } as unknown as Document, root as unknown as HTMLElement);
    screen.error({ title: "T", message: "<img src=x onerror=alert(1)>", details: ["line 1", "line 2"] });
    const box = root.children[0]!;
    expect(box.attributes).toEqual({ "data-testid": "boot-error", role: "alert" });
    expect(box.children.map((child) => [child.tag, child.textContent])).toEqual([
      ["h1", "T"],
      ["p", "<img src=x onerror=alert(1)>"],
      ["pre", "line 1\nline 2"],
    ]);
    screen.clear();
    expect(root.children).toEqual([]);
  });
});
