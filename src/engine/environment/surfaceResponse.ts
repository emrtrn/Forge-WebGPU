// How a surface takes the World Environment's wetness and snow (plan phase W4,
// architecture §4.9; new to Forge WebGPU). Pure: the shader
// (render/materials/surfaceCover.ts) repeats these formulas, and this CPU twin
// is what tests and gameplay read.
//
// - Wetness share by the face's world normal: a face looking up takes all of
//   it, a standing face `verticalWetting` (more on the side the wind comes
//   from, `windwardWetting` at wind strength 1), a face looking down none.
// - Snow share: the slope window (`snowSlopeStartDeg`..`snowSlopeEndDeg`) and
//   the altitude floor, as on terrain since 5a.
// - Under the precipitation cover (a roof, an overhang) neither. The cover is
//   read a little above the point and out along the face's horizontal normal,
//   so a face is not sheltered by its own texel and a wall is sheltered only
//   by what overhangs it.
// - A material accepts a share of both (`forge.material` `weather`): porous
//   surfaces darken when wet, hard ones turn glossy; snow is white, rough and
//   never metal.

export type Vec3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];

/** The World Environment's settings the response reads (`surface` group). */
export interface SurfaceResponseSettings {
  /** Share of the wetness a standing face takes, 0..1. */
  readonly verticalWetting: number;
  /** Extra share on the face the wind comes from, at wind strength 1, 0..1. */
  readonly windwardWetting: number;
  readonly snowSlopeStartDeg: number;
  readonly snowSlopeEndDeg: number;
  /** World Y snow starts at; null: everywhere. */
  readonly snowMinAltitude: number | null;
  readonly snowAltitudeBlend: number;
  /** Steepest slope (degrees) that holds standing water's gloss; steeper faces only take the wet film. Absent: the default. */
  readonly puddleMaxSlopeDeg?: number;
}

/**
 * Patchy drying (plan phase W5, design 5): the level's wetness and standing
 * water are single numbers; a point shows them by how late it dries (`late`,
 * 0 first .. 1 last). Hollows (a material's ambient occlusion, terrain's
 * concave ground) and world-space noise dry late, so a drying surface breaks
 * into wet patches instead of fading evenly; while standing water remains,
 * the late places stay damp, the rims of the hollows last. At wetness 1 every
 * point is fully wet, at 0 (and no standing water) every point is dry, so the
 * look at those ends is W4's.
 */
/** Width of the wetness window over which one point dries. */
export const DRY_BAND = 0.35;
/** Noise patch sizes (m) and their weights. */
export const DRY_NOISE = [[6, 0.65], [1.7, 0.35]] as const;
/** The noise is sharpened through this window so patches have edges. */
export const DRY_NOISE_EDGE = [0.25, 0.75] as const;
/** Terrain's concavity (negative divergence of the ground normal, 1/m) that counts as a full hollow is 1 / this. */
export const CAVITY_CURVATURE = 3;

const fract = (value: number): number => value - Math.floor(value);

/** Dave Hoskins' hash12 (no sine: the GPU's float32 and the CPU agree closely). */
export function hash12(x: number, y: number): number {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1031);
  let c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}

/** Smooth value noise on the lattice, 0..1. */
export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const bottom = mix(hash12(ix, iy), hash12(ix + 1, iy), ux);
  const top = mix(hash12(ix, iy + 1), hash12(ix + 1, iy + 1), ux);
  return mix(bottom, top, uy);
}

/**
 * How far the patches reach (a W5 refinement, World Environment `surface`):
 * the look's input is the live amount × its spread, so at spread < 1 the
 * patches grow from the late places (hollows first) and stop where the spread
 * ends, while the live state (`wetness`, `puddleFill`, `snowCoverage`) and the
 * surface model still run to 1. Snow follows the same pattern as wetness: it
 * settles where the surface dries last and melts open patch by patch.
 * `patchSize` scales both noise sizes. All three at 1 is the W5 look.
 */
export interface SurfacePattern {
  /** Share of the wetness (and standing water) the look reaches, 0..1. */
  readonly wetSpread: number;
  /** Share of the snow coverage the look reaches, 0..1. */
  readonly snowSpread: number;
  /** Multiplier on the noise patch sizes (`DRY_NOISE`). */
  readonly patchSize: number;
}

export const SURFACE_PATTERN_DEFAULTS: SurfacePattern = { wetSpread: 1, snowSpread: 1, patchSize: 1 };
/** `patchSize`'s range (schema and normalizer). */
export const PATCH_SIZE_RANGE = [0.25, 4] as const;

/** A pattern's `patchSize`, clamped to its range. */
export function patchSizeOf(pattern: Partial<SurfacePattern> | null | undefined): number {
  return Math.min(PATCH_SIZE_RANGE[1], Math.max(PATCH_SIZE_RANGE[0], pattern?.patchSize ?? 1));
}

