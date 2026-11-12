// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { resolveNavAgentProfile } from "./navAgentProfile.ts";
import { test } from "vitest";

const check = test;

// P1.3/P1.4 — slope surface math (src/game/slopeSurface.ts). The AABB model walks
// on flat tops; a ramp needs the true interpolated surface height + a slope gate.
check("resolveNavAgentProfile prefers authored navAgent size over an oversized collider", () => {
  // Regression: a character actor placed at scale 0.3 whose actor-script capsule
  // collider is authored at radius 1 / halfHeight 3 reports UNSCALED half-extents
  // [1,3,1] (placement scale isn't baked into an actor-script collider). Using
  // those would give agent radius 1 (clearance ~1.25) and erode a 2m ramp out of
  // the grid, making an elevated Target Point unreachable. The authored navAgent
  // (Unreal Nav Agent) size must win.
  const agent = resolveNavAgentProfile({
    navAgent: { radius: 0.35, height: 1.8 },
    movement: { capsuleRadius: 0.3, capsuleHalfHeight: 0.9, maxStepHeight: 0.45, maxStepDown: 0.5, maxSlopeAngleDeg: 45 },
    colliderHalfExtents: [1, 3, 1],
  });
  assert.ok(Math.abs(agent.radius - 0.35) < 1e-9, `radius should come from navAgent: ${agent.radius}`);
  assert.ok(Math.abs(agent.height - 1.8) < 1e-9, `height should come from navAgent: ${agent.height}`);
  assert.equal(agent.stepHeight, 0.45);
  assert.equal(agent.maxStepDown, 0.5);
  assert.equal(agent.maxSlopeAngleDeg, 45);
});

check("resolveNavAgentProfile falls back to collider extents then defaults when navAgent size is absent", () => {
  // No authored navAgent size -> collider half-extents win (legacy behavior).
  const fromCollider = resolveNavAgentProfile({
    movement: { capsuleRadius: 0.3, capsuleHalfHeight: 0.9 },
    colliderHalfExtents: [0.4, 0.95, 0.4],
  });
  assert.ok(Math.abs(fromCollider.radius - 0.4) < 1e-9, `radius from collider: ${fromCollider.radius}`);
  assert.ok(Math.abs(fromCollider.height - 1.9) < 1e-9, `height from collider: ${fromCollider.height}`);
  // No collider either -> movement capsule, then hard defaults.
  const fromMovement = resolveNavAgentProfile({ movement: { capsuleRadius: 0.5, capsuleHalfHeight: 1 } });
  assert.ok(Math.abs(fromMovement.radius - 0.5) < 1e-9, `radius from movement: ${fromMovement.radius}`);
  assert.ok(Math.abs(fromMovement.height - 2) < 1e-9, `height from movement: ${fromMovement.height}`);
  const empty = resolveNavAgentProfile({});
  assert.ok(Math.abs(empty.radius - 0.35) < 1e-9, `default radius: ${empty.radius}`);
  assert.ok(Math.abs(empty.height - 1.8) < 1e-9, `default height: ${empty.height}`);
});
