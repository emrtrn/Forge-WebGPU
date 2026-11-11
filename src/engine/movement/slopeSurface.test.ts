// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { sampleTriangleHeight, slopeCosFromDegrees, triangleUpNormal, type GroundTriangle } from "./slopeSurface.ts";
import { test } from "vitest";

const check = test;

const RAMP_NORMAL_Y = 8 / Math.hypot(4, 8, 0);
 // ≈0.894, a 26.57° ramp rising along +X

check("triangleUpNormal: flat floor = 1, vertical wall = 0, ramp = cos(angle)", () => {
  // Up-facing floors are wound CCW (outward), matching the exported prototype
  // meshes, so their signed upward normal is +1 (not the old winding-agnostic |ny|).
  assert.ok(Math.abs(triangleUpNormal([0, 0, 0], [0, 0, 1], [1, 0, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(triangleUpNormal([0, 0, 0], [1, 0, 0], [0, 1, 0]) - 0) < 1e-9);
  assert.ok(Math.abs(triangleUpNormal([0, 0, -1], [4, 2, 1], [4, 2, -1]) - RAMP_NORMAL_Y) < 1e-9);
});

check("sampleTriangleHeight: interpolates inside, null outside / for vertical triangles", () => {
  const ramp: GroundTriangle = { a: [0, 0, -1], b: [4, 2, -1], c: [4, 2, 1], normalY: RAMP_NORMAL_Y };
  assert.ok(Math.abs(sampleTriangleHeight(ramp, 3, 0)! - 1.5) < 1e-9); // y = 2*(3/4)
  assert.ok(Math.abs(sampleTriangleHeight(ramp, 0, -1)! - 0) < 1e-9); // at vertex a
  assert.equal(sampleTriangleHeight(ramp, 10, 0), null); // outside the XZ footprint
  const vertical: GroundTriangle = { a: [0, 0, 0], b: [1, 0, 0], c: [0, 1, 0], normalY: 0 };
  assert.equal(sampleTriangleHeight(vertical, 0.1, 0), null); // degenerate in XZ
});

check("slopeCosFromDegrees: 0°=1, 45°≈0.707, 90° clamped above 0", () => {
  assert.ok(Math.abs(slopeCosFromDegrees(0) - 1) < 1e-9);
  assert.ok(Math.abs(slopeCosFromDegrees(45) - Math.SQRT1_2) < 1e-9);
  assert.ok(slopeCosFromDegrees(90) > 0); // clamped to 89.9°, never exactly vertical
});