/** How late a point dries, 0..1: world-space noise (sizes × `patchSize`), pushed late by its hollowness (`cavity`, 0..1). */
export function dryingLateness(worldX: number, worldZ: number, cavity = 0, patchSize = 1): number {
  let noise = 0;
  for (const [size, weight] of DRY_NOISE) noise += weight * valueNoise(worldX / (size * patchSize), worldZ / (size * patchSize));
  const patches = smoothstep(DRY_NOISE_EDGE[0], DRY_NOISE_EDGE[1], noise);
  return patches + (1 - patches) * clamp01(cavity);
}

/** Terrain's hollowness from the divergence of its ground normal (1/m; negative is concave). */
export function cavityFromDivergence(divergence: number): number {
  return clamp01(-divergence * CAVITY_CURVATURE);
}

/** How much of a patch shows at `amount` for a point that dries / melts `late` (0 first .. 1 last). */
function patchAt(amount: number, late: number): number {
  const start = (1 - late) * (1 - DRY_BAND);
  return smoothstep(start, start + DRY_BAND, clamp01(amount));
}

/** The wetness a point shows (before its face's share): the surface's wetness and standing water × `spread`, by how late it dries. */
export function patchyWetness(wetness: number, puddleFill: number, late: number, spread = 1): number {
  const l = clamp01(late);
  const s = clamp01(spread);
  return Math.max(patchAt(wetness * s, l), l * patchAt(puddleFill * s, l));
}

/** The snow a point shows (before its face's share): the coverage × `spread`, in wetness's pattern (late places first). */
export function patchySnow(snowCoverage: number, late: number, spread = 1): number {
  return patchAt(snowCoverage * clamp01(spread), clamp01(late));
}

/** The wind the rain is driven by: `direction` is the unit XZ vector it blows toward. */
export interface SurfaceWind {
  readonly direction: readonly [number, number];
  readonly strength: number;
}

/** A material's response (`forge.material` `weather`). */
export interface MaterialWeather {
  /** How much of the wetness it takes, 0..1. */
  readonly wetting: number;
  /** 0 hard (turns glossy when wet), 1 porous (darkens, stays matte). */
  readonly porosity: number;
  /** How much of the snow it takes, 0..1. */
  readonly snowAccept: number;
  /** How much standing water it may hold (phase W6), 0..1. */
  readonly puddleAccept: number;
}

export const MATERIAL_WEATHER_DEFAULTS: MaterialWeather = { wetting: 1, porosity: 0.5, snowAccept: 1, puddleAccept: 1 };

/** A material takes no weather at all: its draw is left as it is (nothing compiled for it). */
export function materialTakesNoWeather(material: MaterialWeather): boolean {
  return material.wetting <= 0 && material.snowAccept <= 0;
}

/** Above this normal Y a face is as wet as a flat one (about 45°). */
export const WET_UP_FULL = 0.7;
/** Below minus this normal Y a face is dry (30° under the horizon). */
export const WET_DOWN_DRY = 0.5;
/** The cover is read this far (m) above the point… */
export const COVER_READ_LIFT = 0.2;
/** …and this far (m) out along the face's horizontal normal. */
export const COVER_READ_OUT = 0.4;
/** Wet darkening at porosity 0 and the extra at 1: a porous surface darkens most. */
export const WET_DARKEN = [0.1, 0.4] as const;
/** Wet roughness floor at porosity 0 and the extra at 1: a hard surface turns glossiest. Flat ground, where water stands. */
export const WET_ROUGHNESS = [0.04, 0.16] as const;
/** Wet roughness floor on a slope or a wall (a film, water runs off, no standing water): porosity 0 and the extra at 1. */
export const WET_FILM_ROUGHNESS = [0.3, 0.25] as const;
/** `puddleMaxSlopeDeg`'s default, and the degrees past it over which the standing-water gloss gives way to the film's. */
export const PUDDLE_MAX_SLOPE_DEG = 5;
export const PUDDLE_SLOPE_BLEND_DEG = 5;
export const SNOW_ROUGHNESS = 0.9;
/** How far snow flattens a material's fine normal toward its geometry, at full snow. */
export const SNOW_NORMAL_SOFTEN = 0.8;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

/** The wind's share on a face (0..1 per strength), from the face's horizontal normal. */
export function windwardShare(normal: Vec3, wind: SurfaceWind | null): number {
  if (!wind) return 0;
  const length = Math.hypot(normal[0], normal[2]);
  if (length < 1e-4) return 0;
  // The face looks into the wind: its normal points against where the wind blows.
  const facing = Math.max(0, -(normal[0] * wind.direction[0] + normal[2] * wind.direction[1]) / Math.max(length, 1e-4));
  return facing * Math.min(1, Math.max(0, wind.strength));
}

/** Share of the wetness a face takes from its world normal (unit): 1 up, `verticalWetting` (+ wind) standing, 0 down. */
export function wetShare(normal: Vec3, wind: SurfaceWind | null, settings: SurfaceResponseSettings): number {
  const up = Math.min(1, Math.max(-1, normal[1]));
  const side = Math.min(1, clamp01(settings.verticalWetting) + clamp01(settings.windwardWetting) * windwardShare(normal, wind));
  return side * (1 - smoothstep(0, WET_DOWN_DRY, -up)) + (1 - side) * smoothstep(0, WET_UP_FULL, up);
}

