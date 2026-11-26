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
/** Wet roughness floor at porosity 0 and the extra at 1: a hard surface turns glossiest. */
export const WET_ROUGHNESS = [0.04, 0.16] as const;
export const SNOW_ROUGHNESS = 0.9;
/** How far snow flattens a material's fine normal toward its geometry, at full snow. */
export const SNOW_NORMAL_SOFTEN = 0.8;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

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

/** The wetness and snow a point shows: the surface amount × its face's share × open sky × the material's acceptance. */
export function surfaceWeatherAt(
  amount: SurfaceWeatherAmount,
  point: { readonly position: Vec3; readonly normal: Vec3; readonly covered: number },
  wind: SurfaceWind | null,
  settings: SurfaceResponseSettings,
  material: MaterialWeather = MATERIAL_WEATHER_DEFAULTS,
): { wet: number; snow: number } {
  const open = 1 - clamp01(point.covered);
  const wet = clamp01(amount.wetness) * wetShare(point.normal, wind, settings) * open * clamp01(material.wetting);
  const snow = clamp01(amount.snowCoverage) * snowShare(point.normal[1], point.position[1], settings) * open * clamp01(material.snowAccept);
  return { wet, snow };
}

export interface SurfaceLook {
  readonly color: Rgb;
  readonly roughness: number;
  readonly metalness: number;
}

/** A surface's look (linear colour) under `wet` and `snow` (from `surfaceWeatherAt`): wet first, snow over it. */
export function weatheredLook(look: SurfaceLook, weather: { wet: number; snow: number }, porosity: number, snowColor: Rgb): SurfaceLook {
  const p = clamp01(porosity);
  const darken = 1 - weather.wet * (WET_DARKEN[0] + WET_DARKEN[1] * p);
  const floor = WET_ROUGHNESS[0] + WET_ROUGHNESS[1] * p;
  const wetRoughness = mix(look.roughness, Math.min(look.roughness, floor), weather.wet);
  return {
    color: [0, 1, 2].map((i) => mix(look.color[i]! * darken, snowColor[i]!, weather.snow)) as unknown as Rgb,
    roughness: mix(wetRoughness, SNOW_ROUGHNESS, weather.snow),
    metalness: mix(look.metalness, 0, weather.snow),
  };
}
