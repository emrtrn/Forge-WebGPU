// Input subsystem: raw codes to named action edges per tick (driven by the test scaffold loop).
// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each
// check is copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { test } from "vitest";
import { EngineApp } from "../testing/EngineApp.ts";
import { ActionMap } from "./actionMap.ts";
import { InputSubsystem } from "./inputSubsystem.ts";

const check = test;

// 6.1.2 The action map turns raw codes into named-action pressed/held/released
// edges, advanced once per tick by the InputSubsystem. Proves the raw->named
// mapping and the per-tick edge contract the behavior layer will read.
check("input subsystem maps raw codes to named action edges per tick", () => {
  const actions = new ActionMap({ KeyW: "move-forward", ArrowUp: "move-forward" });
  const app = new EngineApp();
  app.registerSubsystem(new InputSubsystem(actions));

  // Untouched: idle.
  app.update(0.016);
  assert.deepEqual(actions.get("move-forward"), {
    pressed: false,
    held: false,
    released: false,
  });

  // Key down -> pressed + held on the next tick.
  actions.handleDown("KeyW");
  app.update(0.016);
  assert.deepEqual(actions.get("move-forward"), { pressed: true, held: true, released: false });

  // Still down -> held only (press edge consumed).
  app.update(0.016);
  assert.deepEqual(actions.get("move-forward"), { pressed: false, held: true, released: false });

  // A second bound code keeps the action held; releasing only the first does not
  // drop it.
  actions.handleDown("ArrowUp");
  actions.handleUp("KeyW");
  app.update(0.016);
  assert.deepEqual(actions.get("move-forward"), { pressed: false, held: true, released: false });

  // Last code up -> released for exactly one tick, then idle.
  actions.handleUp("ArrowUp");
  app.update(0.016);
  assert.deepEqual(actions.get("move-forward"), { pressed: false, held: false, released: true });
  app.update(0.016);
  assert.deepEqual(actions.get("move-forward"), {
    pressed: false,
    held: false,
    released: false,
  });

  // Unbound codes never produce an action.
  actions.handleDown("KeyX");
  app.update(0.016);
  assert.equal(actions.get("move-forward").held, false);
});
