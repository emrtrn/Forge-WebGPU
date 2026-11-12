// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { freshStuckState, isStuck, separationSteering, updateStuckState } from "./localAvoidance.ts";
import { test } from "vitest";

const check = test;

check("separation steering pushes away from overlapping neighbors and clamps", () => {
  // Neighbor directly ahead (+X) within range: push is straight back (-X).
  const push = separationSteering([0, 0, 0], 0.35, [
    { position: [0.5, 0, 0], radius: 0.35 },
  ]);
  assert.ok(push[0] < 0, `expected -X push, got ${push}`);
  assert.ok(Math.abs(push[1]) < 1e-9);

  // A clear neighbor (outside radius + buffer) contributes nothing.
  const clear = separationSteering([0, 0, 0], 0.35, [
    { position: [3, 0, 0], radius: 0.35 },
  ]);
  assert.deepEqual(clear, [0, 0]);

  // Y separation is ignored: the check is planar.
  const planar = separationSteering([0, 0, 0], 0.35, [
    { position: [0.5, 5, 0], radius: 0.35 },
  ]);
  assert.ok(planar[0] < 0);

  // Many close neighbors: the summed push is clamped to maxMagnitude.
  const crowded = separationSteering(
    [0, 0, 0],
    0.35,
    [
      { position: [0.1, 0, 0], radius: 0.35 },
      { position: [0.1, 0, 0.05], radius: 0.35 },
      { position: [0.1, 0, -0.05], radius: 0.35 },
    ],
    { maxMagnitude: 1 },
  );
  assert.ok(Math.hypot(crowded[0], crowded[1]) <= 1 + 1e-9);

  // Exactly co-located agents still separate (deterministic +X fallback).
  const stacked = separationSteering([1, 0, 1], 0.35, [
    { position: [1, 0, 1], radius: 0.35 },
  ]);
  assert.ok(stacked[0] > 0);
  assert.equal(stacked[1], 0);
});

check("stuck state flags a stalled agent and resets on progress", () => {
  let state = freshStuckState([0, 0, 0]);
  assert.equal(isStuck(state), false);

  // Stalling accumulates: stuck after the threshold (default 1.25s).
  for (let i = 0; i < 10; i += 1) {
    state = updateStuckState(state, [0.05, 0, 0.05], 0.2);
  }
  assert.equal(isStuck(state), true);

  // Real progress re-anchors and clears the timer.
  state = updateStuckState(state, [1, 0, 0], 0.2);
  assert.equal(isStuck(state), false);
  assert.equal(state.secondsWithoutProgress, 0);

  // Custom thresholds are honored.
  let tight = freshStuckState([0, 0, 0]);
  tight = updateStuckState(tight, [0, 0, 0], 0.3, { stuckAfterSeconds: 0.25 });
  assert.equal(isStuck(tight, { stuckAfterSeconds: 0.25 }), true);
});
