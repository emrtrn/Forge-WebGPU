// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { resolveBlendSpaceWeights, type AssetSkeletonBlendSpaceDef } from "./blendSpace.ts";
import { test } from "vitest";

const check = test;

check("blend space 1d resolver interpolates between bracketing samples", () => {
  const blend: AssetSkeletonBlendSpaceDef = {
    name: "Locomotion",
    type: "1d",
    axisX: { name: "Speed", min: 0, max: 4 },
    samples: [
      { clip: "Idle", x: 0 },
      { clip: "Walk", x: 2 },
      { clip: "Run", x: 4 },
    ],
  };
  // Exact sample positions resolve to a single clip.
  assert.deepEqual(resolveBlendSpaceWeights(blend, { x: 0 }), [{ clip: "Idle", weight: 1 }]);
  assert.deepEqual(resolveBlendSpaceWeights(blend, { x: 2 }), [{ clip: "Walk", weight: 1 }]);
  // Midpoints split weight evenly between the two neighbours.
  assert.deepEqual(resolveBlendSpaceWeights(blend, { x: 1 }), [
    { clip: "Idle", weight: 0.5 },
    { clip: "Walk", weight: 0.5 },
  ]);
  assert.deepEqual(resolveBlendSpaceWeights(blend, { x: 3 }), [
    { clip: "Walk", weight: 0.5 },
    { clip: "Run", weight: 0.5 },
  ]);
  // Out-of-range params clamp to the nearest end sample.
  assert.deepEqual(resolveBlendSpaceWeights(blend, { x: -5 }), [{ clip: "Idle", weight: 1 }]);
  assert.deepEqual(resolveBlendSpaceWeights(blend, { x: 50 }), [{ clip: "Run", weight: 1 }]);
});

check("blend space resolver weights are normalized and merge duplicate clips", () => {
  const oneSample: AssetSkeletonBlendSpaceDef = {
    name: "Single",
    type: "1d",
    axisX: { name: "Speed", min: 0, max: 4 },
    samples: [{ clip: "Idle", x: 2 }],
  };
  assert.deepEqual(resolveBlendSpaceWeights(oneSample, { x: 99 }), [{ clip: "Idle", weight: 1 }]);
  assert.deepEqual(resolveBlendSpaceWeights({ ...oneSample, samples: [] }, { x: 0 }), []);

  // A clip appearing on two neighbouring samples collapses to one entry summing to 1.
  const duplicate: AssetSkeletonBlendSpaceDef = {
    name: "Dup",
    type: "1d",
    axisX: { name: "Speed", min: 0, max: 4 },
    samples: [
      { clip: "Walk", x: 0 },
      { clip: "Walk", x: 4 },
    ],
  };
  assert.deepEqual(resolveBlendSpaceWeights(duplicate, { x: 2 }), [{ clip: "Walk", weight: 1 }]);

  // 2D inverse-distance weighting: an exact hit wins outright; weights stay normalized.
  const blend2d: AssetSkeletonBlendSpaceDef = {
    name: "Aim",
    type: "2d",
    axisX: { name: "X", min: -1, max: 1 },
    axisY: { name: "Y", min: -1, max: 1 },
    samples: [
      { clip: "A", x: -1, y: -1 },
      { clip: "B", x: 1, y: -1 },
      { clip: "C", x: -1, y: 1 },
      { clip: "D", x: 1, y: 1 },
    ],
  };
  assert.deepEqual(resolveBlendSpaceWeights(blend2d, { x: -1, y: -1 }), [{ clip: "A", weight: 1 }]);
  const centre = resolveBlendSpaceWeights(blend2d, { x: 0, y: 0 });
  assert.equal(centre.length, 4);
  const total = centre.reduce((sum, entry) => sum + entry.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, "2d weights sum to 1");
  for (const entry of centre) {
    assert.ok(Math.abs(entry.weight - 0.25) < 1e-9, "equidistant centre weights are equal");
  }
});
