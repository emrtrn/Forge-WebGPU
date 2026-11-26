// Timed weather transitions for plan phase W2 (architecture §4.9).
// This is a pure, three-free module, not a Forge port.
// Each mix holds the shares of active weather presets and leaves the rest clear.
// Simulation time advances the blend toward a target with smoothstep easing.
// An interrupted transition starts again from the current mix.

import type { WeatherPreset } from "./worldEnvironment.ts";

/** The presets that have a share in a mix (clear is the remainder). */
export type WeatherShare = Exclude<WeatherPreset, "clear">;
export const WEATHER_SHARES: readonly WeatherShare[] = ["cloudy", "rain", "snow", "fog"];

/** Share of each non-clear preset, 0..1, summing to at most 1; absent is 0. */
export type WeatherMix = Readonly<Partial<Record<WeatherShare, number>>>;

export interface WeatherSetting {
  readonly preset: WeatherPreset;
  readonly intensity: number;
}

/** What a running transition adds to the live state (absent: no transition). */
export interface WeatherTransitionFields {
  /** The mix the transition started from. */
  readonly weatherFrom: WeatherMix;
  /** Linear progress 0..1 (eased when blended). */
  readonly weatherProgress: number;
  /** Simulation seconds the whole transition takes (> 0). */
  readonly weatherSeconds: number;
}

/** The live state's weather part; `weather` is the target while a transition runs. */
export interface WeatherStateLike extends Partial<WeatherTransitionFields> {
  readonly weather: WeatherSetting;
}

export interface WeatherTransitionRequest {
  readonly preset: WeatherPreset;
  /** 0..1, default 1. */
  readonly intensity?: number;
  readonly seconds: number;
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function weatherMixOf(weather: WeatherSetting): WeatherMix {
  const { preset } = weather;
  const intensity = clampUnit(weather.intensity);
  if (intensity === 0 || preset === "clear" || !WEATHER_SHARES.includes(preset)) return {};
  return { [preset]: intensity };
}

function positiveShare(value = 0): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function blendWeatherMix(from: WeatherMix, to: WeatherMix, t: number): WeatherMix {
  const progress = clampUnit(t);
  if (progress <= 0) return { ...from };
  if (progress >= 1) return { ...to };

  const mix: Partial<Record<WeatherShare, number>> = {};
  for (const share of WEATHER_SHARES) {
    const a = positiveShare(from[share]);
    const b = positiveShare(to[share]);
    const value = a + (b - a) * progress;
    if (value > 0) mix[share] = value;
  }
  return mix;
}

export function easeWeatherProgress(progress: number): number {
  const t = clampUnit(progress);
  return t * t * (3 - 2 * t);
}

export function weatherTransitionRunning(state: WeatherStateLike): boolean {
  const { weatherFrom, weatherProgress, weatherSeconds } = state;
  return typeof weatherFrom === "object" && weatherFrom !== null
    && typeof weatherProgress === "number" && Number.isFinite(weatherProgress) && weatherProgress < 1
    && typeof weatherSeconds === "number" && Number.isFinite(weatherSeconds) && weatherSeconds > 0;
}

export function liveWeatherMix(state: WeatherStateLike): WeatherMix {
  const target = weatherMixOf(state.weather);
  if (!weatherTransitionRunning(state)) return target;
  return blendWeatherMix(state.weatherFrom!, target, easeWeatherProgress(state.weatherProgress!));
}

export function startWeatherTransition(
  state: WeatherStateLike,
  target: WeatherSetting,
  seconds: number,
): WeatherTransitionFields | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const weatherFrom = liveWeatherMix(state);
  if (sameWeatherMix(weatherFrom, weatherMixOf(target))) return null;
  return { weatherFrom, weatherProgress: 0, weatherSeconds: seconds };
}

export function advanceWeatherProgress(progress: number, seconds: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return progress;
  if (!Number.isFinite(seconds) || seconds <= 0) return 1;
  const next = progress + dt / seconds;
  return next >= 1 - 1e-9 ? 1 : Math.max(0, next);
}

export function sameWeatherMix(a: WeatherMix, b: WeatherMix): boolean {
  return WEATHER_SHARES.every((share) => Math.abs((a[share] ?? 0) - (b[share] ?? 0)) <= 1e-12);
}
