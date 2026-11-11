// Ported from Forge WebGL tests/engine/wheelTracks.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 11 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { DeformationField } from "../../terrain/deformationField.ts";
import { PHYSICAL_MATERIALS } from "../collision.ts";
import { createReferenceCarDefinition, type VehicleDefinition, type VehicleState, type VehicleWheelState } from "../vehicle/vehicleTypes.ts";
import { nominalWheelLoad } from "./sinkage.ts";
import { type SurfaceDeformationSample } from "./surfaceDeformationSample.ts";
import { RUT_LOOKAHEAD_MARGIN, WheelTrackStamper, rutSlopeAhead, type WheelDeformationLookup, wheelContactLength } from "./wheelTracks.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;
const close = (actual: number, expected: number, epsilon = 1e-9): void =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

/**
 * TERRAIN_DEFORMATION Faz 2 wiring: wheels → field (per-cell recovery,
 * frame-rate-independent compaction, swept tracks) → GPU mirror, and the
 * capability module that runs it each frame.
 */

const MUD = PHYSICAL_MATERIALS.mud!.deformation!;
const SNOW = PHYSICAL_MATERIALS.snow!.deformation!;
const mud: SurfaceDeformationSample = {
  deformability: 1, maxDepth: MUD.maxDepth, compaction: MUD.compaction, digRate: MUD.digRate,
  recoveryRate: MUD.recoveryRate, sinkResistance: MUD.sinkResistance,
  wetness: MUD.wetness,
};
const snow: SurfaceDeformationSample = {
  deformability: 1, maxDepth: SNOW.maxDepth, compaction: SNOW.compaction, digRate: SNOW.digRate,
  recoveryRate: SNOW.recoveryRate, sinkResistance: SNOW.sinkResistance,
};

/** A reference car at (x, z) heading +Z, every wheel on `ground` with the static load. */
function carState(definition: VehicleDefinition, x: number, z: number, ground: string | null = "landscape:t:0_0", steering = 0): VehicleState {
  const load = nominalWheelLoad(definition);
  return {
    forwardSpeed: 0, engineLoad: 0, drivetrain: null,
    wheels: definition.wheels.map((wheel): VehicleWheelState => ({
      position: wheel.position, radius: wheel.radius, suspensionLength: wheel.suspensionRestLength, suspensionForce: load,
      steering: wheel.steer ? steering : 0, rotation: 0, inContact: ground !== null, groundEntityId: ground,
      contactPoint: ground === null ? null : [x + wheel.position[0], 0, z + wheel.position[2]],
      hardPoint: [x + wheel.position[0], wheel.position[1], z + wheel.position[2]],
    })),
  };
}

const onMud: WheelDeformationLookup = () => mud;

export function registerWheelTrackTests(check: Check): void {

  /** `carState` with every wheel reporting `slip` (undefined leaves the field off, as Faz 2 states do). */
  const slipping = (definition: VehicleDefinition, slip: number | undefined): VehicleState => {
    const state = carState(definition, 0, 0);
    return slip === undefined ? state : { ...state, wheels: state.wheels.map((wheel) => ({ ...wheel, tractionSlip: slip })) };
  };
  /** `seconds` at `fps` with `slip`, after `settle` seconds parked at 60 fps (the static rut converged). */
  const dig = (slip: number | undefined, seconds: number, fps = 60, surface: SurfaceDeformationSample = mud, settle = 0): DeformationField => {
    const definition = createReferenceCarDefinition();
    const field = new DeformationField();
    const stamper = new WheelTrackStamper(field);
    for (let frame = 0; frame < Math.round(settle * 60); frame += 1) {
      stamper.stampVehicle("car", slipping(definition, 0), definition, () => surface, 1 / 60);
    }
    const state = slipping(definition, slip);
    for (let frame = 0; frame < Math.round(seconds * fps); frame += 1) {
      stamper.stampVehicle("car", state, definition, () => surface, 1 / fps);
    }
    return field;
  };
  const wheelDepth = (field: DeformationField): number => {
    const wheel = createReferenceCarDefinition().wheels[0]!;
    return field.sample(wheel.position[0], wheel.position[2]).depth;
  };

  check("wheel tracks: rut steering reads the cross slope ahead of a rolling wheel, past its own fresh footprint", () => {
    // An old rut along +Z from z = 2 on, deepening toward +X across x ∈ [0, 0.3].
    const oldRut = (x: number, z: number) => (z >= 2 ? Math.max(0, Math.min(0.1, x / 3)) : 0);
    const reach = wheelContactLength(0.35, 0.05) / 2 + RUT_LOOKAHEAD_MARGIN;
    // Standing: nothing ahead to read.
    assert.equal(rutSlopeAhead(oldRut, 0.1, 2 - reach, 0, 0.25, 0.35, 0.05, 0), 0);
    // Rolling +Z: the point `reach` ahead is in the old rut, deeper toward +X (the axle's + side).
    close(rutSlopeAhead(oldRut, 0.1, 2 - reach + 1e-6, 0, 0.25, 0.35, 0.05, 1), 1 / 3, 1e-9);
    // Short of it, or reversing away from it: level ground ahead.
    assert.equal(rutSlopeAhead(oldRut, 0.1, 2 - reach - 0.01, 0, 0.25, 0.35, 0.05, 1), 0);
    assert.equal(rutSlopeAhead(oldRut, 0.1, 1.9, 0, 0.25, 0.35, 0.05, -1), 0);
    // Facing −Z and reversing toward +Z rolls into it; that axle's + side is −X, so the slope flips sign.
    close(rutSlopeAhead(oldRut, 0.1, 2.5, Math.PI, 0.25, 0.35, 0.05, -1), -1 / 3, 1e-9);
    // Reversing into it: heading +Z, travel −1 reads behind, where the rut is; same slope sign along the same axle.
    close(rutSlopeAhead(oldRut, 0.1, 2 + reach + 0.1, 0, 0.25, 0.35, 0.05, -1), 1 / 3, 1e-9);
    // A deeper own rut has a longer footprint: the read moves further ahead.
    assert.ok(wheelContactLength(0.35, 0.2) > wheelContactLength(0.35, 0.05));
    close(rutSlopeAhead(oldRut, 0.1, 2 - reach - 0.01, 0, 0.25, 0.35, 0.2, 1), 1 / 3, 1e-9);
    assert.equal(rutSlopeAhead(oldRut, 0.1, 2.5, Number.NaN, 0.25, 0.35, 0.05, 1), 0);
  });
}

registerWheelTrackTests(test as unknown as Parameters<typeof registerWheelTrackTests>[0]);
