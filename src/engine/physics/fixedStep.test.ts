// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { FixedStepClock, lerpPosition, nlerpQuaternion } from "./fixedStep.ts";
import { test } from "vitest";

const check = test;

// Vehicle plan Faz 0: the Rapier world advances in fixed slices, so the frame
// rate never changes the simulation; the leftover only drives render blending.
check("fixed step clock takes the same slice count at 30, 60 and 144 Hz", () => {
  for (const hz of [30, 60, 144]) {
    const clock = new FixedStepClock({ step: 1 / 60 });
    let steps = 0;
    for (let frame = 0; frame < hz; frame += 1) steps += clock.advance(1 / hz);
    assert.ok(Math.abs(steps - 60) <= 1, `${hz} Hz took ${steps} slices for one second`);
  }
});

check("fixed step clock snaps jittery 60 Hz frames to one slice and caps the backlog", () => {
  const clock = new FixedStepClock({ step: 1 / 60, maxSubsteps: 4 });
  // Real vsync jitter: frames scatter around 1/60 but average exactly to it.
  const jitter = [-0.0007, 0.0005, 0.0002, -0.0003, 0.0006, -0.0003].map((d) => 1 / 60 + d);
  for (let frame = 0; frame < 120; frame += 1) {
    assert.equal(clock.advance(jitter[frame % jitter.length] ?? 0), 1, `frame ${frame}`);
  }
  assert.equal(clock.advance(0), 0);
  assert.equal(clock.advance(Number.NaN), 0);
  assert.equal(clock.advance(1), 4); // a one-second hitch simulates at most 4 slices
  assert.equal(clock.alpha, 0); // ...and drops the rest instead of spiralling
  assert.equal(clock.advance(1 / 120), 0);
  assert.ok(Math.abs(clock.alpha - 0.5) < 1e-9, `alpha=${clock.alpha}`);
  clock.reset();
  assert.equal(clock.alpha, 0);
});

check("pose interpolation lerps position and takes the short rotation path", () => {
  assert.deepEqual(lerpPosition([0, 0, 0], [2, 4, -6], 0.5), [1, 2, -3]);
  const identity = { x: 0, y: 0, z: 0, w: 1 };
  const halfTurnY = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }; // 90° about Y
  const mid = nlerpQuaternion(identity, halfTurnY, 0.5);
  assert.ok(Math.abs(Math.hypot(mid.x, mid.y, mid.z, mid.w) - 1) < 1e-9);
  assert.ok(Math.abs(2 * Math.atan2(mid.y, mid.w) - Math.PI / 4) < 1e-9, "midpoint is 45°");
  // The same rotation with a flipped sign must not blend the long way round.
  const negated = { x: -halfTurnY.x, y: -halfTurnY.y, z: -halfTurnY.z, w: -halfTurnY.w };
  const short = nlerpQuaternion(identity, negated, 0.5);
  assert.ok(Math.abs(Math.abs(2 * Math.atan2(short.y, short.w)) - Math.PI / 4) < 1e-9);
});
