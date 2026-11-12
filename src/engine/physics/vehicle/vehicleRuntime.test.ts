/**
 * Vehicle plan Faz 1b: the runtime half of a drivable car.
 *
 * The physics half (suspension, drive, brake, rebuilds) is pinned against a
 * live Rapier world in `tools/engine-tests.ts`. These checks cover what sits on
 * top of it, headless:
 *
 *   (A) the `forge.vehicle` Game Mode's pure helpers — pedals from actions,
 *       planar heading, chase framing, speed FOV;
 *   (B) the session, through an ordinary {@link GameModeContext} whose
 *       `vehicles` bridge is a recording fake — possession, input forwarding,
 *       UI-mode neutral input, the chase camera, the upright reset;
 *   (C) the `vehicle` capability module hanging wheel visuals on the actor
 *       object from the host's live wheel readback.
 */
// Ported from Forge WebGL tests/engine/vehicleRuntime.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 16 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { computeVehicleDrive } from "./vehicleDrive.ts";
import { vehicleEngineSoundLevels } from "./vehicleEngineSound.ts";
import { NEUTRAL_VEHICLE_INPUT, normalizeVehicleDefinition } from "./vehicleTypes.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;

export function registerVehicleRuntimeTests(check: Check): void {
  check("an analog steer input skips the rate filter but keeps the gamma response", () => {
    const def = normalizeVehicleDefinition({ steerSpeed: 1, steerGamma: 2, steeringSpeedCurve: [{ speedMps: 0, scale: 1 }] })!;
    const stick = computeVehicleDrive(def, { ...NEUTRAL_VEHICLE_INPUT, steer: 0.5, steerAnalog: true }, 15, -0.3, 1 / 60);
    assert.equal(stick.steer, 0.5);
    const lock = (def.maxSteerAngleDeg * Math.PI) / 180;
    assert.ok(Math.abs(stick.wheels[0]!.steering - (-0.25 * lock)) < 1e-12);
    const key = computeVehicleDrive(def, { ...NEUTRAL_VEHICLE_INPUT, steer: 0.5 }, 15, -0.3, 1 / 60);
    assert.ok(key.steer < -0.25, `the key path still eases: ${key.steer}`);
  });

  check("vehicle engine sound pitch follows the revs and volume the load", () => {
    const geared = normalizeVehicleDefinition({
      wheels: [{ position: [0, 0, 1] }],
      drivetrain: {},
      engineSound: { sound: "engine" },
    })!;
    const sound = geared.engineSound!;
    const state = (rpm: number, engineLoad: number, forwardSpeed = 0) => ({
      forwardSpeed,
      engineLoad,
      wheels: [],
      drivetrain: { engineRpm: rpm, gear: 1, shiftTimeRemaining: 0 },
    });
    assert.deepEqual(vehicleEngineSoundLevels(sound, geared, state(900, 0)), { pitch: 1, volume: 0.35 });
    const flatOut = vehicleEngineSoundLevels(sound, geared, state(6500, 1));
    assert.ok(Math.abs(flatOut.pitch - 2.2) < 1e-9 && Math.abs(flatOut.volume - 0.9) < 1e-9);
    // Revving off the throttle (engine braking) still carries at half weight.
    const coasting = vehicleEngineSoundLevels(sound, geared, state(6500, 0));
    assert.ok(Math.abs(coasting.volume - (0.35 + 0.55 * 0.5)) < 1e-9, `coasting ${coasting.volume}`);
    // Over-revved readback clamps rather than shrieking past maxPitch.
    assert.ok(Math.abs(vehicleEngineSoundLevels(sound, geared, state(9000, 1)).pitch - 2.2) < 1e-9);

    // No drivetrain, no RPM: speed stands in, either direction.
    const flat = normalizeVehicleDefinition({ wheels: [{ position: [0, 0, 1] }], engineSound: { sound: "engine" } })!;
    const reversing = { forwardSpeed: -15, engineLoad: 1, wheels: [], drivetrain: null };
    assert.ok(Math.abs(vehicleEngineSoundLevels(flat.engineSound!, flat, reversing).pitch - 1.6) < 1e-9);
  });
}

registerVehicleRuntimeTests(test as unknown as Parameters<typeof registerVehicleRuntimeTests>[0]);
