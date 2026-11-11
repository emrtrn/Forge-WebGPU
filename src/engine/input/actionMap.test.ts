// Action map: press / hold / release edges, analog axes, deadzones.
// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each
// check is copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { test } from "vitest";
import { ActionMap } from "./actionMap.ts";

const check = test;

check("action map keeps a tap shorter than one tick as a one-tick press", () => {
  const actions = new ActionMap({ Escape: "menu" });
  // Down and up between two advances (a slow frame): pressed + held once,
  // released on the next tick, then idle.
  actions.handleDown("Escape");
  actions.handleUp("Escape");
  actions.advance();
  assert.deepEqual(actions.get("menu"), { pressed: true, held: true, released: false });
  actions.advance();
  assert.deepEqual(actions.get("menu"), { pressed: false, held: false, released: true });
  actions.advance();
  assert.deepEqual(actions.get("menu"), { pressed: false, held: false, released: false });

  // A focus-loss reset drops a pending tap too.
  actions.handleDown("Escape");
  actions.reset();
  actions.advance();
  assert.equal(actions.pressed("menu"), false);
});

check("action map resolves analog axes with deadzone scale invert and delta input", () => {
  const actions = new ActionMap(
    {},
    {
      GamepadRightX: { axis: "look-x", deadzone: 0.2, scale: 2 },
      GamepadRightY: { axis: "look-y", invert: true },
      MouseX: { axis: "look-x", scale: 0.01 },
    },
  );
  actions.handleAxis("GamepadRightX", 0.1);
  actions.handleAxis("GamepadRightY", 0.5);
  actions.addAxisDelta("MouseX", 10);
  actions.advance();

  // GamepadRightX is inside deadzone; MouseX delta contributes 0.1 after scale.
  assert.equal(actions.axis("look-x"), 0.1);
  assert.equal(actions.axis("look-y"), -0.5);

  // Relative mouse deltas are one-tick values; absolute gamepad axes persist.
  actions.advance();
  assert.equal(actions.axis("look-x"), 0);
  assert.equal(actions.axis("look-y"), -0.5);
});

check("action map rescales a stick past its deadzone so the value starts from zero", () => {
  const actions = new ActionMap({}, { StickX: { axis: "move-x", deadzone: 0.2, rescaleDeadzone: true } });
  const at = (raw: number): number => {
    actions.handleAxis("StickX", raw);
    actions.advance();
    return actions.axis("move-x");
  };
  assert.equal(at(0.2), 0);
  assert.ok(Math.abs(at(0.3) - 0.125) < 1e-12);
  assert.ok(Math.abs(at(-0.6) + 0.5) < 1e-12);
  assert.equal(at(1), 1);
});
