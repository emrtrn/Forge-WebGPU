// Ported from Forge WebGL tools/world/randomWorldRequest.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Adapted (plan 2b): `out` is a level folder of the new format, not a `.level.json` under `assets/`.
/**
 * The editor's World Builder window asks the dev server for a random world
 * (`/__world-random`, RANDOM_WORLD_PLAN step 5). This is the request's
 * allowlist: every choice must be one the generator knows, and the level must
 * be a level folder inside the project with plain names (generated levels live
 * with the content, so the Content Browser shows them; the save service keeps
 * the write inside a content root). Unknown fields reject the request.
 *
 * Pure; the dev server (5d) and `npm run world:random` both run it.
 */
import { COVER_DENSITY_LEVELS } from "../../src/engine/worldbuilder/worldBrief.ts";
import { MAX_RANDOM_WATER } from "../../src/engine/worldbuilder/randomWater.ts";
import { SEA_SIDES } from "../../src/engine/worldbuilder/island.ts";
import {
  COVERS,
  LANDFORMS,
  MOUNTAIN_HEIGHTS,
  ROAD_NETWORKS,
  SETTLEMENT_TYPES,
  WORLD_SIZES,
  oceanWorldSizeSupported,
  type RandomWorldOptions,
} from "../../src/engine/worldbuilder/randomWorld.ts";

/** Most settlements the window may ask for. */
export const MAX_RANDOM_SETTLEMENTS = 8;

export type RandomWorldChoices = Omit<RandomWorldOptions, "id" | "name" | "regionProfile" | "models">;

export interface RandomWorldRequest {
  /** Project-relative level folder, e.g. `content/levels/My World`. */
  out: string;
  /** Replace an existing level (and its brief). */
  force: boolean;
  world: RandomWorldChoices;
}

const WORLD_KEYS = ["seed", "size", "landform", "mountainHeight", "settlements", "roads", "rivers", "lakes", "cover", "densities", "seaSide"];

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length) throw new Error(`${label}: unknown field(s) ${unknown.join(", ")}`);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} must be one of ${allowed.join(", ")}`);
  return value as T;
}

function count(value: unknown, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) throw new Error(`${label} must be a whole number 0–${max}`);
  return value;
}

/**
 * A project-relative level folder below a content root (at least two folders
 * deep), with plain folder names. Forge WebGL asked for `assets/…/<Name>.level.json`.
 */
export function validateRandomWorldLevelFolder(value: unknown): string {
  if (typeof value !== "string") throw new Error("out must be a path");
  const path = value.replace(/\\/g, "/");
  const parts = path.split("/");
  if (parts.length < 2) throw new Error(`out must be a level folder inside a content root, e.g. content/levels/<Name>: ${value}`);
  for (const part of parts) {
    if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(part) || part.endsWith(".") || part.endsWith(" ")) {
      throw new Error(`out has an unusable folder name "${part}": letters, digits, space, _ . - only`);
    }
  }
  return path;
}

export function validateRandomWorldRequest(body: unknown): RandomWorldRequest {
  const input = record(body, "request");
  onlyKeys(input, ["out", "force", "world"], "request");
  const out = validateRandomWorldLevelFolder(input.out);
  if (input.force !== undefined && typeof input.force !== "boolean") throw new Error("force must be true or false");
  const world = record(input.world, "world");
  onlyKeys(world, WORLD_KEYS, "world");
  if ((world.landform === "island" || world.landform === "coast") && !oceanWorldSizeSupported(world.size)) throw new Error("Island/Coast supports Small/Medium worlds only (Ocean terrain budget)");
  if (world.landform === "island" && (world.rivers ?? 0) !== 0) throw new Error("Island rivers require the river-mouth integration; choose 0 rivers");
  const seed = world.seed;
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("world.seed must be a whole number 0–4294967295");
  if (!Array.isArray(world.settlements) || world.settlements.length > MAX_RANDOM_SETTLEMENTS) {
    throw new Error(`world.settlements must be a list of at most ${MAX_RANDOM_SETTLEMENTS}`);
  }
  const settlements = world.settlements.map((entry, index) => {
    const settlement = record(entry, `world.settlements[${index}]`);
    onlyKeys(settlement, ["type"], `world.settlements[${index}]`);
    return { type: oneOf(settlement.type, Object.keys(SETTLEMENT_TYPES) as Array<keyof typeof SETTLEMENT_TYPES>, `world.settlements[${index}].type`) };
  });
  const densities = world.densities === undefined ? {} : record(world.densities, "world.densities");
  onlyKeys(densities, ["forest", "rocks", "fields"], "world.densities");
  return {
    out,
    force: input.force === true,
    world: {
      seed,
      size: oneOf(world.size, Object.keys(WORLD_SIZES) as Array<keyof typeof WORLD_SIZES>, "world.size"),
      landform: oneOf(world.landform, LANDFORMS, "world.landform"),
      ...(world.seaSide !== undefined ? { seaSide: oneOf(world.seaSide, SEA_SIDES, "world.seaSide") } : {}),
      mountainHeight: oneOf(world.mountainHeight, MOUNTAIN_HEIGHTS, "world.mountainHeight"),
      settlements,
      roads: oneOf(world.roads, ROAD_NETWORKS, "world.roads"),
      rivers: count(world.rivers ?? 0, MAX_RANDOM_WATER, "world.rivers"),
      lakes: count(world.lakes ?? 0, MAX_RANDOM_WATER, "world.lakes"),
      cover: oneOf(world.cover, Object.keys(COVERS) as Array<keyof typeof COVERS>, "world.cover"),
      densities: Object.fromEntries(
        Object.entries(densities).map(([key, level]) => [key, oneOf(level, COVER_DENSITY_LEVELS, `world.densities.${key}`)]),
      ),
    },
  };
}
