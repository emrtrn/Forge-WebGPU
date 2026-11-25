// The plant response resolver (vegetation plan PG2, §5.4 / §6.9): a plant
// family's response profile + the live WES state -> what its leaves and wood
// show this frame. Pure and shared: the single `forge.plant` actor and the
// foliage instances of the same family read the same result (PV-WES-02), so
// season, snow and wetness never fork per drawing path. Per-instance variety
// (which leaves fall first, colour spread, wind phase) comes from stable ids
// and the instance seed in the shader, not from here.
//
// - Season: the profile's targets of the season being left and the one being
//   moved to, mixed by WES's season progress (linear in linear colour).
//   Evergreen keeps every leaf; its tints still follow the seasons.
// - Snow: WES `snowCoverage` × the family's acceptance for wood and leaves
//   (the shader adds the up-facing mask, so branch undersides stay dark).
// - Wetness: WES `wetness` × the family's darkening.
// - Wind: the family's flexibility (the shader multiplies the sway).
// No WES (or a hidden one): the summer target, dry, no snow (the base look).

export type PlantSeason = "spring" | "summer" | "autumn" | "winter";

/** The `response` group of a `forge.plantFamily` (features/plant/schema.ts). */
export interface PlantResponseProfile {
  readonly habit: "deciduous" | "evergreen";
  readonly spring: PlantSeasonTarget;
  readonly summer: PlantSeasonTarget;
  readonly autumn: PlantSeasonTarget;
  readonly winter: PlantSeasonTarget;
  readonly windFlex: number;
  readonly snow: { readonly wood: number; readonly leaf: number };
  readonly wetness: number;
  /** Light let through the leaves from behind (generator version 6). */
  readonly translucency?: number;
  /** How much the inside of the crown darkens (generator version 6). */
  readonly crownDepth?: number;
}

export interface PlantSeasonTarget {
  /** Share of leaves shown, 0..1. */
  readonly foliage: number;
  /** sRGB `#rrggbb` multiplier of the leaves. */
  readonly tint: string;
}

/** The WES state the resolver reads (engine/environment/environmentResolve.ts `WorldEnvironmentState`). */
export interface PlantEnvironment {
  readonly season: PlantSeason;
  readonly seasonFrom?: PlantSeason;
  readonly seasonProgress?: number;
  readonly surface: { readonly snowCoverage: number; readonly wetness: number };
}

export interface PlantAppearance {
  /** Leaves shown: a leaf cluster draws while its shedding threshold is below this. */
  readonly foliage: number;
  /** Linear RGB multiplier of the leaves. */
  readonly tint: readonly [number, number, number];
  readonly snowWood: number;
  readonly snowLeaf: number;
  /** 0..1: how much wet darkens wood and leaves. */
  readonly wet: number;
  readonly windFlex: number;
  readonly translucency: number;
  readonly crownDepth: number;
}

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** `#rrggbb` (sRGB) as linear RGB; anything else is white. */
export function linearTint(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return [1, 1, 1];
  const value = Number.parseInt(hex.slice(1), 16);
  return [toLinear(((value >> 16) & 255) / 255), toLinear(((value >> 8) & 255) / 255), toLinear((value & 255) / 255)];
}

export function resolvePlantAppearance(profile: PlantResponseProfile, environment: PlantEnvironment | null): PlantAppearance {
  const to = profile[environment?.season ?? "summer"];
  const progress = environment?.seasonFrom !== undefined ? clamp01(environment.seasonProgress ?? 1) : 1;
  const from = environment?.seasonFrom !== undefined ? profile[environment.seasonFrom] : to;
  const a = linearTint(from.tint), b = linearTint(to.tint);
  const foliage = profile.habit === "evergreen" ? 1 : clamp01(from.foliage + (to.foliage - from.foliage) * progress);
  const snow = clamp01(environment?.surface.snowCoverage ?? 0);
  return {
    foliage,
    tint: [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress, a[2] + (b[2] - a[2]) * progress],
    snowWood: snow * clamp01(profile.snow.wood),
    snowLeaf: snow * clamp01(profile.snow.leaf),
    wet: clamp01(environment?.surface.wetness ?? 0) * clamp01(profile.wetness),
    windFlex: Number.isFinite(profile.windFlex) ? Math.max(0, profile.windFlex) : 1,
    translucency: Math.min(2, Math.max(0, profile.translucency ?? 1)),
    crownDepth: clamp01(profile.crownDepth ?? 1),
  };
}
