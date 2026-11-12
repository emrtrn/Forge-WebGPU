// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { UPHILL_SLOWDOWN_REST, climbSlopeSample, updateUphillSlowdown, uphillSpeedScale } from "./uphillSlowdown.ts";
import { test } from "vitest";

const check = test;

check("uphill slowdown: flat, descending, and standing frames read as no climb", () => {
  assert.equal(climbSlopeSample(0, 0.05), 0);
  assert.equal(climbSlopeSample(-0.2, 0.05), 0); // downhill never speeds up
  assert.equal(climbSlopeSample(0.1, 0), 0); // standing still: no climb
  assert.equal(climbSlopeSample(100, 0.01), 8); // teleport-sized rise is clipped
});

check("uphill slowdown: smoothed slope converges on a ramp and decays after it", () => {
  const dt = 1 / 60;
  let state = UPHILL_SLOWDOWN_REST;
  // 2s on a slope-0.5 ramp (rise = 0.5 * run every frame).
  for (let i = 0; i < 120; i += 1) state = updateUphillSlowdown(state, 0.025, 0.05, dt);
  assert.ok(Math.abs(state.smoothedSlope - 0.5) < 0.01, `converged: ${state.smoothedSlope}`);
  // 2s back on the flat: the slowdown releases.
  for (let i = 0; i < 120; i += 1) state = updateUphillSlowdown(state, 0, 0.05, dt);
  assert.ok(state.smoothedSlope < 0.01, `decayed: ${state.smoothedSlope}`);
});

check("uphill slowdown: spiky stair samples average near the staircase incline", () => {
  // A stair edge delivers the whole 0.3 rise in one frame, then 5 flat frames of
  // 0.1 planar movement each — the same rise/run (0.5) a ramp would spread out.
  const dt = 1 / 60;
  let state = UPHILL_SLOWDOWN_REST;
  const stepOnce = () => {
    state = updateUphillSlowdown(state, 0.3, 0.1, dt);
    let sum = state.smoothedSlope;
    for (let i = 0; i < 5; i += 1) {
      state = updateUphillSlowdown(state, 0, 0.1, dt);
      sum += state.smoothedSlope;
    }
    return sum / 6;
  };
  for (let step = 0; step < 40; step += 1) stepOnce(); // converge
  let mean = 0;
  for (let step = 0; step < 5; step += 1) mean += stepOnce() / 5;
  assert.ok(Math.abs(mean - 0.5) < 0.1, `stair mean slope tracks the incline: ${mean}`);
});

check("uphillSpeedScale maps the smoothed slope to a planar speed multiplier", () => {
  assert.equal(uphillSpeedScale(UPHILL_SLOWDOWN_REST, 0.65), 1);
  assert.ok(Math.abs(uphillSpeedScale({ smoothedSlope: 1 }, 0.65) - 0.65) < 1e-9);
  assert.ok(Math.abs(uphillSpeedScale({ smoothedSlope: 0.5 }, 0.65) - 0.825) < 1e-9);
  assert.ok(Math.abs(uphillSpeedScale({ smoothedSlope: 2 }, 0.65) - 0.65) < 1e-9); // clamped past 45°
  assert.equal(uphillSpeedScale({ smoothedSlope: 1 }, 1), 1); // 1 disables the slowdown
});
