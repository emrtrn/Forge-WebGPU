import { describe, expect, test } from "vitest";
import { defineFeature, normalizeLevel, type LevelDoc } from "../core/index.ts";
import { actorId, assetId, CAR_CLASS_ID, createOptions, levelId, summary } from "../core/level/testKit.ts";
import { assembleActors, assembleLevel } from "./assembler.ts";
import { createWorld, WorldError } from "./world.ts";

const STRICT = createOptions(true);
const LENIENT = createOptions(false);
const MISSING = assetId("9");

function level(actors: unknown[], options = STRICT): LevelDoc {
  return normalizeLevel({ schema: "forge.level/1", id: levelId("1"), actors }, options).value!;
}

function initialised(options = STRICT) {
  const world = createWorld({ ...options, features: [defineFeature({ id: "test.empty" })] });
  world.init();
  return world;
}

describe("assembleLevel", () => {
  test("every actor of the level, with its effective components, in level order", () => {
    const world = initialised();
    const result = assembleLevel(
      world,
      level([
        { id: actorId("1"), name: "Fog", components: { fog: { type: "test.fog@2", density: 0.1 } } },
        { id: actorId("2"), name: "Car", class: CAR_CLASS_ID, overrides: { driver: { targetSpeed: 25 } } },
        { id: actorId("3"), name: "Wheel", parent: actorId("2") },
      ]),
      STRICT,
    );
    expect(result.issues).toEqual([]);
    expect(result.actors.map((actor) => [actor.name, actor.origin])).toEqual([
      ["Fog", "level"],
      ["Car", "level"],
      ["Wheel", "level"],
    ]);
    expect(world.context.componentsOf("test.driver")[0]?.component.targetSpeed).toBe(25);
    expect(world.context.componentsOf("test.fog")[0]?.component.density).toBe(0.1);
  });

  test("a missing class is an error in development: nothing is added", () => {
    const world = initialised();
    const data = level([{ id: actorId("1"), name: "Ok" }, { id: actorId("2"), class: MISSING }], LENIENT);
    try {
      assembleLevel(world, data, STRICT);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(WorldError);
      expect(summary((error as WorldError).issues)).toEqual(["error dangling-reference actors[1].class"]);
    }
    expect([...world.context.actors()]).toEqual([]);
  });

  test("in production the actor and its children are left out with a report", () => {
    const world = initialised(LENIENT);
    const data = level(
      [
        { id: actorId("1"), name: "Ok" },
        { id: actorId("2"), name: "Lost", class: MISSING },
        { id: actorId("3"), name: "Child of lost", parent: actorId("2") },
        { id: actorId("4"), name: "Grandchild", parent: actorId("3") },
      ],
      LENIENT,
    );
    const result = assembleLevel(world, data, LENIENT);
    expect(summary(result.issues)).toEqual(["warning dangling-reference actors[1].class"]);
    expect(result.actors.map((actor) => actor.name)).toEqual(["Ok"]);
  });

  test("a cell streams in with assembleActors; its parents may already be in the world", () => {
    const world = initialised();
    assembleLevel(world, level([{ id: actorId("1"), name: "Persistent" }]), STRICT);
    const child = { ...level([{ id: actorId("2"), name: "Cell actor" }]).actors[0]!, parent: actorId("1") };
    expect(assembleActors(world, [child], STRICT).actors.map((actor) => actor.name)).toEqual(["Cell actor"]);
  });
});
