// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { dominantPerceivedStimulus, evaluateHearing, evaluateSight, insideHorizontalFov, segmentIntersectsAabb } from "./perception.ts";
import { test } from "vitest";

const check = test;

check("AI perception sight respects radius, horizontal FOV, and blocker LOS", () => {
  const listener = {
    entityId: "enemy",
    position: [0, 0, 0] as [number, number, number],
    forward: [0, 0, 1] as [number, number, number],
    sightRadius: 6,
    fieldOfViewDeg: 90,
  };
  assert.equal(insideHorizontalFov(listener.position, listener.forward, [0, 0, 4], 90), true);
  assert.equal(insideHorizontalFov(listener.position, listener.forward, [4, 0, 0], 90), false);
  assert.deepEqual(
    evaluateSight(listener, [
      { entityId: "front", position: [0, 0, 4] },
      { entityId: "side", position: [4, 0, 0] },
      { entityId: "far", position: [0, 0, 8] },
    ]).map((stimulus) => stimulus.sourceEntityId),
    ["front"],
  );
  const wall = { min: [-1, -1, 2], max: [1, 2, 2.2] };
  // @ts-expect-error Forge never type-checked its tests: a plain array literal is wider than the fixed-length tuple type (type-only).
  assert.equal(segmentIntersectsAabb([0, 0, 0], [0, 0, 4], wall), true);
  assert.equal(
    // @ts-expect-error Forge never type-checked its tests: a plain array literal is wider than the fixed-length tuple type (type-only).
    evaluateSight(listener, [{ entityId: "front", position: [0, 0, 4] }], [wall]).length,
    0,
  );
  assert.deepEqual(
    evaluateSight(
      { ...listener, nearSightRadius: 1 },
      [{ entityId: "near-blocked", position: [0, 0, 0.8] }],
      [{ min: [-1, -1, 0.3], max: [1, 2, 0.4] }],
    ).map((stimulus) => stimulus.sourceEntityId),
    ["near-blocked"],
  );
});

check("AI perception hearing applies loudness-scaled radius", () => {
  const listener = {
    entityId: "enemy",
    position: [0, 0, 0] as [number, number, number],
    forward: [0, 0, 1] as [number, number, number],
    hearingRadius: 5,
  };
  const heard = evaluateHearing(listener, [
    { sourceEntityId: "step", position: [3, 0, 0], loudness: 1 },
    { sourceEntityId: "quiet", position: [6, 0, 0], loudness: 1 },
    { sourceEntityId: "loud", position: [8, 0, 0], loudness: 2 },
  ]);
  assert.deepEqual(heard.map((stimulus) => stimulus.sourceEntityId), ["step", "loud"]);
  assert.equal(heard[0]?.sense, "hearing");
  assert.ok((heard[0]?.strength ?? 0) > (heard[1]?.strength ?? 0));
});

check("AI perception dominant stimulus uses sense priority before strength", () => {
  const dominant = dominantPerceivedStimulus([
    {
      sense: "hearing",
      sourceEntityId: "loud-noise",
      position: [1, 0, 0],
      distance: 1,
      strength: 0.95,
    },
    {
      sense: "damage",
      sourceEntityId: "attacker",
      position: [6, 0, 0],
      distance: 6,
      strength: 0.2,
      eventType: "Damage.Apply",
    },
  ]);
  assert.equal(dominant?.sense, "damage");
  assert.equal(dominant?.sourceEntityId, "attacker");

  const sameSense = dominantPerceivedStimulus([
    {
      sense: "hearing",
      sourceEntityId: "near-quiet",
      position: [1, 0, 0],
      distance: 1,
      strength: 0.4,
    },
    {
      sense: "hearing",
      sourceEntityId: "far-loud",
      position: [4, 0, 0],
      distance: 4,
      strength: 0.8,
    },
  ]);
  assert.equal(sameSense?.sourceEntityId, "far-loud");
});
