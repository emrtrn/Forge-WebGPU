import { describe, expect, test } from "vitest";
import {
  advanceWeatherProgress,
  blendWeatherMix,
  liveWeatherMix,
  startWeatherTransition,
  weatherMixOf,
  weatherTransitionRunning,
  type WeatherSetting,
} from "./weatherTransition.ts";

const clear: WeatherSetting = { preset: "clear", intensity: 1 };
const rain: WeatherSetting = { preset: "rain", intensity: 1 };
const snow: WeatherSetting = { preset: "snow", intensity: 1 };
const rainToSnow = {
  weather: snow,
  weatherFrom: { rain: 1 },
  weatherProgress: 0,
  weatherSeconds: 4,
};

describe("weather transition", () => {
  test("a setting contributes at most one bounded share", () => {
    expect(weatherMixOf({ ...rain, intensity: 0.7 })).toEqual({ rain: 0.7 });
    expect(weatherMixOf(clear)).toEqual({});
    expect(weatherMixOf({ ...rain, intensity: 0 })).toEqual({});
    expect(weatherMixOf({ ...rain, intensity: Number.NaN })).toEqual({});
    expect(weatherMixOf({ ...rain, intensity: 2 })).toEqual({ rain: 1 });
    expect(weatherMixOf({ ...rain, preset: "hail" as WeatherSetting["preset"] })).toEqual({});
  });

  test("blends both kinds of precipitation within the share budget and copies the endpoints", () => {
    const from = Object.freeze({ rain: 1 });
    const to = Object.freeze({ snow: 1 });
    const start = blendWeatherMix(from, to, 0);
    const end = blendWeatherMix(from, to, 1);
    expect(start).toStrictEqual(from);
    expect(start).not.toBe(from);
    expect(end).toStrictEqual(to);
    expect(end).not.toBe(to);

    const middle = blendWeatherMix(from, to, 0.5);
    expect(middle).toStrictEqual({ rain: 0.5, snow: 0.5 });
    expect(Object.keys(middle)).toEqual(["rain", "snow"]);
    for (let step = 0; step <= 100; step += 1) {
      const mix = blendWeatherMix(from, to, step / 100);
      const sum = Object.values(mix).reduce((total, share) => total + share, 0);
      expect(sum).toBeLessThanOrEqual(1);
    }
  });

  test("live weather eases toward the target and uses it exactly when done or idle", () => {
    expect(liveWeatherMix(rainToSnow)).toStrictEqual(rainToSnow.weatherFrom);
    expect(liveWeatherMix({ ...rainToSnow, weatherProgress: 0.25 })).toStrictEqual({
      rain: 0.84375,
      snow: 0.15625,
    });
    expect(liveWeatherMix({ ...rainToSnow, weatherProgress: 1 })).toStrictEqual({ snow: 1 });
    expect(liveWeatherMix({ weather: snow })).toStrictEqual(weatherMixOf(snow));
  });

  test("progress depends on total simulation time and reaches exactly 1 at the duration", () => {
    const seconds = 4;
    const oneStep = advanceWeatherProgress(0, seconds, 1);
    expect(oneStep).toBeCloseTo(0.25, 9);
    for (const hz of [30, 60, 144]) {
      let progress = 0;
      for (let frame = 1; frame <= hz * seconds; frame += 1) {
        progress = advanceWeatherProgress(progress, seconds, 1 / hz);
        if (frame === hz) expect(progress).toBeCloseTo(oneStep, 9);
      }
      expect(progress).toBe(1);
    }
    expect(advanceWeatherProgress(0, seconds, seconds)).toBe(1);
  });

  test("interrupting a transition preserves the live mix at the new start", () => {
    const state = { ...rainToSnow, weatherProgress: 0.5 };
    const before = liveWeatherMix(state);
    const fields = startWeatherTransition(state, clear, 3);
    expect(fields).toStrictEqual({ weatherFrom: before, weatherProgress: 0, weatherSeconds: 3 });
    expect(liveWeatherMix({ ...fields, weather: clear })).toStrictEqual(before);
  });

  test("invalid durations and equivalent live and target mixes start no transition", () => {
    for (const seconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(startWeatherTransition({ weather: rain }, snow, seconds)).toBeNull();
    }
    expect(startWeatherTransition({ weather: rain }, rain, 1)).toBeNull();
    expect(startWeatherTransition({ weather: clear }, { ...rain, intensity: 0 }, 1)).toBeNull();
  });

  test("a transition needs a starting mix, an unfinished progress, and a positive duration", () => {
    expect(weatherTransitionRunning(rainToSnow)).toBe(true);
    expect(weatherTransitionRunning({ ...rainToSnow, weatherProgress: 1 })).toBe(false);
    expect(weatherTransitionRunning({ ...rainToSnow, weatherSeconds: 0 })).toBe(false);
    expect(weatherTransitionRunning({ weather: snow, weatherProgress: 0, weatherSeconds: 4 })).toBe(false);
  });
});
