// What the World Builder window asks for (plan 5d step 8, INV-B13; Forge WebGL
// src/editor/panels/world/randomWorldPanel.ts @ forge-webgl-final): the
// choices, the rules between them, the level folder they are built into, the
// build's event lines and the view a new world opens with. Pure; the window,
// the dev server and `npm run world:random` share it.

import type { JsonObject } from "../../core/index.ts";
import { SEA_SIDES, type SeaSide } from "./island.ts";
import { MAX_RANDOM_WATER } from "./randomWater.ts";
import {
  COVERS, LANDFORMS, MOUNTAIN_HEIGHTS, oceanWorldSizeSupported, ROAD_NETWORKS, SETTLEMENT_TYPES, WORLD_SIZES,
  type CoverName, type Landform, type MountainHeight, type RandomWorldOptions, type RoadNetwork, type SettlementType, type WorldSize,
} from "./randomWorld.ts";
import { COVER_DENSITY_LEVELS, WORLD_BUILD_STEPS, type CoverDensityLevel, type WorldBuildStep } from "./worldBrief.ts";

/** Most settlements the window may ask for. */
export const MAX_RANDOM_SETTLEMENTS = 8;
/** The content pack World Builder's ground covers and region profile are in. */
export const WORLD_BUILDER_PACK = "worldbuilder";

/** A request's world, without what the build adds (id, name, profile, models). */
export type RandomWorldRequestChoices = Omit<RandomWorldOptions, "id" | "name" | "regionProfile" | "models">;

export const DENSITIES = ["forest", "rocks", "fields"] as const;
export type Density = (typeof DENSITIES)[number];

export interface RandomWorldChoices {
  readonly seed: number;
  readonly size: WorldSize;
  readonly landform: Landform;
  readonly seaSide: SeaSide;
  readonly mountainHeight: MountainHeight;
  readonly settlements: readonly SettlementType[];
  readonly roads: RoadNetwork;
  readonly rivers: number;
  readonly lakes: number;
  readonly cover: CoverName;
  readonly forest: CoverDensityLevel;
  readonly rocks: CoverDensityLevel;
  readonly fields: CoverDensityLevel;
}

/** Forge's defaults, with no river: water actors come in Faz 7 (user decision 2026-11-25). */
export const DEFAULT_RANDOM_WORLD_CHOICES: RandomWorldChoices = {
  seed: 1, size: "medium", landform: "hills", seaSide: "west", mountainHeight: "medium", settlements: ["village", "hamlet"], roads: "exits",
  rivers: 0, lakes: 0, cover: "forest", forest: "medium", rocks: "medium", fields: "medium",
};

/** An island or a coast: the world meets the sea. */
export const isOceanLandform = (landform: Landform): boolean => landform === "island" || landform === "coast";

/** Whether the choices ask for water that is only shaped until Faz 7. */
export const asksForWater = (choices: RandomWorldChoices): boolean => choices.rivers > 0 || choices.lakes > 0 || isOceanLandform(choices.landform);

/** The choices with the generator's rules between them kept (Forge's window did the same on every change). */
export function settleRandomWorldChoices(choices: RandomWorldChoices): RandomWorldChoices {
  const island = choices.landform === "island";
  const size = isOceanLandform(choices.landform) && !oceanWorldSizeSupported(choices.size) ? "small" : choices.size;
  return { ...choices, size, ...(island ? { roads: "between" as const, rivers: 0 } : {}) };
}

/** Stored choices, each field checked; anything unusable falls back to `fallback`. */
export function readRandomWorldChoices(raw: unknown, fallback: RandomWorldChoices = DEFAULT_RANDOM_WORLD_CHOICES): RandomWorldChoices {
  if (typeof raw !== "object" || raw === null) return fallback;
  const given = raw as Record<string, unknown>;
  const pick = <T extends string>(key: string, allowed: readonly T[], current: T): T => (allowed.includes(given[key] as T) ? (given[key] as T) : current);
  const whole = (key: string, max: number, current: number): number => {
    const value = given[key];
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : current;
  };
  const settlements = Array.isArray(given.settlements)
    ? given.settlements.filter((type): type is SettlementType => typeof type === "string" && Object.hasOwn(SETTLEMENT_TYPES, type)).slice(0, MAX_RANDOM_SETTLEMENTS)
    : [];
  return settleRandomWorldChoices({
    seed: whole("seed", 0xffffffff, fallback.seed),
    size: pick("size", Object.keys(WORLD_SIZES) as WorldSize[], fallback.size),
    landform: pick("landform", LANDFORMS, fallback.landform),
    seaSide: pick("seaSide", SEA_SIDES, fallback.seaSide),
    mountainHeight: pick("mountainHeight", MOUNTAIN_HEIGHTS, fallback.mountainHeight),
    settlements: settlements.length > 0 ? settlements : fallback.settlements,
    roads: pick("roads", ROAD_NETWORKS, fallback.roads),
    rivers: whole("rivers", MAX_RANDOM_WATER, fallback.rivers),
    lakes: whole("lakes", MAX_RANDOM_WATER, fallback.lakes),
    cover: pick("cover", Object.keys(COVERS) as CoverName[], fallback.cover),
    forest: pick("forest", COVER_DENSITY_LEVELS, fallback.forest),
    rocks: pick("rocks", COVER_DENSITY_LEVELS, fallback.rocks),
    fields: pick("fields", COVER_DENSITY_LEVELS, fallback.fields),
  });
}

