import { describe, expect, test } from "vitest";
import {
  applyActorState, captureActorState, createContext, createSaveGame, createSchemaRegistry, installFeatures,
  normalizeLevel, normalizeSaveGame, type ActorId,
} from "../../core/index.ts";
import { WorldEnvironmentController } from "../../engine/environment/worldEnvironmentController.ts";
import { SURFACE_RATES } from "../../engine/environment/surfaceAccumulation.ts";
import { WorldEnvironmentKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import { resolveWorldWind } from "../../engine/environment/worldWind.ts";
import { assembleLevel } from "../../runtime/assembler.ts";
import { createWorld } from "../../runtime/world.ts";
import feature from "./feature.ts";
import { WorldEnvironment } from "./schema.ts";

const registry = createSchemaRegistry();
installFeatures([feature], registry);
const options = { strict: true, registry, resolveClass: () => undefined };
const actor = "act_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as ActorId;
const level = (surface = {}) => normalizeLevel({ schema: "forge.level/1", id: "lvl_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  settings: { wind: { directionDeg: 90, strength: .5, gust: .2 } },
  actors: [{ id: actor, spatiallyLoaded: false, components: { environment: { type: "forge.worldEnvironment@2", surface } } }],
}, options).value!;

describe("WES simulation cover, PV-WES-06/07", () => {
  test("hour jumps and season/weather do not accumulate; a fixed hour accumulates, pause holds and targets clamp", async () => {
    const c = new WorldEnvironmentController();
    c.load({ time: { hour: 12 }, surface: { snowCoverage: .2, wetness: .3 } });
    c.setSurfaceTarget({ snowCoverage: 1, wetness: 1 });
    await c.transitionTo({ hour: 23, seconds: 0 });
    c.setSeason("winter"); c.setWeather("snow");
    expect(c.getState().surface).toEqual({ snowCoverage: .2, wetness: .3 });
    const done = c.transitionTo({ hour: 6, seconds: 2 });
    c.advance(1);
    expect(c.getState().surface.snowCoverage).toBeCloseTo(.21, 12);
    c.advance(0); c.advance(-1); c.advance(NaN);
    expect(c.getState().surface.snowCoverage).toBeCloseTo(.21, 12);
    c.advance(1);
    await expect(done).resolves.toBe(true);
    expect(c.getState().surface.snowCoverage).toBeCloseTo(.22, 12);
    c.advance(1); // fixed 06:00 still accumulates
    expect(c.getState().hour).toBe(6);
    expect(c.getState().surface.snowCoverage).toBeCloseTo(.23, 12);
    c.setSurfaceTarget({ snowCoverage: -1, wetness: 2 });
    expect(c.getSurfaceTarget()).toEqual({ snowCoverage: 0, wetness: 1 });
    c.advance(2);
    expect(c.getState().surface.snowCoverage).toBeCloseTo(.22, 12);
    c.setSurface({ wetness: .8 });
    c.setSurfaceTarget({ wetness: 0 });
    c.advance(2);
    expect(c.getState().surface.wetness).toBeCloseTo(.78, 12);
  });

  test("30/60/144 Hz give equivalent cover over equal simulation time; spring can retain snow", () => {
    for (const hz of [30, 60, 144]) {
      const c = new WorldEnvironmentController(); c.load({});
      c.setSurfaceTarget({ snowCoverage: .9, wetness: .8 });
      for (let i = 0; i < 10 * hz; i++) c.advance(1 / hz);
      expect(c.getState().surface.snowCoverage).toBeCloseTo(.1, 10);
      expect(c.getState().surface.wetness).toBeCloseTo(.8, 10);
      c.setSeason("spring");
      expect(c.getState().surface.snowCoverage).toBeCloseTo(.1, 10);
    }
  });

  test("v1 migration and runtime defaults preserve a neutral level and the explicit units/rates", () => {
    expect(WorldEnvironment.version).toBe(2);
    const normalized = normalizeLevel({ schema: "forge.level/1", id: level().id,
      actors: [{ id: actor, components: { environment: { type: "forge.worldEnvironment@1", hour: 7 } } }],
    }, options);
    expect(normalized.issues).toEqual([]);
    const component = normalized.value!.actors[0]!;
    if (component.class !== null) throw new Error("plain actor");
    expect(component.components.environment).toMatchObject({ type: "forge.worldEnvironment@2", hour: 7,
      surface: { snowCoverage: 0, wetness: 0, ...SURFACE_RATES }, wind: { useLevelWind: true } });
  });

  test("A7 save/load retains live amounts and targets, then continues; runtime preview never changes the level bytes", () => {
    const doc = level({ snowCoverage: .2, wetness: .3 });
    const before = JSON.stringify(doc);
    const world = createWorld({ ...options, features: [feature] }); world.init(); assembleLevel(world, doc, options); world.beginPlay();
    const c = world.services.require(WorldEnvironmentKey).controller;
    expect(c.getState().surface).toEqual({ snowCoverage: .2, wetness: .3 });
    c.setSurfaceTarget({ snowCoverage: 1, wetness: 0 });
    c.setHour(18); c.setSeason("spring");
    for (let i = 0; i < 10; i++) world.tick(.1);
    const base = doc.actors[0]!;
    if (base.class !== null) throw new Error("plain actor");
    const savedActor = captureActorState(base, world.context.actor(actor)!, registry)!;
    const save = createSaveGame(doc.id); save.actors[actor] = savedActor;
    const decoded = normalizeSaveGame(JSON.parse(JSON.stringify(save)), options);
    expect(decoded.issues).toEqual([]);
    const restored = applyActorState(base, decoded.value!.actors[actor], registry, "actor", createContext(options));
    const next = createWorld({ ...options, features: [feature] }); next.init();
    next.addActors([{ ...base, ...restored }], "level"); next.beginPlay();
    const resumed = next.services.require(WorldEnvironmentKey).controller;
    expect(resumed.getState()).toEqual(c.getState());
    expect(resumed.getSurfaceTarget()).toEqual(c.getSurfaceTarget());
    next.tick(.1); world.tick(.1);
    expect(resumed.getState()).toEqual(c.getState());
    // Immediate editor preview, including Make Default's absence, is transient.
    c.setSurface({ snowCoverage: 1, wetness: 1 });
    expect(JSON.stringify(doc)).toBe(before);
    world.dispose(); next.dispose();
  });

  test("level wind is used without WES and by migrated WES; explicit WES wind is weather/season scaled once", () => {
    const doc = level();
    const world = createWorld({ ...options, features: [feature] }); world.init(); assembleLevel(world, doc, options); world.beginPlay();
    expect(resolveWorldWind(world.context)).toMatchObject({ directionDeg: 90, strength: .5, gust: .2 });
    const c = world.services.require(WorldEnvironmentKey).controller;
    c.setWeather("rain", 1);
    expect(resolveWorldWind(world.context).strength).toBeCloseTo(.85);
    world.removeActors([actor]);
    expect(resolveWorldWind(world.context)).toMatchObject({ directionDeg: 90, strength: .5, gust: .2 });
    world.context.spawnActors([{ id: actor, components: { environment: { type: "forge.worldEnvironment@2",
      wind: { useLevelWind: false, directionDeg: 180, strength: .2, gust: 0 } } } }]);
    expect(resolveWorldWind(world.context)).toMatchObject({ directionDeg: 180, strength: .2, gust: 0 });
    world.dispose();
  });
});
