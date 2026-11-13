/**
 * Forge WebGL's environment singletons as singleton actors (plan phase 3 step
 * 5, importer table; phase 3 decisions 7 and 8, user decision 2026-11-13):
 *
 * - `skyAtmosphere` -> `forge.skyAtmosphere` (exposure as authored; the
 *   renderer applies Forge's 0.2 scale);
 * - its `skyLightCapture` (else the older `reflection` actor's intensity),
 *   with `worldSettings.backgroundColor / ambientColor / ambientIntensity`
 *   -> `forge.skyLight`. Forge captured the sky whenever a level had one, so a
 *   level with a sky, a `reflection` or any of those settings gets a Sky Light;
 * - `cloudLayer` -> `forge.cloudLayer`;
 * - `worldEnvironment` -> `forge.worldEnvironment`, through Forge's own
 *   normalizer (clamps, sunrise / sunset rule) and defaults. There is no day
 *   cycle (decision 8): a `dayLengthMinutes` above 0 is reported as not
 *   converted, the hour stays. `surface` waits for 5a, `wind` for 5c.
 *
 * Forge's defaults are written out where a field is left out, as for lights,
 * so an imported level looks the same if a component default changes later.
 * `hidden` is reported (editor, phase 4), as for Height Fog. Each singleton
 * sits in the persistent layer at the origin.
 */
import type { ActorDoc, ActorId, ComponentMap, JsonObject } from "../../core/index.ts";
import { isJsonObject } from "../../core/index.ts";
import { normalizeWorldEnvironment, resolveWorldEnvironment } from "../environment/worldEnvironment.ts";

export const SKY_ATMOSPHERE_TAG = "forge.skyAtmosphere@1";
export const SKY_LIGHT_TAG = "forge.skyLight@1";
export const CLOUD_LAYER_TAG = "forge.cloudLayer@1";
export const WORLD_ENVIRONMENT_TAG = "forge.worldEnvironment@1";

/** Forge's `SKY_ATMOSPHERE_DEFAULTS` (engine/scene/skyAtmosphere.ts). */
const FORGE_SKY = { rayleigh: 2, turbidity: 10, mie: 0.005, mieDirectionalG: 0.8, exposure: 1 } as const;
/** Forge's `CLOUD_LAYER_DEFAULTS` (engine/scene/cloudLayer.ts). */
const FORGE_CLOUD = { color: "#ffffff", coverage: 0.5, density: 0.85, softness: 0.3, scale: 2, speed: 0 } as const;
/** Forge's world settings defaults (`SceneRuntimeCore`) and its sky light capture intensity. */
const FORGE_SKY_LIGHT = { intensity: 1, ambientColor: "#ffffff", ambientIntensity: 0, backgroundColor: "#d7d7c7" } as const;

/** The `worldSettings` fields `forge.skyLight` takes. */
export const SKY_LIGHT_WORLD_SETTINGS = ["backgroundColor", "ambientColor", "ambientIntensity"] as const;

/** Fields beside the converted ones, with the phase that takes them. */
export const ENVIRONMENT_FIELD_PHASES: Readonly<Record<string, string>> = {
  hidden: "4",
  "worldEnvironment.surface": "5a",
  "worldEnvironment.wind": "5c",
  "worldEnvironment.time.dayLengthMinutes": "- (sürekli gün döngüsü yok, kullanıcı kararı)",
};

const CONVERTED: Readonly<Record<string, readonly string[]>> = {
  skyAtmosphere: ["name", "rayleigh", "turbidity", "mie", "mieDirectionalG", "exposure", "skyLightCapture"],
  reflection: ["name", "source", "intensity"],
  cloudLayer: ["name", ...Object.keys(FORGE_CLOUD)],
  worldEnvironment: ["name", "time", "sunPath", "night", "season", "weather"],
};

const NAMES = {
  skyAtmosphere: "Sky Atmosphere",
  skyLight: "Sky Light",
  cloudLayer: "Cloud Layer",
  worldEnvironment: "World Environment",
} as const;

export interface EnvironmentNote {
  readonly field: string;
  readonly count: number;
  readonly phase: string;
}

export interface EnvironmentActors {
  readonly actors: ActorDoc[];
  readonly notes: readonly EnvironmentNote[];
  readonly counts: { readonly skyAtmosphere: number; readonly skyLight: number; readonly cloudLayer: number; readonly worldEnvironment: number };
}

const num = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const hex = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;

function singleton(id: ActorId, name: string, key: string, component: JsonObject): ActorDoc {
  return {
    id,
    name,
    class: null,
    parent: null,
    spatiallyLoaded: false,
    transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { [key]: component as unknown as ComponentMap[string] },
  };
}

