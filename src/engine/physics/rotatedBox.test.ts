// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { rotatedBoxAabb, rotatedBoxFootprintXZ } from "./rotatedBox.ts";
import { test } from "vitest";

const check = test;

function assertAabbClose(
  actual: { min: readonly number[]; max: readonly number[] },
  expected: { min: readonly number[]; max: readonly number[] },
  eps = 1e-9,
): void {
  for (let i = 0; i < 3; i += 1) {
    assert.ok(
      Math.abs((actual.min[i] ?? NaN) - (expected.min[i] ?? NaN)) < eps,
      `min[${i}]=${actual.min[i]} expected ${expected.min[i]}`,
    );
    assert.ok(
      Math.abs((actual.max[i] ?? NaN) - (expected.max[i] ?? NaN)) < eps,
      `max[${i}]=${actual.max[i]} expected ${expected.max[i]}`,
    );
  }
}

// P1.2 — the movement-blocker AABB must honour placement rotation. Collider
// size/center is authored in the body-local frame; a corner-pivoted wall (centre
// offset [2,1.5,0]) rotated to face another way must land where it is drawn, not
// several metres off along the un-rotated offset (the root cause of walking
// through real walls while being blocked on open floor).
check("rotatedBoxAabb: zero rotation returns the plain body-local box", () => {
  const aabb = rotatedBoxAabb([0, 0, 0], [2, 1.5, 0], [2, 1.5, 0.1], [0, 0, 0]);
  assert.deepEqual(aabb, { min: [0, 0, -0.1], max: [4, 3, 0.1] });
});

check("rotatedBoxAabb: a corner-pivoted wall rotated 90° about Y follows the mesh", () => {
  // Wall_400x300-style box: half [2,1.5,0.1], centre offset [2,1.5,0].
  const aabb = rotatedBoxAabb([0, 0, 0], [2, 1.5, 0], [2, 1.5, 0.1], [0, 90, 0]);
  // +90°Y swings the local +X centre to world -Z and the thin axis becomes X.
  assertAabbClose(aabb, { min: [-0.1, 0, -4], max: [0.1, 3, 0] });
});

check("rotatedBoxAabb: 45° rotation bloats a thin wall's footprint symmetrically", () => {
  const aabb = rotatedBoxAabb([0, 0, 0], [0, 0, 0], [2, 1.5, 0.1], [0, 45, 0]);
  const expectedHalf = Math.SQRT1_2 * (2 + 0.1);
  assertAabbClose(aabb, {
    min: [-expectedHalf, -1.5, -expectedHalf],
    max: [expectedHalf, 1.5, expectedHalf],
  });
});

check("rotatedBoxFootprintXZ: undefined for an axis-aligned box, area-tight for a rotated one", () => {
  // An axis-aligned box's ground silhouette is exactly its min.xz..max.xz rect,
  // so nav keeps the cheaper AABB path — no footprint is emitted.
  assert.equal(rotatedBoxFootprintXZ([0, 0, 0], [0, 0, 0], [2, 1.5, 0.1], [0, 0, 0]), undefined);

  // A 45°-rotated thin wall: the footprint is the true (rotation-preserving) area,
  // strictly smaller than the square AABB that encloses it — the bloat OBB avoids.
  const half: [number, number, number] = [2, 1.5, 0.1];
  const footprint = rotatedBoxFootprintXZ([0, 0, 0], [0, 0, 0], half, [0, 45, 0]);
  assert.ok(footprint && footprint.length >= 3);
  let area2 = 0;
  for (let i = 0; i < footprint!.length; i += 1) {
    const p = footprint![i]!;
    const q = footprint![(i + 1) % footprint!.length]!;
    area2 += p[0] * q[1] - q[0] * p[1];
  }
  const footprintArea = Math.abs(area2) / 2;
  const trueArea = 2 * half[0] * (2 * half[2]); // 2*2 by 2*0.1 = 0.8
  assert.ok(Math.abs(footprintArea - trueArea) < 1e-6, `footprint area ${footprintArea} ~= ${trueArea}`);
  const aabb = rotatedBoxAabb([0, 0, 0], [0, 0, 0], half, [0, 45, 0]);
  const aabbArea = (aabb.max[0] - aabb.min[0]) * (aabb.max[2] - aabb.min[2]);
  assert.ok(aabbArea > footprintArea + 1, `enclosing AABB ${aabbArea} bloats past footprint ${footprintArea}`);
});

check("rotatedBoxAabb: primitive rotation composes on top of body rotation", () => {
  // A box with a local +90°Y primitive rotation, under a further +90°Y body
  // rotation, is oriented +180° total: thin Z axis stays Z, extents swap back.
  const aabb = rotatedBoxAabb([0, 0, 0], [0, 0, 0], [2, 1.5, 0.1], [0, 90, 0], [0, 90, 0]);
  assertAabbClose(aabb, { min: [-2, -1.5, -0.1], max: [2, 1.5, 0.1] });
});
