// What falls from the sky (plan phase W): the live weather as rain and snow
// strengths. The one reading of "is it raining" for the drawing (W1), the
// surface (W5), the rings (W6) and, later, the sound (6c).

import type { Precipitation } from "./surfaceCondition.ts";
import type { WeatherPreset } from "./worldEnvironment.ts";

const DRY: Readonly<Precipitation> = Object.freeze({ rain: 0, snow: 0 });

export function precipitationOf(weather: { readonly preset: WeatherPreset; readonly intensity: number } | null | undefined): Readonly<Precipitation> {
  if (weather?.preset !== "rain" && weather?.preset !== "snow") return DRY;
  const strength = Number.isFinite(weather.intensity) ? Math.min(1, Math.max(0, weather.intensity)) : 0;
  return weather.preset === "rain" ? { rain: strength, snow: 0 } : { rain: 0, snow: strength };
}
