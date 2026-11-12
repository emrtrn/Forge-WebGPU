/** Terrain deformation Faz 4: pure curves and vehicle presentation with recording services. */
// Ported from Forge WebGL tests/engine/wheelSurfaceFx.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 13 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { wheelSurfaceFxLevels } from "./wheelSurfaceFx.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;

export function registerWheelSurfaceFxTests(check: Check): void {
  check("wheel surface fx: airborne, stopped and invalid inputs produce zero output", () => {
    const zero = { emissionRate: 0, soundVolume: 0, soundPitch: 0 };
    const moving = { inContact: true, wheelSpeed: 12, groundSpeed: 5, chassisSpeed: 5 };
    assert.deepEqual(wheelSurfaceFxLevels({ ...moving, inContact: false }), zero);
    assert.deepEqual(wheelSurfaceFxLevels({ ...moving, wheelSpeed: 0, groundSpeed: 0, chassisSpeed: 0 }), zero);
    for (const key of ["wheelSpeed", "groundSpeed", "chassisSpeed"] as const) {
      for (const value of [NaN, Infinity, -Infinity]) {
        assert.deepEqual(wheelSurfaceFxLevels({ ...moving, [key]: value }), zero);
      }
    }
  });

  check("wheel surface fx: curves rise with speed and slip, clamp and mirror reverse", () => {
    const slow = wheelSurfaceFxLevels({ inContact: true, wheelSpeed: 3, groundSpeed: 3, chassisSpeed: 3 });
    const fast = wheelSurfaceFxLevels({ inContact: true, wheelSpeed: 12, groundSpeed: 12, chassisSpeed: 12 });
    const slip = wheelSurfaceFxLevels({ inContact: true, wheelSpeed: 12, groundSpeed: 3, chassisSpeed: 12 });
    for (const key of ["emissionRate", "soundVolume", "soundPitch"] as const) {
      assert.ok(slow[key] < fast[key]);
      assert.ok(fast[key] < slip[key]);
    }
    assert.deepEqual(wheelSurfaceFxLevels({ inContact: true, wheelSpeed: -12, groundSpeed: -3, chassisSpeed: -12 }), slip);
    assert.deepEqual(wheelSurfaceFxLevels({ inContact: true, wheelSpeed: 1e6, groundSpeed: 0, chassisSpeed: 0 }),
      { emissionRate: 1, soundVolume: 1, soundPitch: 2 });
    assert.deepEqual(wheelSurfaceFxLevels({ inContact: true, wheelSpeed: 15, groundSpeed: -15, chassisSpeed: 15 }),
      { emissionRate: 1, soundVolume: 1, soundPitch: 2 });
  });

  check("wheel surface fx: documented rolling curve reuses caller output", () => {
    const out = { emissionRate: -1, soundVolume: -1, soundPitch: -1 };
    assert.equal(wheelSurfaceFxLevels({ inContact: true, wheelSpeed: 7.5, groundSpeed: 7.5, chassisSpeed: 7.5 }, out), out);
    assert.deepEqual(out, { emissionRate: 0.1, soundVolume: 0.15, soundPitch: 1.125 });
    wheelSurfaceFxLevels({ inContact: false, wheelSpeed: 7.5, groundSpeed: 7.5, chassisSpeed: 7.5 }, out);
    assert.deepEqual(out, { emissionRate: 0, soundVolume: 0, soundPitch: 0 });
  });

  check("wheel surface fx: physics slip drives a stationary burnout and overrides rotation noise", () => {
    const stopped = { inContact: true, wheelSpeed: 0, groundSpeed: 0, chassisSpeed: 0, tractionSlip: 0.8 };
    assert.ok(wheelSurfaceFxLevels(stopped).emissionRate > 0.3);
    assert.equal(wheelSurfaceFxLevels({ ...stopped, tractionSlip: 0 }).emissionRate, 0);
    assert.equal(wheelSurfaceFxLevels({ ...stopped, wheelSpeed: 10000, tractionSlip: 0 }).emissionRate, 0, "reset angle jump is not powered slip");
    assert.equal(wheelSurfaceFxLevels({ ...stopped, inContact: false }).emissionRate, 0);
    const rolling = { inContact: true, wheelSpeed: 5, groundSpeed: 5, chassisSpeed: 5, tractionSlip: 0 };
    assert.ok(wheelSurfaceFxLevels({ ...rolling, tractionSlip: 0.8 }).emissionRate > wheelSurfaceFxLevels(rolling).emissionRate);
    assert.equal(wheelSurfaceFxLevels({ ...rolling, tractionSlip: NaN }).emissionRate, 0);
    assert.deepEqual(wheelSurfaceFxLevels({ ...stopped, tractionSlip: 5 }), wheelSurfaceFxLevels({ ...stopped, tractionSlip: 1 }));
  });
}

registerWheelSurfaceFxTests(test as unknown as Parameters<typeof registerWheelSurfaceFxTests>[0]);
