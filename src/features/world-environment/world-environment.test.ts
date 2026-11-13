import { describe, expect, test } from "vitest";
import { createComponent, createSchemaRegistry, formOf, installFeatures, normalizeLevel } from "../../core/index.ts";
import { normalizeWorldEnvironment, SEASONS as FORGE_SEASONS, WEATHER_PRESETS as FORGE_WEATHER, WORLD_ENVIRONMENT_DEFAULTS } from "../../engine/environment/worldEnvironment.ts";
import { WorldEnvironmentKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import { assembleLevel } from "../../runtime/assembler.ts";
import { createWorld } from "../../runtime/world.ts";
import worldEnvironmentFeature from "./feature.ts";
import { forgeWorldEnvironment } from "./runtime.ts";
import { SEASONS, WEATHER_PRESETS, WorldEnvironment } from "./schema.ts";

describe("world environment schema", () => {
  test("defaults are Forge WebGL's WORLD_ENVIRONMENT_DEFAULTS, without a day length, surface or wind", () => {
    const d = WORLD_ENVIRONMENT_DEFAULTS;
    expect(createComponent(WorldEnvironment)).toEqual({
      type: "forge.worldEnvironment@1", hour: d.time.hour, season: d.season, weather: d.weather, sunPath: d.sunPath, night: d.night,
    });
    expect(SEASONS).toEqual(FORGE_SEASONS);
    expect(WEATHER_PRESETS).toEqual(FORGE_WEATHER);
  });

  test("the component in Forge's layout shape passes Forge's normalizer untouched, with the clock stopped", () => {
    const layout = forgeWorldEnvironment(createComponent(WorldEnvironment));
    const { environment, warnings } = normalizeWorldEnvironment(layout);
    expect(warnings).toEqual([]);
    expect(environment).toEqual(layout);
    expect(layout.time.dayLengthMinutes).toBe(0);
  });

  test("every row has an English name and a Turkish hint", () => {
    const rows = formOf(WorldEnvironment).fields;
    expect(rows.map((field) => field.key)).toEqual(["hour", "season", "weather", "sunPath", "night"]);
    const flat = (fields: typeof rows): typeof rows =>
      fields.flatMap((field) => (field.kind === "object" ? [field, ...flat(field.fields)] : [field]));
    for (const field of flat(rows)) {
      expect(field.hint, field.path).toBeTruthy();
      expect(field.label, field.path).toMatch(/^[A-Z]/);
    }
  });
});

describe("world environment end to end: level -> world -> service", () => {
  const registry = createSchemaRegistry();
  installFeatures([worldEnvironmentFeature], registry);
  const options = { strict: true, registry, resolveClass: () => undefined };
  const actor = "act_dddddddddddddddddddddddddddddddd";

  function play(actors: unknown[]) {
    const level = normalizeLevel({ schema: "forge.level/1", id: "lvl_33333333333333333333333333333333", actors }, options);
    expect(level.issues).toEqual([]);
    const world = createWorld({ ...options, features: [worldEnvironmentFeature] });
    world.init();
    assembleLevel(world, level.value!, options);
    world.beginPlay();
    return world;
  }

  test("the level's hour and weather start the live state; the hour stays where it is", () => {
    const world = play([{ id: actor, name: "World Environment", components: { environment: {
      type: "forge.worldEnvironment@1", hour: 21.5, weather: { preset: "rain", intensity: 0.5 }, sunPath: { azimuthDeg: 96 },
    } } }]);
    const runtime = world.services.require(WorldEnvironmentKey);
    expect(runtime.controller.active).toBe(true);
    expect(runtime.controller.running).toBe(false);
    expect(runtime.controller.current()).toMatchObject({ hour: 21.5, season: "summer", weather: { preset: "rain", intensity: 0.5 } });
    expect(runtime.environment?.sunPath.azimuthDeg).toBe(96);
    world.tick(10);
    expect(runtime.controller.current()?.hour).toBe(21.5);
    runtime.controller.setHour(6);
    expect(runtime.controller.current()?.hour).toBe(6);
    world.dispose();
    expect(runtime.controller.active).toBe(false);
    expect(runtime.environment).toBeNull();
  });

  test("no World Environment: inactive; one spawned or destroyed at runtime follows", () => {
    const world = play([]);
    const runtime = world.services.require(WorldEnvironmentKey);
    expect(runtime.controller.active).toBe(false);
    world.context.spawnActors([{ id: actor, components: { environment: { type: "forge.worldEnvironment@1", hour: 9 } } }]);
    expect(runtime.controller.current()?.hour).toBe(9);
    world.context.destroyActors([actor]);
    expect(runtime.controller.active).toBe(false);
    expect(runtime.environment).toBeNull();
  });
});
