import { describe, expect, test, vi } from "vitest";
import {
  applyActorState, captureActorState, createContext, createSaveGame, createSchemaRegistry, installFeatures,
  normalizeLevel, normalizeSaveGame, type ActorId,
} from "../../core/index.ts";
import { WorldEnvironmentController } from "../../engine/environment/worldEnvironmentController.ts";
import { SURFACE_RATES } from "../../engine/environment/surfaceAccumulation.ts";
import { WEATHER_SKY_DEFAULTS } from "../../engine/environment/weatherPresets.ts";
import { WorldEnvironmentKey, WorldEnvironmentServiceKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import { resolveWorldWind } from "../../engine/environment/worldWind.ts";
import { AudioServiceKey } from "../../engine/audio/worldAudio.ts";
import { assembleLevel } from "../../runtime/assembler.ts";
import { AudioSubsystem } from "../../runtime/audio/audioSubsystem.ts";
import { createWorld } from "../../runtime/world.ts";
import feature from "./feature.ts";
import { WorldEnvironment } from "./schema.ts";

const registry = createSchemaRegistry();
installFeatures([feature], registry);
const options = { strict: true, registry, resolveClass: () => undefined };
const actor = "act_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as ActorId;
const level = (surface = {}) => normalizeLevel({ schema: "forge.level/1", id: "lvl_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  settings: { wind: { directionDeg: 90, strength: .5, gust: .2 } },
  actors: [{ id: actor, spatiallyLoaded: false, components: { environment: { type: "forge.worldEnvironment@3", surface } } }],
}, options).value!;

test("the configured rain loop follows live precipitation and stops in clear weather", () => {
  const clip = "ast_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const document = normalizeLevel({ schema: "forge.level/1", id: level().id,
    actors: [{ id: actor, components: { environment: {
      type: "forge.worldEnvironment@3", precipitation: { rain: { sound: clip, soundVolume: 0.6 } },
    } } }],
  }, options).value!;
  const world = createWorld({ ...options, features: [feature] });
  const audio = new AudioSubsystem();
  const plays = vi.spyOn(audio, "play");
  world.services.provide(AudioServiceKey, audio);
  world.init();
  try {
    assembleLevel(world, document, options);
    world.beginPlay();
    const weather = world.services.require(WorldEnvironmentServiceKey);
    world.tick(0.016);
    expect(plays).not.toHaveBeenCalled();
    weather.setWeather("rain", 0.5);
    world.tick(0.016);
    expect(plays).toHaveBeenCalledExactlyOnceWith(clip, { loop: true, bus: "ambience", volume: 0.3 });
    const loop = plays.mock.results[0]!.value;
    weather.setWeather("rain", 1);
    world.tick(0.016);
    expect(loop.volume).toBe(0.6);
    weather.setWeather("clear");
    world.tick(0.016);
    expect(loop.stopped).toBe(true);
  } finally {
    world.dispose();
    audio.dispose();
  }
});

