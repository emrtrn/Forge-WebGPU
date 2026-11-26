// What falls from the sky (plan phase W): the live weather as rain and snow
// strengths. The one reading of "is it raining" for the drawing (W1), the
// surface (W5), the rings (W6) and, later, the sound (6c).

import type { Precipitation } from "./surfaceCondition.ts";
import { liveWeatherMix, weatherTransitionRunning, type WeatherStateLike } from "./weatherTransition.ts";
import type { WeatherPreset } from "./worldEnvironment.ts";

const DRY: Readonly<Precipitation> = Object.freeze({ rain: 0, snow: 0 });

export function precipitationOf(weather: { readonly preset: WeatherPreset; readonly intensity: number } | null | undefined): Readonly<Precipitation> {
  if (weather?.preset !== "rain" && weather?.preset !== "snow") return DRY;
  const strength = Number.isFinite(weather.intensity) ? Math.min(1, Math.max(0, weather.intensity)) : 0;
  return weather.preset === "rain" ? { rain: strength, snow: 0 } : { rain: 0, snow: strength };
}

/**
 * The live state's precipitation: the weather's, or while a transition runs
 * (plan phase W2) the rain and snow shares of its mix, both at once while
 * one turns into the other.
 */
export function livePrecipitation(state: WeatherStateLike | null | undefined): Readonly<Precipitation> {
  if (!state || !weatherTransitionRunning(state)) return precipitationOf(state?.weather);
  const mix = liveWeatherMix(state);
  return { rain: mix.rain ?? 0, snow: mix.snow ?? 0 };
}
