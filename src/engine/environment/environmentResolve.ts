// Ported from Forge WebGL engine/environment/environmentResolve.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
import type { ResolvedCloudLayer } from "../legacy/cloudLayer.ts";
import type { ResolvedHeightFog } from "../legacy/heightFog.ts";
import type { Vec3 } from "../legacy/layout.ts";
import type { SurfaceCondition } from "./surfaceCondition.ts";
import { evaluateSunLight, hexToLinear, lerp, smoothstep, TWILIGHT_DEG } from "./sunPath.ts";
import { mixedWeatherFactors, WEATHER_PRESET_TABLE, weatherFactors } from "./weatherPresets.ts";
import { liveWeatherMix, WEATHER_SHARES, weatherMixOf, weatherTransitionRunning, type WeatherMix } from "./weatherTransition.ts";
import type { ResolvedWorldEnvironment, Season, WeatherPreset } from "./worldEnvironment.ts";

/**
 * (authored actors + runtime state) → what the frame should render (WES v0.3
 * §4.2). Pure and deterministic, so the editor viewport and Play resolve the
 * same picture from the same inputs, and node tests can pin it.
 *
 * WES never writes the authored actors (§4.4): the output is an *override* the
 * render binding applies to the three objects, and `null` from the caller (no
 * actor, or a hidden one) means "render exactly what is authored".
 */

/** The live environment: transient preview, A7 shared runtime state in Play. */
export interface WorldEnvironmentState {
  hour: number;
  /** The season shown, or being moved to while `seasonProgress` < 1. */
  season: Season;
  /**
   * A timed season change (vegetation plan PG2, §6.9): from `seasonFrom` to
   * `season`, `seasonProgress` 0..1 of `seasonSeconds` simulation seconds.
   * Absent: the season has been reached.
   */
  seasonFrom?: Season;
  seasonProgress?: number;
  seasonSeconds?: number;
  /** The weather shown, or being moved to while a transition runs (`weatherProgress` < 1). */
  weather: { preset: WeatherPreset; intensity: number };
  /**
   * A timed weather change (plan phase W2, weatherTransition.ts): from the mix
   * `weatherFrom` to `weather`, `weatherProgress` 0..1 of `weatherSeconds`
   * simulation seconds. Absent: the weather has been reached.
   */
  weatherFrom?: WeatherMix;
  weatherProgress?: number;
  weatherSeconds?: number;
  /** The visible surface (plan phase W); targets and authored defaults cover snowCoverage / wetness only. */
  surface: SurfaceCondition;
}

/** The authored values WES adjusts, already resolved from their layout actors. */
export interface AuthoredEnvironmentInputs {
  /** The Sun (directional) light's authored color and intensity; null when the level has none. */
  sun: { color: string; intensity: number } | null;
  sky: { turbidity: number; hidden: boolean } | null;
  fog: ResolvedHeightFog | null;
  cloud: ResolvedCloudLayer | null;
}

export interface ResolvedEnvironment {
  /** True ground → sun direction for the sky dome and the IBL capture (negative y at night). */
  sunDirection: Vec3;
  sunElevationDeg: number;
  /** Override of the Sun light's three object; null when the level has no Sun. */
  light: { direction: Vec3; color: Vec3; intensity: number; isMoon: boolean; shadowStrength: number } | null;
  /** Multiplier of the authored ambient (world settings) intensity. */
  ambientMultiplier: number;
  /** Independent night fill: remains available with no authored ambient or Sun, zero in full daylight. */
  nightAmbient: { color: Vec3; intensity: number };
  /** Visual full moon, following the very same direction as the night directional light. */
  moon: { direction: Vec3; color: Vec3; angularDiameterDeg: number; brightness: number; haloIntensity: number; haloSize: number };
  /** Procedural live-sky stars, independent of night lighting and IBL. */
  stars: { brightness: number; density: number; size: number };
  /** Sky turbidity to render; null when there is no (visible) sky. */
  skyTurbidity: number | null;
  /** The fog to render in place of the authored one; null when there is none. */
  fog: ResolvedHeightFog | null;
  /** The cloud layer to render in place of the authored one; null when there is none. */
  cloud: ResolvedCloudLayer | null;
  /** Plan phase W2b: thick cloud cores darken and edges toward the sun brighten (0: flat, as authored). */
  cloudShade: number;
  /**
   * Plan phase W2b: the sky turns toward its own brightness in `tint` (sRGB
   * 0..1) by `amount`, and the sun disc fades: an overcast sky, also in the
   * Sky Light capture. 0 with clear weather.
   */
  skyOvercast: { amount: number; tint: Vec3 };
  /** Multiplier of the tone-mapping exposure (night eye adaptation). */
  exposureMultiplier: number;
  season: Season;
  surface: WorldEnvironmentState["surface"];
  /** Changes when the IBL must be recaptured regardless of the sun angle (§6.4). */
  captureKey: string;
  /**
   * A weather transition runs: `captureKey` changes every frame, so the Sky
   * Light captures at the rate limit of a moving sun (recaptureRate.ts), and
   * once more when it ends (plan phase W2).
   */
  weatherTransitioning: boolean;
}