describe("WES simulation cover, PV-WES-06/07", () => {
  test("hour jumps and season/weather do not accumulate; a fixed hour accumulates, pause holds and targets clamp", async () => {
    const c = new WorldEnvironmentController();
    c.load({ time: { hour: 12 }, surface: { snowCoverage: .2, wetness: .3 } });
    c.setSurfaceTarget({ snowCoverage: 1, wetness: 1 });
    await c.transitionTo({ hour: 23, seconds: 0 });
    c.setSeason("winter"); c.setWeather("snow");
    expect(c.getState().surface).toEqual({ snowCoverage: .2, wetness: .3, puddleFill: 0, snowDepth: 0 });
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
    expect(WorldEnvironment.version).toBe(3);
    const normalized = normalizeLevel({ schema: "forge.level/1", id: level().id,
      actors: [{ id: actor, components: { environment: { type: "forge.worldEnvironment@1", hour: 7 } } }],
    }, options);
    expect(normalized.issues).toEqual([]);
    const component = normalized.value!.actors[0]!;
    if (component.class !== null) throw new Error("plain actor");
    expect(component.components.environment).toMatchObject({ type: "forge.worldEnvironment@3", hour: 7,
      surface: { snowCoverage: 0, wetness: 0, ...SURFACE_RATES }, wind: { useLevelWind: true } });
    // W2b: the schema repeats the engine's weather sky defaults.
    expect((component.components.environment as { weatherSky?: unknown }).weatherSky).toEqual(WEATHER_SKY_DEFAULTS);
  });

  test("v2 levels and v2 saves migrate: no authored change, the new live amounts start at zero", () => {
    const v2 = normalizeLevel({ schema: "forge.level/1", id: level().id,
      actors: [{ id: actor, components: { environment: { type: "forge.worldEnvironment@2", surface: { wetness: .5 } } } }],
    }, options);
    expect(v2.issues).toEqual([]);
    const component = v2.value!.actors[0]!;
    if (component.class !== null) throw new Error("plain actor");
    expect(component.components.environment).toMatchObject({ type: "forge.worldEnvironment@3", surface: { wetness: .5 } });
    expect(component.components.environment).not.toHaveProperty("liveEnvironment");
    const c = new WorldEnvironmentController();
    c.load({});
    c.restore({ hour: 8, season: "winter", weather: { preset: "snow", intensity: .5 }, surface: { snowCoverage: .6, wetness: .1 }, surfaceTarget: { snowCoverage: .7, wetness: .1 } });
    expect(c.getState().surface).toEqual({ snowCoverage: .6, wetness: .1, puddleFill: 0, snowDepth: 0 });
    expect(c.getSurfaceTarget()).toEqual({ snowCoverage: .7, wetness: .1 });
  });

  test("precipitation is the live weather's; the SDK service answers without a World Environment", () => {
    const world = createWorld({ ...options, features: [feature] }); world.init();
    const service = world.services.require(WorldEnvironmentServiceKey);
    expect(service.current()).toBeNull();
    expect(service.precipitation()).toEqual({ rain: 0, snow: 0 });
    service.setWeather("rain");
    expect(service.precipitation()).toEqual({ rain: 0, snow: 0 });
    assembleLevel(world, level(), options); world.beginPlay();
    service.setWeather("rain", .7);
    expect(service.precipitation()).toEqual({ rain: .7, snow: 0 });
    service.setWeather("snow", 2);
    expect(service.precipitation()).toEqual({ rain: 0, snow: 1 });
    for (const preset of ["clear", "cloudy", "fog"] as const) {
      service.setWeather(preset);
      expect(service.precipitation()).toEqual({ rain: 0, snow: 0 });
    }
    // Amounts clamp to their ranges; depth is metres and never becomes a target.
    service.setSurface({ puddleFill: 3, snowDepth: 9, wetness: NaN });
    expect(service.getState().surface).toEqual({ snowCoverage: 0, wetness: 0, puddleFill: 1, snowDepth: 2 });
    expect(service.getSurfaceTarget()).toEqual({ snowCoverage: 0, wetness: 0 });
    world.dispose();
  });

  test("A7 save/load retains live amounts and targets, then continues; runtime preview never changes the level bytes", () => {
    const doc = level({ snowCoverage: .2, wetness: .3 });
    const before = JSON.stringify(doc);
    const world = createWorld({ ...options, features: [feature] }); world.init(); assembleLevel(world, doc, options); world.beginPlay();
    const c = world.services.require(WorldEnvironmentKey).controller;
    expect(c.getState().surface).toEqual({ snowCoverage: .2, wetness: .3, puddleFill: 0, snowDepth: 0 });
    c.setSurface({ puddleFill: .4, snowDepth: .25 });
    c.setSurfaceTarget({ snowCoverage: 1, wetness: 0 });
    c.setHour(18); c.setSeason("spring");
    // A weather change saved half way goes on from there (plan phase W2).
    c.setWeather("snow", .8);
    void c.transitionWeather({ preset: "rain", seconds: 4 });
    for (let i = 0; i < 10; i++) world.tick(.1);
    expect(c.getState().weatherProgress).toBeCloseTo(.25, 9);
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
    for (let i = 0; i < 30; i++) { next.tick(.1); world.tick(.1); }
    expect(resumed.getState()).toEqual(c.getState());
    expect(resumed.getState()).not.toHaveProperty("weatherProgress");
    expect(resumed.precipitation()).toEqual({ rain: 1, snow: 0 });
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
    world.context.spawnActors([{ id: actor, components: { environment: { type: "forge.worldEnvironment@3",
      wind: { useLevelWind: false, directionDeg: 180, strength: .2, gust: 0 } } } }]);
    expect(resolveWorldWind(world.context)).toMatchObject({ directionDeg: 180, strength: .2, gust: 0 });
    world.dispose();
  });
});
