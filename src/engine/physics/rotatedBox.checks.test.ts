// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { resolvePlanarMovement, safeSubstepLength, type Aabb3 } from "../movement/characterCollision.ts";
import { rotatedBoxAabb, rotatedBoxFootprintXZ } from "./rotatedBox.ts";
import { test } from "vitest";

const check = test;

check("resolvePlanarMovement: rotated wall footprint does not block its empty AABB corners", () => {
  const half: [number, number, number] = [2, 1.5, 0.1];
  const aabb = rotatedBoxAabb([0, 0, 0], [0, 0, 0], half, [0, 45, 0]);
  const footprint = rotatedBoxFootprintXZ([0, 0, 0], [0, 0, 0], half, [0, 45, 0]);
  assert.ok(footprint && footprint.length >= 3);
  const wall: Aabb3 = { ...aabb, footprint };
  const characterHalf: [number, number, number] = [0.1, 0.5, 0.1];

  // This move enters the enclosing AABB's north-east pocket, but remains clear
  // of the real diagonal wall strip. The old AABB-only path clamped it.
  const moved = resolvePlanarMovement([1.7, 0, 1.2], { dx: -0.4, dz: 0 }, characterHalf, [wall]);
  assert.ok(Math.abs(moved.dx + 0.4) < 1e-9, `dx=${moved.dx}`);
  assert.equal(moved.dz, 0);
});

check("safeSubstepLength: rotated wall footprint uses the real thin edge", () => {
  const half: [number, number, number] = [2, 1.5, 0.1];
  const aabb = rotatedBoxAabb([0, 0, 0], [0, 0, 0], half, [0, 45, 0]);
  const footprint = rotatedBoxFootprintXZ([0, 0, 0], [0, 0, 0], half, [0, 45, 0]);
  assert.ok(footprint && footprint.length >= 3);
  assert.ok(Math.abs(safeSubstepLength([{ ...aabb, footprint }]) - 0.1) < 1e-9);
});