const NIGHT_FOG_SCALE = 0.1;
const NIGHT_CLOUD_SCALE = 0.12;
const NIGHT_EXPOSURE = 1.35;
const TWILIGHT_FOG_TINT = "#ffb27a";
const TWILIGHT_CLOUD_TINT = "#ffc59a";

/** The level defaults as the initial runtime state (editor reset, Play start). */
export function stateFromDefaults(env: ResolvedWorldEnvironment): WorldEnvironmentState {
  return {
    hour: env.time.hour,
    season: env.season,
    weather: { ...env.weather },
    surface: { snowCoverage: env.surface.snowCoverage, wetness: env.surface.wetness, puddleFill: 0, snowDepth: 0 },
  };
}

export function resolveEnvironment(
  authored: AuthoredEnvironmentInputs,
  env: ResolvedWorldEnvironment,
  state: WorldEnvironmentState,
): ResolvedEnvironment {
  const sun = evaluateSunLight(state.hour, env);
  // A running transition mixes the presets; without one, the preset's factors as they always were.
  const mix = weatherTransitionRunning(state) ? liveWeatherMix(state) : null;
  const weather = mix ? mixedWeatherFactors(mix) : weatherFactors(state.weather.preset, state.weather.intensity);
  // The clouds and the sky read the authored response per share (one share is one preset).
  const shares = mix ?? weatherMixOf(state.weather);
  const responses = WEATHER_SHARES.flatMap((preset) => {
    const w = shares[preset] ?? 0;
    return w > 0 ? [{ w, r: env.weatherSky[preset] }] : [];
  });

  let light: ResolvedEnvironment["light"] = null;
  if (authored.sun) {
    const authoredColor = hexToLinear(authored.sun.color);
    light = {
      direction: sun.lightDirection,
      color: sun.isMoon
        ? sun.color
        : [authoredColor[0] * sun.color[0], authoredColor[1] * sun.color[1], authoredColor[2] * sun.color[2]],
      intensity: authored.sun.intensity * sun.intensityFactor * weather.sunIntensityMultiplier,
      isMoon: sun.isMoon,
      shadowStrength: sun.isMoon ? env.night.moonShadowStrength : 1,
    };
  }

  let fog: ResolvedHeightFog | null = null;
  if (authored.fog) {
    const f = authored.fog;
    const weathered = mix ? mixFogTints(f.color, mix) : mixHex(f.color, weather.fogTint, weather.fogTintMix);
    const lit = scaleHex(weathered, lerp(NIGHT_FOG_SCALE, 1, sun.daylight));
    const density = weather.fogDensityMultiplier;
    fog = {
      ...f,
      color: mixHex(lit, TWILIGHT_FOG_TINT, 0.35 * sun.twilightWarmth),
      density: f.density * density,
      start: f.start / density,
      end: f.end / density,
      startDistance: f.startDistance / density,
      sunColor: scaleHex(f.sunColor, lerp(NIGHT_FOG_SCALE, 1, sun.daylight)),
    };
  }

  let cloud: ResolvedCloudLayer | null = null;
  if (authored.cloud) {
    const c = authored.cloud;
    let coverage = c.coverage;
    let density = c.density;
    for (const { w, r } of responses) {
      coverage += (Math.max(c.coverage, r.cloudCoverage) - c.coverage) * w;
      density += (Math.max(c.density, r.cloudDensity) - c.density) * w;
    }
    const weathered = mixHexParts(c.color, responses.map(({ w, r }) => [r.cloudColor, r.cloudColorMix * w] as const));
    const lit = scaleHex(weathered, lerp(NIGHT_CLOUD_SCALE, 1, sun.daylight));
    cloud = { ...c, coverage, density, color: mixHex(lit, TWILIGHT_CLOUD_TINT, 0.4 * sun.twilightWarmth) };
  }
  let cloudShade = 0;
  let overcast = 0;
  const tint: Vec3 = [0, 0, 0];
  for (const { w, r } of responses) {
    cloudShade += r.cloudShade * w;
    const t = r.skyOvercast * w;
    if (!(t > 0)) continue;
    overcast += t;
    const rgb = parseHex(r.cloudColor);
    for (let i = 0; i < 3; i++) tint[i] = tint[i]! + (rgb[i]! / 255) * t;
  }

  return {
    sunDirection: sun.sunDirection,
    sunElevationDeg: sun.sunElevationDeg,
    light,
    ambientMultiplier: Math.max(env.night.ambientFloor, sun.daylight),
    nightAmbient: { color: hexToLinear(env.night.moonColor), intensity: env.night.ambientIntensity * (1 - sun.daylight) },
    moon: {
      direction: sun.lightDirection,
      color: hexToLinear(env.night.moonColor),
      angularDiameterDeg: env.night.moonAngularDiameterDeg,
      haloIntensity: env.night.moonBrightness > 0 && sun.isMoon
        ? env.night.moonHaloIntensity * smoothstep(0, TWILIGHT_DEG, -sun.sunElevationDeg) : 0,
      haloSize: env.night.moonHaloSize,
      brightness: sun.isMoon ? env.night.moonBrightness * smoothstep(0, TWILIGHT_DEG, -sun.sunElevationDeg) : 0,
    },
    stars: {
      brightness: env.night.starBrightness * smoothstep(0, 12, -sun.sunElevationDeg)
        * (mix ? lerp(1, FOG_STAR_FLOOR, mix.fog ?? 0) : state.weather.preset === "fog" ? lerp(1, FOG_STAR_FLOOR, weather.weight) : 1),
      density: env.night.starDensity,
      size: env.night.starSize,
    },
    skyTurbidity: authored.sky && !authored.sky.hidden ? authored.sky.turbidity + weather.skyTurbidityAdd : null,
    fog,
    cloud,
    cloudShade,
    skyOvercast: overcast > 0
      ? { amount: Math.min(1, overcast), tint: [tint[0]! / overcast, tint[1]! / overcast, tint[2]! / overcast] }
      : { amount: 0, tint: [1, 1, 1] },
    exposureMultiplier: lerp(NIGHT_EXPOSURE, 1, sun.daylight),
    season: state.season,
    surface: { ...state.surface },
    // The overcast is the World Environment's own: its edits are captured too.
    captureKey: (mix
      ? `mix:${WEATHER_SHARES.map((preset) => round3(mix[preset] ?? 0)).join(",")}:${state.season}`
      : `${state.weather.preset}:${round3(weather.weight)}:${state.season}`)
      + (overcast > 0 ? `:o${round3(Math.min(1, overcast))},${tint.map((c) => round3(c / overcast)).join(",")}` : ""),
    weatherTransitioning: mix !== null,
  };
}

