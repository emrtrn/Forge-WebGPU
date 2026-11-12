// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { groundedAt, stepVerticalMotion } from "./verticalMotion.ts";
import { test } from "vitest";

const check = test;

// G2 vertical motion (src/game/verticalMotion.ts): gravity pulls the player
// down, a grounded jump on the press edge launches it, and crossing the floor
// re-grounds. Pure state machine the player behavior steps each tick.
check("stepVerticalMotion: rests on the floor and stays grounded without input", () => {
  let state = groundedAt(0);
  for (let i = 0; i < 5; i += 1) {
    state = stepVerticalMotion(state, { gravityY: -10, jumpSpeed: 5, floorY: 0, dt: 0.1, jump: false });
    assert.equal(state.y, 0);
    assert.equal(state.velocityY, 0);
    assert.equal(state.grounded, true);
  }
});

check("stepVerticalMotion: a grounded jump leaves the floor with upward velocity", () => {
  const jumped = stepVerticalMotion(groundedAt(0), {
    gravityY: -10,
    jumpSpeed: 5,
    floorY: 0,
    dt: 0.1,
    jump: true,
  });
  assert.equal(jumped.grounded, false);
  assert.ok(Math.abs(jumped.velocityY - 4) <= 1e-12); // 5 - 10*0.1
  assert.ok(Math.abs(jumped.y - 0.4) <= 1e-12); // 0 + 4*0.1
});

check("stepVerticalMotion: jump rises then re-grounds after one rise/fall cycle", () => {
  const dt = 1 / 60;
  const step = { gravityY: -10, jumpSpeed: 5, floorY: 0, dt, jump: false };
  let state = stepVerticalMotion(groundedAt(0), { ...step, jump: true });
  assert.equal(state.grounded, false);
  let leftGround = false;
  let landed = false;
  for (let i = 0; i < 1000 && !landed; i += 1) {
    state = stepVerticalMotion(state, step);
    if (!state.grounded) leftGround = true;
    else if (leftGround) landed = true;
  }
  assert.ok(leftGround && landed);
  assert.equal(state.y, 0);
  assert.equal(state.velocityY, 0);
  assert.equal(state.grounded, true);
});

check("stepVerticalMotion: no mid-air double jump and a paused tick holds height", () => {
  const step = { gravityY: -10, jumpSpeed: 5, floorY: 0, dt: 0.1, jump: true };
  const airborne = stepVerticalMotion(groundedAt(0), step);
  assert.equal(airborne.grounded, false);
  // Jump pressed again while airborne: velocity only changes by gravity.
  const again = stepVerticalMotion(airborne, step);
  assert.ok(Math.abs(again.velocityY - (airborne.velocityY - 10 * 0.1)) <= 1e-12);
  // A non-positive dt leaves the height unchanged (paused frame).
  const paused = stepVerticalMotion(airborne, { ...step, dt: 0, jump: false });
  assert.equal(paused.y, airborne.y);
});
