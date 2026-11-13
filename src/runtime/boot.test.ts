import { describe, expect, test } from "vitest";
import { defineFeature, defineSubsystem, type FeatureDef } from "../core/index.ts";
import { actorId, assetId, Collider, Driver, Fog, levelId, StaticMesh } from "../core/level/testKit.ts";
import { bootErrorView, bootGame, type BootErrorView, type BootOptions, type BootRender, type BootScreen } from "./boot.ts";
import { createBootScreen } from "./bootScreen.ts";
import { defineGameModule } from "./gameModule.ts";
import { WorldError } from "./world.ts";

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