/** Stars left in full fog. */
const FOG_STAR_FLOOR = 0.05;

/** The fog colour under a mix: each share tints it toward its preset's tint (one share is {@link mixHex}). */
function mixFogTints(hex: string, mix: WeatherMix): string {
  return mixHexParts(hex, WEATHER_SHARES.map((preset) => [WEATHER_PRESET_TABLE[preset].fogTint, WEATHER_PRESET_TABLE[preset].fogTintMix * (mix[preset] ?? 0)] as const));
}

/** `hex` moved toward each colour by its amount (sRGB bytes, summed); one part is {@link mixHex}, none is `hex`. */
function mixHexParts(hex: string, parts: readonly (readonly [string, number])[]): string {
  const base = parseHex(hex);
  const out: [number, number, number] = [...base];
  let tinted = false;
  for (const [color, t] of parts) {
    if (!(t > 0)) continue;
    tinted = true;
    const tint = parseHex(color);
    for (let i = 0; i < 3; i++) out[i] = out[i]! + (tint[i]! - base[i]!) * t;
  }
  return tinted ? toHex(out) : hex;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mixes two `#rrggbb` colors (sRGB, `t` 0 = a). Exact for t = 0. */
export function mixHex(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex([lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)]);
}

/** Scales a `#rrggbb` color's brightness. Exact for s = 1. */
export function scaleHex(hex: string, s: number): string {
  if (s === 1) return hex;
  const c = parseHex(hex);
  return toHex([c[0] * s, c[1] * s, c[2] * s]);
}
