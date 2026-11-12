// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { facingYawFromMove, planarMoveStep, planarMoveStepRelativeToYaw, rotateYawToward } from "./planarMovement.ts";
import { test } from "vitest";

const check = test;

// G1 player movement core (src/game/playerMovement.ts): planar input resolves to
// a normalized XZ delta plus a facing yaw, so diagonals are not ~1.41x faster and
// the character turns to face its movement, holding facing when idle. Yaw values
// are compared modulo 360 (so +/-180 match, and -0 reads as 0).
const yawApproxEqual = (actual: number, expected: number, eps = 1e-9): void => {
  const diff = ((((actual - expected) % 360) + 540) % 360) - 180;
  assert.ok(Math.abs(diff) <= eps, `yaw ${actual} not ~= ${expected} (mod 360)`);
};

check("planarMoveStep: a single axis moves at exactly speed*dt", () => {
  assert.deepEqual(
    planarMoveStep({ forward: true, back: false, left: false, right: false }, 4, 0.5),
    { dx: 0, dz: -2 },
  );
  assert.deepEqual(
    planarMoveStep({ forward: false, back: true, left: false, right: false }, 4, 0.5),
    { dx: 0, dz: 2 },
  );
  assert.deepEqual(
    planarMoveStep({ forward: false, back: false, left: true, right: false }, 4, 0.5),
    { dx: -2, dz: 0 },
  );
  assert.deepEqual(
    planarMoveStep({ forward: false, back: false, left: false, right: true }, 4, 0.5),
    { dx: 2, dz: 0 },
  );
});

check("planarMoveStep: diagonals are normalized to the straight-line speed", () => {
  const straight = planarMoveStep(
    { forward: true, back: false, left: false, right: false },
    3,
    0.5,
  );
  const diagonal = planarMoveStep(
    { forward: true, back: false, left: false, right: true },
    3,
    0.5,
  );
  const straightMag = Math.hypot(straight.dx, straight.dz);
  const diagonalMag = Math.hypot(diagonal.dx, diagonal.dz);
  assert.ok(Math.abs(diagonalMag - straightMag) <= 1e-12, "diagonal speed == straight");
  assert.ok(Math.abs(diagonalMag - 1.5) <= 1e-12, "magnitude == speed*dt");
  // Forward-right components: +x, -z, equal magnitudes.
  assert.ok(diagonal.dx > 0 && diagonal.dz < 0);
  assert.ok(Math.abs(Math.abs(diagonal.dx) - Math.abs(diagonal.dz)) <= 1e-12);
});

check("planarMoveStep: opposing keys cancel and idle/zero input yields no delta", () => {
  assert.deepEqual(
    planarMoveStep({ forward: true, back: true, left: true, right: true }, 5, 0.5),
    { dx: 0, dz: 0 },
  );
  assert.deepEqual(
    planarMoveStep({ forward: false, back: false, left: false, right: false }, 5, 0.5),
    { dx: 0, dz: 0 },
  );
  // A paused frame (dt 0) or a zero speed produces no motion.
  assert.deepEqual(
    planarMoveStep({ forward: true, back: false, left: false, right: false }, 5, 0),
    { dx: 0, dz: 0 },
  );
  assert.deepEqual(
    planarMoveStep({ forward: true, back: false, left: false, right: false }, 0, 0.5),
    { dx: 0, dz: 0 },
  );
});

check("planarMoveStepRelativeToYaw rotates WASD by controller yaw", () => {
  const forward = planarMoveStepRelativeToYaw(
    { forward: true, back: false, left: false, right: false },
    4,
    0.5,
    Math.PI / 2,
  );
  assert.ok(forward.dx < 0);
  assert.ok(Math.abs(forward.dz) < 1e-9);
  assert.ok(Math.abs(Math.hypot(forward.dx, forward.dz) - 2) < 1e-9);

  const diagonal = planarMoveStepRelativeToYaw(
    { forward: true, back: false, left: false, right: true },
    4,
    0.5,
    Math.PI / 2,
  );
  assert.ok(Math.abs(Math.hypot(diagonal.dx, diagonal.dz) - 2) < 1e-9);
});

check("facingYawFromMove: the character faces its cardinal movement direction", () => {
  // Mesh is +z-forward, so the yaw turns local +z to the movement direction.
  yawApproxEqual(facingYawFromMove(0, -1) ?? NaN, 180); // forward (-z)
  yawApproxEqual(facingYawFromMove(0, 1) ?? NaN, 0); // back (+z)
  yawApproxEqual(facingYawFromMove(1, 0) ?? NaN, 90); // right (+x)
  yawApproxEqual(facingYawFromMove(-1, 0) ?? NaN, -90); // left (-x)
  yawApproxEqual(facingYawFromMove(1, -1) ?? NaN, 135); // forward-right
});

check("facingYawFromMove: no movement returns null so facing is held", () => {
  assert.equal(facingYawFromMove(0, 0), null);
});

check("rotateYawToward: turns by a capped shortest-path step", () => {
  yawApproxEqual(rotateYawToward(0, 90, 15), 15);
  yawApproxEqual(rotateYawToward(80, 90, 15), 90);
  yawApproxEqual(rotateYawToward(170, -170, 15), -175);
  yawApproxEqual(rotateYawToward(45, 180, 0), 45);
});
