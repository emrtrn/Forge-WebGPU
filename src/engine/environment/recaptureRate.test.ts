import { describe, expect, test } from "vitest";
import type { Vec3 } from "../legacy/layout.ts";
import { angleBetweenDeg, shouldRecapture, type CaptureRecord } from "./recapturePolicy.ts";
import { decideRecapture, MIN_RECAPTURE_INTERVAL_SECONDS } from "./recaptureRate.ts";
import { evaluateSunLight } from "./sunPath.ts";
import { advanceTimeTransition, startTimeTransition, transitionHour, type TimeTransition } from "./timeTransition.ts";
import { normalizeWorldEnvironment, resolveWorldEnvironment } from "./worldEnvironment.ts";

const env = resolveWorldEnvironment(
  normalizeWorldEnvironment({ time: { hour: 10, dayLengthMinutes: 0 }, sunPath: { azimuthDeg: 96 } } as Parameters<typeof normalizeWorldEnvironment>[0]).environment,
);
const sunAt = (hour: number) => {
  const sun = evaluateSunLight(hour, env);
  return { sunDirection: sun.sunDirection, sunElevationDeg: sun.sunElevationDeg, captureKey: "clear:1:summer" };
};

/** Frames of a transition plus `after` still frames: which captured, with the policy given. */
function simulate(seconds: number, fps: number, after: number, policy: "rate" | "forge") {
  let transition: TimeTransition = startTimeTransition(10, { hour: 22, seconds })!;
  let last: CaptureRecord | null = null;
  let lastAt = Number.NEGATIVE_INFINITY;
  let previousSun: Vec3 | null = null;
  const captureTimes: number[] = [];
  let request = sunAt(10);
  const frames = Math.round(seconds * fps) + after;
  for (let frame = 0; frame <= frames; frame += 1) {
    const now = frame / fps;
    if (frame > 0) transition = advanceTimeTransition(transition, 1 / fps);
    request = sunAt(transitionHour(transition));
    const capture = policy === "rate"
      ? decideRecapture({ last, lastAt, now, previousSun, request })
      : shouldRecapture(last, request);
    if (capture) {
      last = { ...request };
      lastAt = now;
      captureTimes.push(now);
    }
    previousSun = request.sunDirection;
  }
  return { captureTimes, last: last!, final: request };
}

describe("sky light recapture rate", () => {
  test("a 5 s day-to-night at 60 Hz: about half of Forge's captures, never two within the interval while the sun moves", () => {
    const forge = simulate(5, 60, 0, "forge");
    const rated = simulate(5, 60, 30, "rate");
    expect(forge.captureTimes.length).toBeGreaterThan(60);
    expect(rated.captureTimes.length).toBeLessThan(forge.captureTimes.length * 0.65);
    expect(rated.captureTimes.length).toBeGreaterThan(20);
    // While moving (all but the settle capture), the interval holds.
    const moving = rated.captureTimes.filter((time) => time <= 5);
    for (let i = 1; i < moving.length; i += 1) {
      expect(moving[i]! - moving[i - 1]!).toBeGreaterThanOrEqual(MIN_RECAPTURE_INTERVAL_SECONDS - 1e-9);
    }
  });

  test("the resting sun is captured exactly once the transition stops", () => {
    const rated = simulate(5, 60, 30, "rate");
    expect(angleBetweenDeg(rated.last.sunDirection, rated.final.sunDirection)).toBe(0);
    // One settle capture after the end, then nothing while still.
    expect(rated.captureTimes.filter((time) => time > 5)).toHaveLength(1);
    // Forge's policy alone may rest away from the final sun.
    const forge = simulate(5, 60, 30, "forge");
    expect(angleBetweenDeg(forge.last.sunDirection, forge.final.sunDirection)).toBeGreaterThan(0);
  });

  test("first capture, a weather or season change and scrubbing keep Forge's rules", () => {
    const request = sunAt(12);
    expect(decideRecapture({ last: null, lastAt: 0, now: 0, previousSun: null, request })).toBe(true);
    const last = { ...request };
    // A new capture key captures at once, even inside the interval.
    expect(decideRecapture({ last, lastAt: 1, now: 1.01, previousSun: request.sunDirection, request: { ...request, captureKey: "rain:1:summer" } })).toBe(true);
    // Scrubbing never captures; its release (the sun still) does once.
    const moved = sunAt(15);
    expect(decideRecapture({ last, lastAt: 0, now: 5, previousSun: request.sunDirection, request: { ...moved, scrubbing: true } })).toBe(false);
    expect(decideRecapture({ last, lastAt: 0, now: 5, previousSun: moved.sunDirection, request: moved })).toBe(true);
    // Still and already captured: nothing.
    expect(decideRecapture({ last, lastAt: 0, now: 5, previousSun: request.sunDirection, request })).toBe(false);
  });

  test("a moving sun inside the interval waits even past the angle step", () => {
    const from = sunAt(17.5);
    const to = sunAt(18.5);
    expect(shouldRecapture(from, to)).toBe(true);
    expect(decideRecapture({ last: from, lastAt: 1, now: 1.05, previousSun: from.sunDirection, request: to })).toBe(false);
    expect(decideRecapture({ last: from, lastAt: 1, now: 1.1, previousSun: from.sunDirection, request: to })).toBe(true);
  });
});