export function environmentActors(layout: JsonObject, actorId: (key: string) => ActorId): EnvironmentActors {
  const actors: ActorDoc[] = [];
  const notes: EnvironmentNote[] = [];
  const counts = { skyAtmosphere: 0, skyLight: 0, cloudLayer: 0, worldEnvironment: 0 };
  const name = (actor: JsonObject, fallback: string): string => (typeof actor.name === "string" && actor.name !== "" ? actor.name : fallback);
  const noteRest = (field: keyof typeof CONVERTED, actor: JsonObject): void => {
    for (const key of Object.keys(actor)) {
      if (CONVERTED[field]!.includes(key)) continue;
      if (key === "hidden") {
        if (actor.hidden === true) notes.push({ field: `${field}.hidden`, count: 1, phase: ENVIRONMENT_FIELD_PHASES.hidden! });
        continue;
      }
      const phase = ENVIRONMENT_FIELD_PHASES[`${field}.${key}`] ?? "?";
      notes.push({ field: `${field}.${key}`, count: 1, phase });
    }
  };

  const sky = isJsonObject(layout.skyAtmosphere) ? layout.skyAtmosphere : null;
  if (sky) {
    actors.push(singleton(actorId("skyAtmosphere"), name(sky, NAMES.skyAtmosphere), "sky", {
      type: SKY_ATMOSPHERE_TAG,
      rayleigh: num(sky.rayleigh, FORGE_SKY.rayleigh),
      turbidity: num(sky.turbidity, FORGE_SKY.turbidity),
      mie: num(sky.mie, FORGE_SKY.mie),
      mieDirectionalG: num(sky.mieDirectionalG, FORGE_SKY.mieDirectionalG),
      exposure: num(sky.exposure, FORGE_SKY.exposure),
    }));
    counts.skyAtmosphere = 1;
    noteRest("skyAtmosphere", sky);
  }

  const reflection = isJsonObject(layout.reflection) ? layout.reflection : null;
  if (reflection) noteRest("reflection", reflection);
  const settings = isJsonObject(layout.worldSettings) ? layout.worldSettings : {};
  const hasSettings = SKY_LIGHT_WORLD_SETTINGS.some((field) => settings[field] !== undefined);
  if (sky || reflection || hasSettings) {
    const capture = sky && isJsonObject(sky.skyLightCapture) ? sky.skyLightCapture : null;
    actors.push(singleton(actorId("skyLight"), NAMES.skyLight, "skyLight", {
      type: SKY_LIGHT_TAG,
      intensity: num(capture?.intensity, num(reflection?.intensity, FORGE_SKY_LIGHT.intensity)),
      ambientColor: hex(settings.ambientColor, FORGE_SKY_LIGHT.ambientColor),
      ambientIntensity: num(settings.ambientIntensity, FORGE_SKY_LIGHT.ambientIntensity),
      backgroundColor: hex(settings.backgroundColor, FORGE_SKY_LIGHT.backgroundColor),
    }));
    counts.skyLight = 1;
  }

  const cloud = isJsonObject(layout.cloudLayer) ? layout.cloudLayer : null;
  if (cloud) {
    actors.push(singleton(actorId("cloudLayer"), name(cloud, NAMES.cloudLayer), "clouds", {
      type: CLOUD_LAYER_TAG,
      color: hex(cloud.color, FORGE_CLOUD.color),
      coverage: num(cloud.coverage, FORGE_CLOUD.coverage),
      density: num(cloud.density, FORGE_CLOUD.density),
      softness: num(cloud.softness, FORGE_CLOUD.softness),
      scale: num(cloud.scale, FORGE_CLOUD.scale),
      speed: num(cloud.speed, FORGE_CLOUD.speed),
    }));
    counts.cloudLayer = 1;
    noteRest("cloudLayer", cloud);
  }

  const wes = isJsonObject(layout.worldEnvironment) ? layout.worldEnvironment : null;
  if (wes) {
    const env = resolveWorldEnvironment(normalizeWorldEnvironment(wes).environment);
    actors.push(singleton(actorId("worldEnvironment"), name(wes, NAMES.worldEnvironment), "environment", {
      type: WORLD_ENVIRONMENT_TAG,
      hour: env.time.hour,
      season: env.season,
      weather: { ...env.weather },
      sunPath: { ...env.sunPath },
      night: { ...env.night },
    }));
    counts.worldEnvironment = 1;
    noteRest("worldEnvironment", wes);
    if (env.time.dayLengthMinutes > 0) {
      notes.push({ field: "worldEnvironment.time.dayLengthMinutes", count: 1, phase: ENVIRONMENT_FIELD_PHASES["worldEnvironment.time.dayLengthMinutes"]! });
    }
  }

  return { actors, notes, counts };
}
