// The timed weather change in the live World Environment (plan phase W2): the
// controller's rules (as transitionTo / transitionSeason), the mix reaching
// every reader, and the Sky Light's rate limit. The pure blend is
// weatherTransition.test.ts.
import { describe, expect, test } from "vitest";
import type { ResolvedCloudLayer } from "../legacy/cloudLayer.ts";
import type { ResolvedHeightFog } from "../legacy/heightFog.ts";
import { resolveEnvironment, stateFromDefaults, type AuthoredEnvironmentInputs, type WorldEnvironmentState } from "./environmentResolve.ts";
import { decideRecapture } from "./recaptureRate.ts";
import { mixedWeatherFactors, weatherFactors } from "./weatherPresets.ts";
import { resolveWind } from "./wind.ts";
import { WorldEnvironmentController } from "./worldEnvironmentController.ts";
import { normalizeWorldEnvironment, resolveWorldEnvironment, WEATHER_PRESETS } from "./worldEnvironment.ts";

function controllerAt(hour = 12): WorldEnvironmentController {
  const controller = new WorldEnvironmentController();
  controller.load({ time: { hour, dayLengthMinutes: 0 } } as Parameters<WorldEnvironmentController["load"]>[0]);
  return controller;
}
const steps = (controller: WorldEnvironmentController, count: number, dt: number): void => {
  for (let i = 0; i < count; i += 1) controller.advance(dt);
};

const env = resolveWorldEnvironment(normalizeWorldEnvironment({ time: { hour: 12, dayLengthMinutes: 0 } } as Parameters<typeof normalizeWorldEnvironment>[0]).environment);
const fog: ResolvedHeightFog = {
  name: "Fog", hidden: false, mode: "exp", color: "#8899aa", density: 0.02, heightFalloff: 0.2, baseHeight: 0,
  startDistance: 10, maxOpacity: 1, sunColor: "#ffeecc", sunStrength: 0.5, start: 10, end: 400,
};
const cloud: ResolvedCloudLayer = { name: "Clouds", hidden: false, color: "#ffffff", coverage: 0.4, density: 0.8, softness: 0.5, scale: 1, speed: 0 };
const authored: AuthoredEnvironmentInputs = { sun: { color: "#ffffff", intensity: 3 }, sky: { turbidity: 2, hidden: false }, fog, cloud };
const resolveAt = (state: WorldEnvironmentState) => resolveEnvironment(authored, env, state);
const rendered = (state: WorldEnvironmentState) => {
  const { captureKey: _key, weatherTransitioning: _running, ...rest } = resolveAt(state);
  return rest;
};

describe("world environment controller: weather transition", () => {
  test("blends over the seconds, resolves true and stands at the target", async () => {
    const controller = controllerAt();
    const reached = controller.transitionWeather({ preset: "rain", intensity: 0.8, seconds: 4 });
    expect(controller.current()).toMatchObject({ weather: { preset: "rain", intensity: 0.8 }, weatherFrom: {}, weatherProgress: 0 });
    expect(controller.precipitation()).toEqual({ rain: 0, snow: 0 });
    steps(controller, 60, 1 / 30);
    const halfway = controller.precipitation().rain;
    expect(halfway).toBeCloseTo(0.4, 9); // eased: the middle is half way
    steps(controller, 60, 1 / 30);
    await expect(reached).resolves.toBe(true);
    expect(controller.current()).not.toHaveProperty("weatherProgress");
    expect(controller.current()).not.toHaveProperty("weatherFrom");
    expect(controller.precipitation()).toEqual({ rain: 0.8, snow: 0 });
  });

  test("snow turning into rain: both fall at once, their shares never above the target's", () => {
    const controller = controllerAt();
    controller.setWeather("snow", 1);
    void controller.transitionWeather({ preset: "rain", seconds: 10 });
    for (let i = 0; i < 100; i += 1) {
      controller.advance(0.1);
      const { rain, snow } = controller.precipitation();
      if (i < 99) expect(rain > 0 && snow > 0).toBe(true);
      expect(rain + snow).toBeCloseTo(1, 9);
    }
    expect(controller.precipitation()).toEqual({ rain: 1, snow: 0 });
  });

  test("setWeather, a new transition and the level ending cut it short; a new one starts where it was", async () => {
    const controller = controllerAt();
    const cut = controller.transitionWeather({ preset: "fog", seconds: 2 });
    steps(controller, 10, 0.1);
    const live = resolveAt(controller.getState()).fog!.density;
    const next = controller.transitionWeather({ preset: "snow", seconds: 2 });
    await expect(cut).resolves.toBe(false);
    // Nothing jumps: the new transition starts from the mix the old one reached.
    expect(resolveAt(controller.getState()).fog!.density).toBeCloseTo(live, 12);
    controller.setWeather("cloudy", 0.5);
    await expect(next).resolves.toBe(false);
    expect(controller.current()).not.toHaveProperty("weatherFrom");
    const ended = controller.transitionWeather({ preset: "rain", seconds: 2 });
    controller.clear();
    await expect(ended).resolves.toBe(false);
    await expect(controller.transitionWeather({ preset: "rain", seconds: 2 })).resolves.toBe(false);
  });

  test("no seconds, the weather already shown, or an unknown preset", async () => {
    const controller = controllerAt();
    await expect(controller.transitionWeather({ preset: "rain", intensity: 0.3, seconds: 0 })).resolves.toBe(true);
    expect(controller.current()).toMatchObject({ weather: { preset: "rain", intensity: 0.3 } });
    expect(controller.current()).not.toHaveProperty("weatherProgress");
    await expect(controller.transitionWeather({ preset: "rain", intensity: 0.3, seconds: 5 })).resolves.toBe(true);
    expect(controller.current()).not.toHaveProperty("weatherProgress");
    await expect(controller.transitionWeather({ preset: "hail" as "rain", seconds: 5 })).resolves.toBe(false);
  });

  test("the hour, the season and the weather change independently", async () => {
    const controller = controllerAt(10);
    const hour = controller.transitionTo({ hour: 14, seconds: 2 });
    const season = controller.transitionSeason({ season: "winter", seconds: 2 });
    const weather = controller.transitionWeather({ preset: "snow", seconds: 2 });
    steps(controller, 20, 0.1);
    await expect(Promise.all([hour, season, weather])).resolves.toEqual([true, true, true]);
    expect(controller.current()).toMatchObject({ hour: 14, season: "winter", weather: { preset: "snow", intensity: 1 } });
  });

  test("30 / 60 / 144 Hz and one step give the same state; a restore resumes it without replaying", () => {
    const run = (hz: number) => {
      const controller = controllerAt();
      controller.setWeather("snow", 0.6);
      void controller.transitionWeather({ preset: "rain", intensity: 0.9, seconds: 8 });
      if (hz === 0) controller.advance(3);
      else steps(controller, hz * 3, 1 / hz);
      return controller;
    };
    const [one, ...others] = [run(0), run(30), run(60), run(144)];
    for (const other of others) {
      expect(other.current()!.weatherProgress).toBeCloseTo(one!.current()!.weatherProgress!, 9);
      expect(other.precipitation().rain).toBeCloseTo(one!.precipitation().rain, 9);
    }
    const saved = { ...structuredClone(one!.current()!), surfaceTarget: one!.getSurfaceTarget() };
    const resumed = controllerAt();
    resumed.restore(saved);
    expect(resumed.current()).toEqual(one!.current());
    steps(resumed, 50, 0.1);
    expect(resumed.current()).not.toHaveProperty("weatherProgress");
    expect(resumed.precipitation()).toEqual({ rain: 0.9, snow: 0 });
  });
});