/** The request's `world`. */
export function randomWorldRequest(choices: RandomWorldChoices): RandomWorldRequestChoices {
  return {
    seed: choices.seed, size: choices.size, landform: choices.landform, seaSide: choices.seaSide, mountainHeight: choices.mountainHeight,
    settlements: choices.settlements.map((type) => ({ type })), roads: choices.roads, rivers: choices.rivers, lakes: choices.lakes,
    cover: choices.cover, densities: { forest: choices.forest, rocks: choices.rocks, fields: choices.fields },
  };
}

/** Whether a folder name can hold a generated level: plain names, no dot or space at the end. */
export function plainFolderName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(name) && !name.endsWith(".") && !name.endsWith(" ");
}

/** Why a world cannot be built into the level in `folder` (the request's rule, `validateRandomWorldRequest`), or null when it can. */
export function worldTargetProblem(folder: string): string | null {
  const parts = folder.split("/");
  if (folder.includes(":") || parts.length < 2) return "Bu level projenin içerik klasöründe değil; World Builder yalnız projenin kendi level'larına kurar.";
  if (!parts.every(plainFolderName)) return "Level'ın klasör adında kullanılamayan bir karakter var (yalnız harf, rakam, boşluk, _ . -). Level'ı yeniden adlandırın.";
  return null;
}

/** The summary of a finished build (`world:random`'s `done` event). */
export interface RandomWorldDone {
  readonly type: "done";
  /** Project-relative level folder. */
  readonly level: string;
  readonly brief: string;
  readonly buildings: number;
  readonly bridges: number;
  readonly rivers: number;
  readonly lakes: number;
  readonly actors: number;
  readonly placeholders: number;
  readonly files: number;
  readonly seconds: number;
  readonly notes: readonly string[];
  readonly deferred: readonly string[];
  /** Generated families in it the user has not approved (`WorldBuild.review`). */
  readonly review?: readonly string[];
}

export type RandomWorldEvent =
  | { readonly type: "progress"; readonly step: WorldBuildStep }
  | RandomWorldDone
  | { readonly type: "error"; readonly message: string };

/** One event line of a build (JSON), or null when it is not one. */
export function parseRandomWorldEvent(line: string): RandomWorldEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const event = value as JsonObject;
  if (event.type === "progress") return (WORLD_BUILD_STEPS as readonly unknown[]).includes(event.step) ? (event as unknown as RandomWorldEvent) : null;
  if (event.type === "done") return typeof event.level === "string" ? (event as unknown as RandomWorldEvent) : null;
  if (event.type === "error") return { type: "error", message: typeof event.message === "string" ? event.message : "The build failed." };
  return null;
}

/** Farthest the opening view looks at the ground from, metres: the camera draws to 2.000 m. */
const OVERVIEW_REACH = 1500;
/** How far the opening view looks down, degrees. */
const OVERVIEW_PITCH = 52;

/**
 * A bird's-eye view of a built world from the south (north up, as in the
 * preview), for the editor to open the new level with: aimed a little north of
 * the middle and close enough that the ground stays inside the camera's reach.
 */
export function overviewCameraPose(extent: number, groundHeight = 0): { position: [number, number, number]; quaternion: [number, number, number, number]; up: [number, number, number] } {
  const reach = Math.min(0.8 * extent, OVERVIEW_REACH);
  const pitch = (OVERVIEW_PITCH * Math.PI) / 180;
  return {
    position: [0, groundHeight + reach * Math.sin(pitch), -0.1 * extent + reach * Math.cos(pitch)],
    quaternion: [-Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)],
    up: [0, 1, 0],
  };
}
