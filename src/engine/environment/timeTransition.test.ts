import { describe, expect, test } from "vitest";
import {
  advanceTimeTransition,
  forwardHours,
  startTimeTransition,
  transitionDone,
  transitionHour,
  transitionProgress,
  type TimeTransition,
} from "./timeTransition.ts";

const run = (transition: TimeTransition, steps: readonly number[]): TimeTransition =>
  steps.reduce((t, dt) => advanceTimeTransition(t, dt), transition);

describe("time transition", () => {
  test("time only runs forward: an earlier target crosses midnight, an equal one is no distance", () => {
    expect(forwardHours(10, 22)).toBe(12);
    expect(forwardHours(20, 6)).toBe(10);
    expect(forwardHours(23.5, 0.5)).toBe(1);
    expect(forwardHours(6, 6)).toBe(0);
    expect(forwardHours(0, 24)).toBe(0);
    expect(forwardHours(-2, 26)).toBe(4);
  });

  test("no time, no distance or a non-finite input starts no transition", () => {
    expect(startTimeTransition(10, { hour: 22, seconds: 0 })).toBeNull();
    expect(startTimeTransition(10, { hour: 22, seconds: -1 })).toBeNull();
    expect(startTimeTransition(10, { hour: 22, seconds: Number.POSITIVE_INFINITY })).toBeNull();
    expect(startTimeTransition(10, { hour: 10, seconds: 5 })).toBeNull();
    expect(startTimeTransition(10, { hour: 34, seconds: 5 })).toBeNull();
    expect(startTimeTransition(10, { hour: Number.NaN, seconds: 5 })).toBeNull();
    expect(startTimeTransition(Number.NaN, { hour: 3, seconds: 5 })).toBeNull();
    expect(startTimeTransition(10, { hour: 22, seconds: 5 })).toEqual({ fromHour: 10, hours: 12, seconds: 5, elapsed: 0 });
  });

  test("eased in and out: still at both ends, half way at half time, monotonic", () => {
    const start = startTimeTransition(10, { hour: 22, seconds: 4 })!;
    expect(transitionHour(start)).toBe(10);
    expect(transitionHour(run(start, [2]))).toBeCloseTo(16, 12);
    // Slow near the ends, fast in the middle.
    const early = transitionHour(run(start, [0.4])) - 10;
    const middle = transitionHour(run(start, [2.2])) - transitionHour(run(start, [1.8]));
    expect(early).toBeLessThan(middle);
    let last = transitionHour(start);
    for (let i = 1; i <= 100; i += 1) {
      const hour = transitionHour(run(start, [i * 0.04]));
      expect(hour).toBeGreaterThanOrEqual(last);
      last = hour;
    }
    expect(last).toBe(22);
  });

  test("lands exactly on the target and stops there, whatever the frame steps", () => {
    const start = startTimeTransition(10, { hour: 22, seconds: 5 })!;
    for (const fps of [30, 60, 144]) {
      const done = run(start, Array.from({ length: Math.ceil(5 * fps) + 3 }, () => 1 / fps));
      expect(transitionDone(done)).toBe(true);
      expect(done.elapsed).toBe(5);
      expect(transitionHour(done)).toBe(22);
      expect(transitionProgress(done)).toBe(1);
    }
    // One long step overshoots nothing.
    expect(transitionHour(run(start, [60]))).toBe(22);
  });

  test("the hour reached does not depend on the frame rate", () => {
    const start = startTimeTransition(10, { hour: 22, seconds: 5 })!;
    const at30 = run(start, Array.from({ length: 60 }, () => 1 / 30));
    const at120 = run(start, Array.from({ length: 240 }, () => 1 / 120));
    expect(transitionHour(at30)).toBeCloseTo(transitionHour(at120), 9);
  });

  test("a transition across midnight wraps the hour into [0, 24) and ends on the target", () => {
    const start = startTimeTransition(20, { hour: 6, seconds: 10 })!;
    expect(start.hours).toBe(10);
    expect(transitionHour(run(start, [5]))).toBeCloseTo(1, 12);
    for (let i = 0; i <= 50; i += 1) {
      const hour = transitionHour(run(start, [i * 0.2]));
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThan(24);
    }
    expect(transitionHour(run(start, [10]))).toBe(6);
  });

  test("negative, zero and non-finite steps are ignored", () => {
    const start = startTimeTransition(10, { hour: 22, seconds: 5 })!;
    expect(run(start, [-1, 0, Number.NaN, Number.POSITIVE_INFINITY])).toBe(start);
  });

  test("a new transition replaces the running one from the hour it reached: no jump", () => {
    const first = run(startTimeTransition(10, { hour: 22, seconds: 4 })!, [2]);
    const reached = transitionHour(first);
    const second = startTimeTransition(reached, { hour: 6, seconds: 3 })!;
    expect(transitionHour(second)).toBe(reached);
    expect(second.hours).toBeCloseTo(14, 12);
    expect(transitionHour(run(second, [3]))).toBe(6);
  });
});
