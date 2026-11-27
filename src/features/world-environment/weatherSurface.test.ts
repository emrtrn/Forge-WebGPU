// Plan phase W5: the weather drives the surface (HV-05, HV-08, HV-09).
import { describe, expect, test } from "vitest";
import {
  applyActorState, captureActorState, createContext, createSaveGame, createSchemaRegistry, installFeatures,
  normalizeLevel, normalizeSaveGame, type ActorId,
} from "../../core/index.ts";
import { SURFACE_CONDITION_RATES, type SurfaceCondition } from "../../engine/environment/surfaceCondition.ts";
import { WorldEnvironmentController } from "../../engine/environment/worldEnvironmentController.ts";
import { WorldEnvironmentKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import { assembleLevel } from "../../runtime/assembler.ts";
import { createWorld } from "../../runtime/world.ts";
import feature from "./feature.ts";
import type { WorldEnvironmentData } from "./schema.ts";

const registry = createSchemaRegistry();
installFeatures([feature], registry);
const options = { strict: true, registry, resolveClass: () => undefined };
const actor = "act_ffffffffffffffffffffffffffffffff" as ActorId;
const level = (surface: Record<string, unknown> = {}) => normalizeLevel({ schema: "forge.level/1", id: "lvl_ffffffffffffffffffffffffffffffff",
  actors: [{ id: actor, spatiallyLoaded: false, components: { environment: { type: "forge.worldEnvironment@3", surface } } }],
}, options).value!;
const driven = { weatherDrivesSurface: true };
const surfaceOf = (c: WorldEnvironmentController): SurfaceCondition => c.getState().surface;
const near = (a: SurfaceCondition, b: SurfaceCondition, tolerance: number) => {
  for (const key of ["wetness", "puddleFill", "snowCoverage", "snowDepth"] as const) expect(Math.abs(a[key] - b[key]), key).toBeLessThanOrEqual(tolerance);
};

describe("weather drives the surface (plan phase W5)", () => {
  test("off in the schema (HK2): an older level keeps 5a's targets; the rates are the model's", () => {
    const doc = level();
    const component = doc.actors[0]!;
    if (component.class !== null) throw new Error("plain actor");
    const surface = (component.components.environment as unknown as WorldEnvironmentData).surface;
    expect(surface.weatherDrivesSurface).toBe(false);
    for (const key of Object.keys(SURFACE_CONDITION_RATES) as (keyof typeof SURFACE_CONDITION_RATES)[]) {
      expect(surface[key], key).toBe(SURFACE_CONDITION_RATES[key]);
    }
    const world = createWorld({ ...options, features: [feature] }); world.init(); assembleLevel(world, doc, options); world.beginPlay();
    const c = world.services.require(WorldEnvironmentKey).controller;
    expect(c.weatherDrivesSurface).toBe(false);
    c.setWeather("rain");
    for (let i = 0; i < 100; i++) world.tick(.1);
    expect(surfaceOf(c)).toEqual({ snowCoverage: 0, wetness: 0, puddleFill: 0, snowDepth: 0 });
    world.dispose();
  });

  test("on: rain wets then fills; clear dries the film first, then the water (HV-05)", () => {
    const world = createWorld({ ...options, features: [feature] }); world.init(); assembleLevel(world, level(driven), options); world.beginPlay();
    const c = world.services.require(WorldEnvironmentKey).controller;
    expect(c.weatherDrivesSurface).toBe(true);
    c.setWeather("rain");
    for (let i = 0; i < 100; i++) world.tick(.1);
    expect(surfaceOf(c).wetness).toBeCloseTo(1, 9);
    expect(surfaceOf(c).puddleFill).toBeCloseTo(0, 9);
    for (let i = 0; i < 400; i++) world.tick(.1);
    expect(surfaceOf(c).puddleFill).toBeCloseTo(.2, 9);
    c.setWeather("clear");
    for (let i = 0; i < 500; i++) world.tick(.1);
    expect(surfaceOf(c).wetness).toBeCloseTo(.5, 9);
    expect(surfaceOf(c).puddleFill).toBeCloseTo(.2, 9);
    for (let i = 0; i < 600; i++) world.tick(.1);
    expect(surfaceOf(c).wetness).toBe(0);
    expect(surfaceOf(c).puddleFill).toBeCloseTo(.2 - .0025 * 10, 8);
    // Half-strength rain wets at half the rate.
    c.setWeather("rain", .5);
    for (let i = 0; i < 10; i++) world.tick(.1);
    expect(surfaceOf(c).wetness).toBeCloseTo(.05, 9);
    world.dispose();
  });

  test("30 / 60 / 144 Hz agree with one step; an hour jump is no time; pause holds (HV-09)", async () => {
    const script = (c: WorldEnvironmentController, hz: number | null) => {
      const run = (seconds: number) => {
        if (hz === null) c.advance(seconds);
        else for (let i = 0; i < seconds * hz; i++) c.advance(1 / hz);
      };
      c.setWeather("rain"); run(150);
      c.setWeather("snow"); run(240);
      c.setWeather("clear"); run(200);
      return surfaceOf(c);
    };
    const load = () => {
      const c = new WorldEnvironmentController();
      c.load({}, { ...SURFACE_CONDITION_RATES, weatherDrivesSurface: true });
      return c;
    };
    const single = script(load(), null);
    expect(single.snowDepth).toBeGreaterThan(0);
    for (const hz of [30, 60, 144]) near(script(load(), hz), single, 1e-9);

    // A weather change moves the precipitation within a step: the step's mean keeps frame rates together.
    const changing = (hz: number) => {
      const c = load();
      void c.transitionWeather({ preset: "rain", seconds: 20 });
      for (let i = 0; i < 30 * hz; i++) c.advance(1 / hz);
      return surfaceOf(c);
    };
    near(changing(30), changing(144), 1e-4);

    const c = load();
    c.setWeather("rain");
    await c.transitionTo({ hour: 22, seconds: 0 });
    c.setHour(3);
    c.advance(0); c.advance(-1); c.advance(NaN);
    expect(surfaceOf(c)).toEqual({ snowCoverage: 0, wetness: 0, puddleFill: 0, snowDepth: 0 });
    const night = c.transitionTo({ hour: 6, seconds: 1 });
    c.advance(1);
    await expect(night).resolves.toBe(true);
    // One simulation second of rain, whatever the hour did.
    expect(surfaceOf(c).wetness).toBeCloseTo(.1, 12);
  });

  test("the level's rates and deepest snow are read; 0 holds a direction", () => {
    const c = new WorldEnvironmentController();
    c.load({}, { weatherDrivesSurface: true, snowDepthRate: .01, snowMaxDepth: .05, snowMeltRate: 0, snowDepthMeltRate: 0 });
    c.setWeather("snow");
    c.advance(1000);
    expect(surfaceOf(c)).toMatchObject({ snowCoverage: 1, snowDepth: .05 });
    c.setWeather("clear");
    c.advance(1000);
    expect(surfaceOf(c)).toMatchObject({ snowCoverage: 1, snowDepth: .05 });
    const deep = new WorldEnvironmentController();
    deep.load({}, { weatherDrivesSurface: true, snowMaxDepth: 9, snowDepthRate: 1 });
    deep.setWeather("snow");
    deep.advance(1000);
    expect(surfaceOf(deep).snowDepth).toBe(2);
  });

  test("the authored coverage limit keeps accumulating snowfall flat", () => {
    const c = new WorldEnvironmentController();
    c.load({ surface: { snowSpread: .8 } }, driven);
    c.setWeather("snow");
    c.advance(600);
    expect(surfaceOf(c)).toMatchObject({ snowCoverage: 1, snowDepth: 0 });
  });

  test("A7: a save mid-way resumes where it was and goes on the same; the level bytes never change (HV-08 / 09)", () => {
    const doc = level(driven);
    const before = JSON.stringify(doc);
    const world = createWorld({ ...options, features: [feature] }); world.init(); assembleLevel(world, doc, options); world.beginPlay();
    const c = world.services.require(WorldEnvironmentKey).controller;
    c.setWeather("snow");
    for (let i = 0; i < 1500; i++) world.tick(.1);
    c.setWeather("rain", .6);
    for (let i = 0; i < 300; i++) world.tick(.1);
    const mid = surfaceOf(c);
    expect(mid.snowDepth).toBeGreaterThan(0);
    expect(mid.wetness).toBeGreaterThan(0);
    const base = doc.actors[0]!;
    if (base.class !== null) throw new Error("plain actor");
    const save = createSaveGame(doc.id);
    save.actors[actor] = captureActorState(base, world.context.actor(actor)!, registry)!;
    const decoded = normalizeSaveGame(JSON.parse(JSON.stringify(save)), options);
    expect(decoded.issues).toEqual([]);
    const restored = applyActorState(base, decoded.value!.actors[actor], registry, "actor", createContext(options));
    const next = createWorld({ ...options, features: [feature] }); next.init();
    next.addActors([{ ...base, ...restored }], "level"); next.beginPlay();
    const resumed = next.services.require(WorldEnvironmentKey).controller;
    expect(surfaceOf(resumed)).toEqual(mid);
    for (let i = 0; i < 2000; i++) { next.tick(.1); world.tick(.1); }
    expect(surfaceOf(resumed)).toEqual(surfaceOf(c));
    expect(JSON.stringify(doc)).toBe(before);
    world.dispose(); next.dispose();
  });
});