describe("weather transition: every reader sees the mix", () => {
  test("one share is the preset itself: the factors and the picture do not pop when a transition ends", () => {
    for (const preset of WEATHER_PRESETS) {
      for (const intensity of [0, 0.35, 1]) {
        const expected = weatherFactors(preset, intensity);
        const mixed = mixedWeatherFactors(preset === "clear" || intensity === 0 ? {} : { [preset]: intensity });
        // At weight 0 the tint mixes nothing in: which one is named does not matter.
        expect(mixed).toEqual({ ...expected, fogTint: expected.weight > 0 ? expected.fogTint : mixed.fogTint });
        const target = { ...stateFromDefaults(env), weather: { preset, intensity } };
        // A transition from the target's own mix: the mix path at that point.
        const running = { ...target, weatherFrom: preset === "clear" || intensity === 0 ? {} : { [preset]: intensity }, weatherProgress: 0.5, weatherSeconds: 4 };
        expect(rendered(running)).toEqual(rendered(target));
      }
    }
  });

  test("fog, clouds, sun, stars and wind move continuously; the capture key changes, the flag says why", () => {
    const controller = controllerAt();
    void controller.transitionWeather({ preset: "snow", seconds: 2 });
    const densities: number[] = [];
    const keys = new Set<string>();
    for (let i = 0; i <= 20; i += 1) {
      const state = controller.getState();
      const resolved = resolveAt(state);
      densities.push(resolved.fog!.density);
      keys.add(resolved.captureKey);
      if (i < 20) expect(resolved.weatherTransitioning).toBe(true);
      controller.advance(0.1);
    }
    const end = resolveAt(controller.getState());
    expect(end.weatherTransitioning).toBe(false);
    expect(end).toEqual(resolveAt({ ...stateFromDefaults(env), weather: { preset: "snow", intensity: 1 } }));
    for (let i = 1; i < densities.length; i += 1) expect(densities[i]!).toBeGreaterThanOrEqual(densities[i - 1]!);
    expect(keys.size).toBeGreaterThan(10);
    // Wind reads the same mix.
    const windHalf = resolveWind(null, { strength: 0.5, gust: 0 }, { season: "summer", weather: { preset: "rain", intensity: 1 }, weatherFrom: {}, weatherProgress: 0.5, weatherSeconds: 2 });
    expect(windHalf.strength).toBeCloseTo(0.5 * (1 + 0.7 * 0.5), 9);
  });

  test("the Sky Light: a gradual key waits the interval, the resting weather captures at once", () => {
    const request = { sunDirection: [0, 1, 0] as [number, number, number], sunElevationDeg: 90, captureKey: "mix:0,0.1,0,0:summer" };
    const last = { ...request, captureKey: "mix:0,0.09,0,0:summer" };
    const base = { last, lastAt: 1, previousSun: request.sunDirection, request };
    expect(decideRecapture({ ...base, now: 1.05, gradual: true })).toBe(false);
    expect(decideRecapture({ ...base, now: 1.1, gradual: true })).toBe(true);
    // The end of the transition: the key of the reached weather, no longer gradual.
    expect(decideRecapture({ ...base, now: 1.01, request: { ...request, captureKey: "rain:1:summer" } })).toBe(true);
  });
});