/** The normal Y window of the standing-water gloss: none at or below `[0]`, full from `[1]`. */
export function poolSlopeWindow(maxSlopeDeg = PUDDLE_MAX_SLOPE_DEG): [number, number] {
  const start = Math.min(89, Math.max(0, maxSlopeDeg));
  const end = Math.min(90, start + PUDDLE_SLOPE_BLEND_DEG);
  const low = Math.cos((end * Math.PI) / 180);
  return [low, Math.max(low + 0.00001, Math.cos((start * Math.PI) / 180))];
}

/** Share of the standing-water gloss a face takes from its slope (user decision 2026-11-26): flat 1, steeper than the window 0. */
export function poolShare(normalY: number, maxSlopeDeg?: number): number {
  const [low, high] = poolSlopeWindow(maxSlopeDeg);
  return smoothstep(low, high, normalY);
}

/** Share of the snow a face takes: its slope and its height. */
export function snowShare(normalY: number, worldY: number, settings: SurfaceResponseSettings): number {
  const start = Math.min(settings.snowSlopeStartDeg, settings.snowSlopeEndDeg);
  const end = Math.max(settings.snowSlopeStartDeg, settings.snowSlopeEndDeg);
  const low = Math.cos((end * Math.PI) / 180);
  const high = Math.max(low + 0.00001, Math.cos((start * Math.PI) / 180));
  const slope = smoothstep(low, high, normalY);
  const floor = settings.snowMinAltitude ?? -1000000;
  const height = smoothstep(floor, floor + Math.max(0.001, settings.snowAltitudeBlend), worldY);
  return slope * height;
}

/** Where the cover is read for a point and its face (see the header). */
export function coverReadPoint(position: Vec3, normal: Vec3): Vec3 {
  return [position[0] + normal[0] * COVER_READ_OUT, position[1] + COVER_READ_LIFT, position[2] + normal[2] * COVER_READ_OUT];
}

export interface SurfaceWeatherAmount {
  /** The World Environment's surface now (`WorldEnvironmentState.surface`). */
  readonly wetness: number;
  readonly snowCoverage: number;
}

/** The surface amount a point sees: its patchy wetness and snow (`patchyWetness`, `patchySnow`); feed it to `surfaceWeatherAt`. */
export function surfaceAmountAt(
  surface: { readonly wetness: number; readonly puddleFill?: number; readonly snowCoverage: number },
  position: Vec3,
  cavity = 0,
  pattern: Partial<SurfacePattern> = SURFACE_PATTERN_DEFAULTS,
): SurfaceWeatherAmount {
  const late = dryingLateness(position[0], position[2], cavity, patchSizeOf(pattern));
  return {
    wetness: patchyWetness(surface.wetness, surface.puddleFill ?? 0, late, pattern.wetSpread ?? 1),
    snowCoverage: patchySnow(surface.snowCoverage, late, pattern.snowSpread ?? 1),
  };
}

/** The wetness and snow a point shows: the surface amount × its face's share × open sky × the material's acceptance. */
export function surfaceWeatherAt(
  amount: SurfaceWeatherAmount,
  point: { readonly position: Vec3; readonly normal: Vec3; readonly covered: number },
  wind: SurfaceWind | null,
  settings: SurfaceResponseSettings,
  material: MaterialWeather = MATERIAL_WEATHER_DEFAULTS,
): { wet: number; snow: number; pool: number } {
  const open = 1 - clamp01(point.covered);
  const wet = clamp01(amount.wetness) * wetShare(point.normal, wind, settings) * open * clamp01(material.wetting);
  const snow = clamp01(amount.snowCoverage) * snowShare(point.normal[1], point.position[1], settings) * open * clamp01(material.snowAccept);
  return { wet, snow, pool: poolShare(point.normal[1], settings.puddleMaxSlopeDeg) };
}

export interface SurfaceLook {
  readonly color: Rgb;
  readonly roughness: number;
  readonly metalness: number;
}

/**
 * A surface's look (linear colour) under `wet` and `snow` (from `surfaceWeatherAt`): wet first, snow over it. The
 * wet gloss is standing water's on flat ground (`pool` 1) and a film's on slopes and walls (`pool` 0).
 */
export function weatheredLook(look: SurfaceLook, weather: { wet: number; snow: number; pool?: number }, porosity: number, snowColor: Rgb): SurfaceLook {
  const p = clamp01(porosity);
  const darken = 1 - weather.wet * (WET_DARKEN[0] + WET_DARKEN[1] * p);
  const film = WET_FILM_ROUGHNESS[0] + WET_FILM_ROUGHNESS[1] * p;
  const floor = mix(film, WET_ROUGHNESS[0] + WET_ROUGHNESS[1] * p, clamp01(weather.pool ?? 1));
  const wetRoughness = mix(look.roughness, Math.min(look.roughness, floor), weather.wet);
  return {
    color: [0, 1, 2].map((i) => mix(look.color[i]! * darken, snowColor[i]!, weather.snow)) as unknown as Rgb,
    roughness: mix(wetRoughness, SNOW_ROUGHNESS, weather.snow),
    metalness: mix(look.metalness, 0, weather.snow),
  };
}
