import { describe, expect, test } from "vitest";
import { defineComponent, defineFeature, num, type ActorDoc, type FeatureDef, type LevelId } from "../../core/index.ts";
import { actorId, levelId } from "../../core/level/testKit.ts";
import { RenderReadinessKey } from "../../engine/world/renderReadiness.ts";
import { bootGame, type BootOptions, type BootRender, type RunningGame } from "../boot.ts";
import type { CellSource } from "./cellStreaming.ts";
import { CellStreamingKey } from "./cellStreaming.ts";

// A component with play state and a persisted transform: what the ledger keeps.
const Counter = defineComponent("test.counter", 1, {}, { state: { hits: num({ min: 0, max: 100, default: 0 }) }, persistTransform: true });
const components: FeatureDef = defineFeature({ id: "test.components", components: [Counter] });
const LEVEL: LevelId = levelId("9");

const actor = (seed: string, x: number, z: number, parent: string | null = null): ActorDoc => ({
  id: actorId(seed), name: seed, parent: parent === null ? null : actorId(parent), spatiallyLoaded: true,
  transform: { p: [x, 0, z], r: [0, 0, 0, 1], s: [1, 1, 1] }, class: null, components: { c: { type: "test.counter@1" } },
});

/** Cells of 100 m: 0_0 near the origin (a root and its child), 9_0 900 m east. */
const CELLS: Record<string, ActorDoc[]> = {
  "0_0": [actor("a", 10, 10), actor("b", 1, 0, "a")],
  "9_0": [actor("c", 950, 10)],
};

function harness() {
  let camera: [number, number] = [0, 0];
  let holds = 0;
  const frames: ((time: number) => void)[] = [];
  const source: CellSource = {
    cells: Object.keys(CELLS),
    read: async (key) => ({ payload: { actors: structuredClone(CELLS[key]!), bytes: 100 }, issues: [] }),
  };
  const render: BootRender = {
    init: async () => {},
    feature: () => defineFeature({ id: "test.render" }),
    frame: () => {},
    onLost: () => {},
    dispose: () => {},
    streamingSources: () => [{ position: camera }],
    busy: () => {
      holds += 1;
      return () => { holds -= 1; };
    },
  };
  const options: BootOptions = {
    features: [components],
    render,
    strict: true,
    loadLevel: async () => ({
      level: { schema: "forge.level/1", id: LEVEL, settings: { cellSize: 100, loadRange: 150 }, actors: [] },
      cells: source,
    }),
    screen: { info: () => {}, error: (view) => { throw new Error(view.message); }, clear: () => {} },
    scheduler: { request: (frame) => frames.push(frame), cancel: () => {} },
  };
  let time = 0;
  /** Frames until fetches have settled (they resolve between frames). */
  const run = async (count = 4): Promise<void> => {
    for (let i = 0; i < count; i += 1) {
      const frame = frames.shift();
      if (!frame) throw new Error("no frame pending");
      time += 16;
      frame(time);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return { options, run, move: (x: number, z: number) => { camera = [x, z]; }, holds: () => holds };
}

const ids = (game: RunningGame): string[] => game.world.context.componentsOf("test.counter").map((entry) => entry.actor.name).sort();

describe("cell streaming in the running game (phase 5b step 4)", () => {
  test("cells near the source join, far ones stay out; readiness is held while they load", async () => {
    const h = harness();
    const game = (await bootGame(h.options))!;
    expect(ids(game)).toEqual([]);
    await h.run(1);
    expect(h.holds()).toBe(1);
    await h.run(4);
    expect(ids(game)).toEqual(["a", "b"]);
    expect(h.holds()).toBe(0);
    expect(game.world.services.require(CellStreamingKey).snapshot()).toMatchObject({ cells: 2, active: 1, actors: 2 });
    game.stop();
  });

  test("HLOD reuses ready cells until render readiness or cell residency changes", async () => {
    const h = harness();
    const game = (await bootGame(h.options))!;
    const streaming = game.world.services.require(CellStreamingKey);
    let revision = 0, checks = 0;
    let ready = false;
    game.world.services.provide(RenderReadinessKey, {
      get revision() { return revision; },
      isActorReady() { checks += 1; return ready; },
    });
    await h.run(5);
    expect(streaming.isCellActive("0_0")).toBe(false);
    ready = true;
    expect(streaming.isCellActive("0_0")).toBe(true);
    expect(streaming.isCellActive("0_0")).toBe(true);
    expect(checks).toBe(3);

    revision += 1;
    ready = false;
    expect(streaming.isCellActive("0_0")).toBe(false);
    expect(checks).toBe(4);
    ready = true;
    expect(streaming.isCellActive("0_0")).toBe(true);

    h.move(950, 10);
    await h.run(5);
    expect(streaming.isCellActive("0_0")).toBe(false);
    h.move(0, 0);
    await h.run(5);
    ready = false;
    expect(streaming.isCellActive("0_0")).toBe(false);
    expect(checks).toBe(7);
    game.stop();
  });

  test("leaving and coming back several times leaves nothing behind; play state comes back from the ledger", async () => {
    const h = harness();
    const game = (await bootGame(h.options))!;
    await h.run(5);
    const a = game.world.context.actor(actorId("a"))!;
    a.components.c!.hits = 7;
    a.transform = { p: [20, 0, 20], r: [0, 0, 0, 1], s: [1, 1, 1] };
    for (let cycle = 0; cycle < 3; cycle += 1) {
      h.move(950, 10);
      await h.run(5);
      expect(ids(game)).toEqual(["c"]);
      h.move(0, 0);
      await h.run(5);
      expect(ids(game)).toEqual(["a", "b"]);
    }
    const back = game.world.context.actor(actorId("a"))!;
    expect(back.components.c!.hits).toBe(7);
    expect(back.transform.p).toEqual([20, 0, 20]);
    expect(game.world.context.actor(actorId("b"))!.parent).toBe(actorId("a"));
    const streaming = game.world.services.require(CellStreamingKey);
    expect(streaming.snapshot().actors).toBe(2);
    game.stop();
    expect(h.holds()).toBe(0);
  });

  test("a headless boot assembles every cell at once", async () => {
    const h = harness();
    const { streamingSources: _sources, ...headless } = h.options.render!;
    const game = (await bootGame({ ...h.options, render: { ...headless } }))!;
    expect(ids(game)).toEqual(["a", "b", "c"]);
    expect(game.world.services.get(CellStreamingKey)).toBeUndefined();
    game.stop();
  });
});
