// Snap to floor and to wall (plan phase 4 step 4). Rewrites of Forge WebGL's
// tools/engine-tests.ts floorSnapPosition checks and section 9 ("Wall-snap
// geometry") @ forge-webgl-final: the wall comes from level rays (the
// viewport's picker) instead of a room's bounding box.
import assert from "node:assert/strict";
import { test } from "vitest";
import { rotate } from "../math/affine.ts";
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from "../math/euler.ts";
import { floorSnapPosition, nearestWall, wallSnap } from "./surfaceSnap.ts";

// Rewritten from Forge "floorSnapPosition places the world-box bottom on y=0".
test("floor snap puts the world box's bottom on the surface", () => {
  const box = { min: [2, 1.25, -1] as [number, number, number], max: [4, 3.25, 1] as [number, number, number] };
  assert.deepEqual(floorSnapPosition(box, [3, 5, 0]), [3, 3.75, 0]);
  // A surface under it (the picker's hit) instead of the floor plane.
  assert.deepEqual(floorSnapPosition(box, [3, 5, 0], 0.5), [3, 4.25, 0]);
});

// Rewritten from Forge "floorSnapPosition no-ops when already on the floor".
test("floor snap does nothing when the box already rests on the surface", () => {
  assert.equal(floorSnapPosition({ min: [-1, 0, -1], max: [1, 2, 1] }, [0, 0, 0]), null);
  assert.equal(floorSnapPosition({ min: [-1, 0.5004, -1], max: [1, 2, 1] }, [0, 0.5, 0], 0.5), null);
});

// Rewritten from Forge "wall snap slides flush against the nearest wall and faces the interior".
test("wall snap slides flush against the nearest wall and faces away from it", () => {
  // A 10 x 10 room (walls at ±5); a thin model (front +Z) at z = 4, tilted 10° about X.
  const bounds = { min: [-0.5, 0, -0.1] as [number, number, number], max: [0.5, 2, 0.1] as [number, number, number] };
  // Level rays from the model's centre: the +Z wall is 1 m away.
  const wall = nearestWall([
    { side: "+x", distance: 5 },
    { side: "-x", distance: 5 },
    { side: "+z", distance: 1 },
    { side: "-z", distance: 9 },
  ]);
  assert.deepEqual(wall, { side: "+z", distance: 1 });
  const snapped = wallSnap(bounds, { p: [0, 0, 4], r: [0, 0, 0, 1], s: [1, 1, 1] }, "+z", 5);
  // It turns to face -Z (180°) and slides so its back is flush: wall 5, half depth 0.1.
  assert.deepEqual(snapped.position, [0, 0, 4.9]);
  const front = rotate(snapped.rotation, [0, 0, 1]);
  assert.ok(Math.abs(front[0]) < 1e-9 && Math.abs(front[1]) < 1e-9 && Math.abs(front[2] + 1) < 1e-9, `front ${front.join(", ")}`);
  // A tilt about X is kept; only the heading changes (the -Z wall: heading 0).
  const tilted = wallSnap(bounds, { p: [0, 0, -4], r: eulerDegreesToQuaternion([10, 33, 0]), s: [1, 1, 1] }, "-z", -5);
  const euler = quaternionToEulerDegrees(tilted.rotation);
  assert.ok(Math.abs(euler[0] - 10) < 1e-6 && Math.abs(euler[1]) < 1e-6 && Math.abs(euler[2]) < 1e-6, `tilt kept: ${euler.join(", ")}`);
  assert.equal(nearestWall([]), null);
});
