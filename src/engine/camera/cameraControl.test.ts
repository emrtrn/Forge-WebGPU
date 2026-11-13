// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The camera pawn's pure movement and look math (plan phase 3 step 8: the
// level viewer's default camera, Forge's forge.defaultCamera controls).
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  applyConfiguredMouseLook,
  applyMouseLook,
  cameraPlanarPan,
  forwardFromLookAngles,
  lookAnglesFromForward,
} from "./cameraControl.ts";

const check = test;

check("cameraPlanarPan moves along the camera's horizontal forward", () => {
  // Forward = world -z (a fresh camera). Holding forward moves -z, no x drift,
  // at speed*dt = 2 units this tick.
  const step = cameraPlanarPan(0, -1, { forward: true, back: false, left: false, right: false }, 4, 0.5);
  assert.ok(Math.abs(step.dx) < 1e-9);
  assert.ok(step.dz < 0);
  assert.ok(Math.abs(Math.hypot(step.dx, step.dz) - 2) < 1e-9);
});

check("cameraPlanarPan cancels opposing keys and keeps diagonals at unit speed", () => {
  assert.deepEqual(
    cameraPlanarPan(0, -1, { forward: true, back: true, left: false, right: false }, 4, 0.5),
    { dx: 0, dy: 0, dz: 0 },
  );
  // Looking straight down (zero XZ forward) falls back to world -z.
  const down = cameraPlanarPan(0, 0, { forward: true, back: false, left: false, right: false }, 4, 0.5);
  assert.ok(down.dz < 0 && Math.abs(down.dx) < 1e-9);
  // Forward+right diagonal is not faster than a straight move.
  const diag = cameraPlanarPan(0, -1, { forward: true, back: false, left: false, right: true }, 4, 0.5);
  assert.ok(Math.abs(Math.hypot(diag.dx, diag.dz) - 2) < 1e-9);
});

check("cameraPlanarPan flies straight up/down on world +y/-y", () => {
  // Up alone: pure +y, no horizontal drift, at speed*dt = 2 units.
  const up = cameraPlanarPan(0, -1, { forward: false, back: false, left: false, right: false, up: true }, 4, 0.5);
  assert.ok(Math.abs(up.dx) < 1e-9 && Math.abs(up.dz) < 1e-9);
  assert.ok(Math.abs(up.dy - 2) < 1e-9);
  // Down alone: pure -y.
  const down = cameraPlanarPan(0, -1, { forward: false, back: false, left: false, right: false, down: true }, 4, 0.5);
  assert.ok(Math.abs(down.dy + 2) < 1e-9);
  // Opposing vertical keys cancel.
  assert.deepEqual(
    cameraPlanarPan(0, -1, { forward: false, back: false, left: false, right: false, up: true, down: true }, 4, 0.5),
    { dx: 0, dy: 0, dz: 0 },
  );
  // Forward+up diagonal stays at unit speed (the whole 3D vector is normalized).
  const diag = cameraPlanarPan(0, -1, { forward: true, back: false, left: false, right: false, up: true }, 4, 0.5);
  assert.ok(Math.abs(Math.hypot(diag.dx, diag.dy, diag.dz) - 2) < 1e-9);
});

check("applyMouseLook turns with the pointer delta and clamps pitch", () => {
  const turned = applyMouseLook({ yaw: 0, pitch: 0 }, 100, 0, 0.01, 1);
  assert.ok(Math.abs(turned.yaw - -1) < 1e-9);
  assert.equal(applyMouseLook({ yaw: 0, pitch: 0 }, 0, -1000, 0.01, 1).pitch, 1);
  assert.equal(applyMouseLook({ yaw: 0, pitch: 0 }, 0, 1000, 0.01, 1).pitch, -1);
});

check("applyConfiguredMouseLook honors sensitivity and invert Y", () => {
  const normal = applyConfiguredMouseLook({ yaw: 0, pitch: 0 }, 10, 10, {
    sensitivity: 0.01,
  });
  assert.ok(Math.abs(normal.yaw - -0.1) < 1e-9);
  assert.ok(Math.abs(normal.pitch - -0.1) < 1e-9);
  const inverted = applyConfiguredMouseLook({ yaw: 0, pitch: 0 }, 10, 10, {
    sensitivity: 0.01,
    invertY: true,
  });
  assert.ok(Math.abs(inverted.yaw - -0.1) < 1e-9);
  assert.ok(Math.abs(inverted.pitch - 0.1) < 1e-9);
});

check("look angles round-trip through a forward direction", () => {
  const angles = { yaw: 0.6, pitch: -0.3 };
  const dir = forwardFromLookAngles(angles);
  const back = lookAnglesFromForward(dir.x, dir.y, dir.z);
  assert.ok(Math.abs(back.yaw - angles.yaw) < 1e-9, `yaw ${back.yaw}`);
  assert.ok(Math.abs(back.pitch - angles.pitch) < 1e-9, `pitch ${back.pitch}`);
});
