// Ported from Forge WebGL tests/engine/vehicleAssets.test.ts @ forge-webgl-final (04b5fb23): the one A check is
// unchanged and runs by Vitest; the manifest, save-validator, actor-script and asset-loader checks (M) are left out
// (the vehicle asset type comes in phase 6). docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import {
  normalizeVehicleDefinition,
  vehicleDefinitionFromComponent,
} from "./vehicleTypes.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;
type CheckAsync = (label: string, fn: () => Promise<void>) => Promise<void>;
const PATH = "assets/starter-content/Gameplay/ReferenceCar.vehicle.json";

export async function registerVehicleAssetTests(check: Check, checkAsync: CheckAsync): Promise<void> {

  check("vehicle normalizer handles malformed JSON fields and preserves asset defaults under overrides", () => {
    assert.equal(normalizeVehicleDefinition(null), null);
    assert.equal(normalizeVehicleDefinition([]), null);
    const base = normalizeVehicleDefinition({ massKg: 800, maxEngineForce: 9000 })!;
    const normalized = vehicleDefinitionFromComponent({
      massKg: -1,
      maxEngineForce: "fast",
      centerOfMassOffset: { length: 3 },
      maxSteerAngleDeg: 999,
      wheels: [null, { position: [1, Number.NaN, 2] }, { radius: 5 }],
    }, base)!;
    assert.equal(normalized.massKg, 800);
    assert.equal(normalized.maxEngineForce, 9000);
    assert.equal(normalized.maxSteerAngleDeg, 80);
    assert.deepEqual(normalized.centerOfMassOffset, base.centerOfMassOffset);
    assert.deepEqual(normalized.wheels, base.wheels);
    assert.notEqual(normalized.wheels, base.wheels);
    const replaced = vehicleDefinitionFromComponent({
      maxEngineForce: 0,
      wheels: [{ position: [0, 0, 1], drive: true, brake: false, radius: -2 }],
    }, base)!;
    assert.equal(replaced.maxEngineForce, 0);
    assert.equal(replaced.wheels.length, 1);
    assert.equal(replaced.wheels[0]?.drive, true);
    assert.equal(replaced.wheels[0]?.brake, false);
    assert.equal(replaced.wheels[0]?.radius, 0.35);
  });
}

await registerVehicleAssetTests(test as unknown as Parameters<typeof registerVehicleAssetTests>[0], test as unknown as Parameters<typeof registerVehicleAssetTests>[1]);
