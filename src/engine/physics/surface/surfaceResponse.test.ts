// Ported from Forge WebGL tests/engine/surfaceResponse.test.ts @ forge-webgl-final (04b5fb23): the 20 A checks are
// unchanged and run by Vitest; the M checks (old room layout adapter, the stock GAZ-52 actor script and the
// `resistanceRun` helper that reads it) are left out. createVehicleTestWorld is Forge's harness scenario
// (tools/engine-tests.ts), copied unchanged. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { type TransformComponent } from "../../legacy/components.ts";
import type { Entity } from "../../legacy/entity.ts";
import { type Vec3 } from "../../legacy/layout.ts";
import { PhysicsSubsystem } from "../physicsSubsystem.ts";
import {
  computeWheelSurfaceResponse, createPhysicalMaterialSurfaceProvider,
  NEUTRAL_SURFACE_SAMPLE, resolveSurfaceSample, type SurfaceSample, type VehicleSurfaceProvider,
} from "./surfaceResponse.ts";
import {
  createReferenceCarDefinition, NEUTRAL_VEHICLE_INPUT, type VehicleInput,
} from "../vehicle/vehicleTypes.ts";
import { resistanceImpulse, wheelGroundResistance } from "./softGroundResistance.ts";
import { wheelFootprintDepth } from "./wheelSink.ts";
import { advanceWheelSpin, limitWheelEngineForce, longitudinalSlip } from "./wheelTraction.ts";
import { wheelSurfaceFxLevels } from "./wheelSurfaceFx.ts";
import { rutSlopeAhead, WheelTrackStamper } from "./wheelTracks.ts";
import { PHYSICAL_MATERIALS } from "../collision.ts";
import { DeformationField } from "../../terrain/deformationField.ts";
import type { SurfaceDeformationSample } from "./surfaceDeformationSample.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;
type CheckAsync = (label: string, fn: () => Promise<void>) => Promise<void>;
const close = (actual: number, expected: number): void =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

export function registerSurfaceResponseTests(check: Check): void {
  check("soft ground speed: progressive entry drag fades with soft participation and preserves launch", () => {
    for (const material of ["mud", "snow"]) {
      const preset = resolveSurfaceSample(material);
      const base = { ...preset, softGround: { ...preset.softGround!, highSpeedResistance: 0 } };
      const extra = (speed: number, sample = preset) => wheelGroundResistance(sample, 3000, 0, 0.537, speed)
        - wheelGroundResistance(base, 3000, 0, 0.537, speed);
      for (const speed of [0, 0.5, 1, 10 / 3.6]) close(extra(speed), 0);
      assert.ok(extra(15 / 3.6) > 0 && extra(15 / 3.6) < extra(20 / 3.6));
      close(extra(20 / 3.6), extra(60 / 3.6));
      close(extra(-20 / 3.6), extra(20 / 3.6));
      close(extra(20 / 3.6, { ...preset, deformability: 0.5 }), extra(20 / 3.6) * 0.5);
      assert.equal(wheelGroundResistance(preset, 0, 0, 0.537, 60 / 3.6), 0);
    }
    const blend = resolveSurfaceSample([{ physicalMaterialId: "mud", weight: 1 }, { physicalMaterialId: "stone", weight: 1 }]);
    close(wheelGroundResistance(blend, 3000, 0, 0.537, 60 / 3.6),
      wheelGroundResistance(resolveSurfaceSample("mud"), 3000, 0, 0.537, 60 / 3.6) * 0.5);
  });
  check("soft ground launch: mud preserves a finite depth threshold while rolling builds with speed", () => {
    const mud = resolveSurfaceSample("mud");
    const resistance = (depth: number, speed: number) => wheelGroundResistance(mud, 6000, depth, 0.537, speed);
    const shallowRest = resistance(0.11, 0);
    const deepRest = resistance(0.22, 0);
    assert.ok(shallowRest > 0, "launch does not erase soil breakaway");
    close(deepRest, shallowRest * 4);
    assert.ok(resistance(0.11, 0.5) > shallowRest && resistance(0.11, 0.5) < resistance(0.11, 1));
    close(resistance(0.11, 1), resistance(0.11, 2));
    close(resistance(0.11, -0.5), resistance(0.11, 0.5));
    assert.ok(resistance(0.22, 10) - resistance(0.11, 10) > 200, "burial adds a material load well before belly contact");
    for (const speed of [0, 0.5, 1, 2]) {
      close(wheelGroundResistance(resolveSurfaceSample("snow"), 3000, 0.1, 0.5, speed), 207);
      close(wheelGroundResistance(resolveSurfaceSample("sand"), 3000, 0.1, 0.5, speed), 870);
    }
  });
  check("soft ground resistance: depth and load increase ploughing below belly contact, with finite breakaway", () => {
    for (const id of ["mud", "snow"]) {
      const sample = resolveSurfaceSample(id);
      const force = (depth: number, load = 3000) => wheelGroundResistance(sample, load, depth, 0.5, 10);
      assert.ok(force(0.1) > force(0));
      assert.ok(force(0.22) > force(0.1));
      close(force(0.1, 6000), force(0.1) * 2);
      assert.ok(wheelGroundResistance(sample, 3000, 0.1, 0.5, 0) > 0);
      assert.ok(wheelGroundResistance(sample, 3000, 0.1, 0.5, 0) <= force(0.1));
      close(wheelGroundResistance(sample, 3000, 0.1, 0.5, -10), force(0.1));
      assert.equal(force(0.1, 0), 0);
      assert.equal(wheelGroundResistance(NEUTRAL_SURFACE_SAMPLE, 3000, 0.2, 0.5, 10), 0);
    }
    const mixed = resolveSurfaceSample([{ physicalMaterialId: "mud", weight: 1 }, { physicalMaterialId: "stone", weight: 1 }]);
    close(mixed.softGround!.maxDepth, 0.22);
    close(mixed.deformability, 0.5);
    close(mixed.softGround!.ploughResistance, resolveSurfaceSample("mud").softGround!.ploughResistance);
  });
  check("soft ground resistance: impulse dissipates energy and cannot reverse relative contact motion", () => {
    for (const speed of [0, 1e-6, 0.1, 10]) for (const force of [0, 100, 1e8]) for (const dt of [1 / 120, 1 / 60]) {
      const inverseMass = 0.002;
      const impulse = resistanceImpulse(speed, force, dt, inverseMass);
      assert.ok(impulse >= 0 && impulse <= speed / inverseMass);
      assert.ok(speed - impulse * inverseMass >= -1e-12);
      assert.ok(-impulse * speed + 0.5 * impulse ** 2 * inverseMass <= 1e-12);
    }
    assert.equal(resistanceImpulse(10, 100, 1 / 60, 0), 0);
    assert.equal(resistanceImpulse(NaN, 100, 1 / 60, 1), 0);
  });
  check("wheel traction: longitudinal grip caps drive symmetrically and wheelspin slews and brakes", () => {
    close(limitWheelEngineForce(10000, 1000, 0.5, 1 / 60), 1000);
    close(limitWheelEngineForce(-10000, 1000, 0.5, 1 / 60), -1000);
    close(limitWheelEngineForce(500, 1000, 0.5, 1 / 60), 500);
    close(limitWheelEngineForce(10000, 0, 0.5, 1 / 60), 0);
    close(limitWheelEngineForce(10000, 1000, 2.5, 1 / 60, 0.35), 350);
    close(longitudinalSlip(10000, 1000, 0.35), 0.965);
    close(longitudinalSlip(0, 1000, 0.35), 0);
    close(longitudinalSlip(10000, 1000, undefined), 0);
    const spin = advanceWheelSpin(0, 10000, 0.8, false, 0.1);
    assert.ok(spin > 0 && spin < 12 * 0.8);
    close(advanceWheelSpin(0, -10000, 0.8, false, 0.1), -spin);
    assert.ok(advanceWheelSpin(spin, 0, 0, false, 0.1) < spin);
    assert.ok(advanceWheelSpin(spin, 10000, 0.8, true, 0.1) < spin * 0.1);
    const rates = [30, 60, 144].map((hz) => {
      let speed = 0;
      for (let frame = 0; frame < hz; frame++) speed = advanceWheelSpin(speed, 10000, 0.8, false, 1 / hz);
      return speed;
    });
    assert.ok(Math.max(...rates) - Math.min(...rates) < 1e-10);
  });

  check("surface response: blends normalised weights including neutral layers", () => {
    const sample = resolveSurfaceSample([
      { physicalMaterialId: "mud", weight: 2 },
      { physicalMaterialId: "stone", weight: 6 },
    ]);
    close(sample.frictionSlipScale, 0.55 * 0.25 + 0.75);
    close(sample.sideFrictionScale, 0.7 * 0.25 + 0.75);
    close(sample.rollingResistance, 0.12 * 0.25);
    close(sample.tractionCoefficient!, 0.4 * 0.25 + 0.75);
    close(sample.deformability, 0.25);
    assert.deepEqual(sample, resolveSurfaceSample([
      { physicalMaterialId: "mud", weight: 20 },
      { physicalMaterialId: "stone", weight: 60 },
    ]));
    assert.deepEqual(resolveSurfaceSample([
      { physicalMaterialId: "mud", weight: Number.MAX_VALUE },
      { physicalMaterialId: "stone", weight: Number.MAX_VALUE },
    ]), resolveSurfaceSample([
      { physicalMaterialId: "mud", weight: 1 }, { physicalMaterialId: "stone", weight: 1 },
    ]));
  });

  check("surface response: empty and invalid weights are neutral", () => {
    assert.deepEqual(resolveSurfaceSample([]), NEUTRAL_SURFACE_SAMPLE);
    const invalid = [0, -1, NaN, Infinity, -Infinity].map((weight) => ({ physicalMaterialId: "mud", weight }));
    assert.deepEqual(resolveSurfaceSample(invalid), NEUTRAL_SURFACE_SAMPLE);
    assert.deepEqual(resolveSurfaceSample([...invalid, { physicalMaterialId: "snow", weight: 3 }]), resolveSurfaceSample("snow"));
  });

  check("surface response: two material boundary is continuous with exact endpoints", () => {
    const mud = resolveSurfaceSample("mud");
    const snow = resolveSurfaceSample("snow");
    for (const weight of [0, 0.25, 0.499, 0.5, 0.501, 0.75, 1]) {
      const sample = resolveSurfaceSample([
        { physicalMaterialId: "mud", weight }, { physicalMaterialId: "snow", weight: 1 - weight },
      ]);
      for (const key of ["frictionSlipScale", "sideFrictionScale", "rollingResistance", "deformability"] as const) {
        close(sample[key], mud[key] * weight + snow[key] * (1 - weight));
      }
    }
  });

  check("surface response: wheel scales compose with drive stiffness and never accumulate", () => {
    const wheel = { frictionSlip: 2.5, sideFrictionStiffness: 0.2 };
    const mud = resolveSurfaceSample("mud");
    const response = computeWheelSurfaceResponse(wheel, mud, 10, 3000);
    close(response.frictionSlip, 1.375);
    close(response.sideFrictionStiffness, 0.14);
    close(response.rollingResistanceForce, 360);
    close(response.tractionCoefficient!, 0.4);
    assert.deepEqual(computeWheelSurfaceResponse(wheel, mud, 10, 3000), response);
    for (const sample of [null, NEUTRAL_SURFACE_SAMPLE]) {
      assert.deepEqual(computeWheelSurfaceResponse(wheel, sample, 10, 3000), { ...wheel, rollingResistanceForce: 0 });
    }
    assert.deepEqual(wheel, { frictionSlip: 2.5, sideFrictionStiffness: 0.2 });
  });

  check("surface response: rolling brake ramps with speed and load in either direction", () => {
    const wheel = { frictionSlip: 2.5, sideFrictionStiffness: 1 };
    const sample = resolveSurfaceSample("mud");
    const force = (speed: number, load: number) => computeWheelSurfaceResponse(wheel, sample, speed, load).rollingResistanceForce;
    assert.equal(force(0, 3000), 0);
    assert.equal(force(10, 0), 0);
    assert.equal(force(10, -1), 0);
    close(force(0.5, 3000), 180);
    assert.equal(force(-0.5, 3000), force(0.5, 3000));
    assert.equal(force(100, 3000), force(1, 3000));
    assert.equal(force(1, 6000), 2 * force(1, 3000));
  });
}

interface VehicleSurfaceTestWorld {
  physics: PhysicsSubsystem;
  entities: Entity[];
  tick: (seconds: number) => void;
  /** The car chassis' synced world position. */
  position: () => [number, number, number];
  drive: (patch: Partial<VehicleInput>) => void;
}

/** Reuses the existing flat-ground reference-car scenario in tools/engine-tests.ts. */
export async function registerSurfaceResponseRapierTests(
  checkAsync: CheckAsync,
  createWorld: (options?: { slopeDeg?: number; groundSize?: number; fixedTimestep?: number }) => Promise<VehicleSurfaceTestWorld>,
): Promise<void> {
  await checkAsync("vehicle telemetry rapier: demand, delivered impulse and soil capacity remain separate", async () => {
    const world = await createWorld();
    const { physics } = world;
    try {
      physics.createVehicle("car", createReferenceCarDefinition());
      world.tick(2);
      physics.setVehicleSurfaceProvider(() => resolveSurfaceSample("mud"));
      world.drive({ throttle: 1 });
      world.tick(1);
      const state = physics.vehicleState("car")!;
      const t = state.telemetry!;
      assert.equal(t.input.throttle, 1);
      assert.equal(t.input.brake, 0);
      assert.ok(t.requestedDriveForce > t.appliedDriveForce + 100, "grip-limited engine demand cannot masquerade as delivered thrust");
      assert.ok(t.appliedDriveForce > 0);
      const capacity = state.wheels.reduce((sum, wheel) => sum + (wheel.groundResistanceForce ?? 0), 0);
      assert.ok(t.appliedGroundResistanceForce >= 0 && t.appliedGroundResistanceForce <= capacity + 1e-6);
      assert.notEqual(t.input, physics.vehicleState("car")!.telemetry!.input, "snapshot input does not alias the live record");
      world.drive({});
      world.tick(1 / 60);
      const coasting = physics.vehicleState("car")!.telemetry!;
      assert.equal(coasting.input.throttle, 0);
      assert.equal(coasting.requestedDriveForce, 0);
      assert.equal(coasting.appliedDriveForce, 0, "wheel brake impulses are not reported as engine thrust");
    } finally { physics.dispose(); }
  });
  await checkAsync("wheel traction rapier: mud and snow limit straight-line thrust and spin only driven wheels, forward and reverse", async () => {
    const run = async (material: string | null, reverse: boolean) => {
      const world = await createWorld();
      const { physics } = world;
      try {
        // Enough torque to exceed both soft profiles. No rolling drag, so a
        // speed difference proves the new grip cap, not the old brake path.
        const definition = { ...createReferenceCarDefinition(), maxEngineForce: 60000, maxReverseForce: 60000 };
        if (material) physics.setVehicleSurfaceProvider(() => ({ ...resolveSurfaceSample(material), rollingResistance: 0 }));
        physics.createVehicle("car", definition);
        world.tick(1);
        world.drive(reverse ? { brake: 1 } : { throttle: 1 });
        world.tick(0.5);
        const before = physics.vehicleState("car")!;
        world.tick(1 / 60);
        const state = physics.vehicleState("car")!;
        const excess = state.wheels.map((wheel, index) => {
          const speed = (wheel.rotation - before.wheels[index]!.rotation) * wheel.radius * 60;
          return Math.abs(speed) - Math.abs(state.forwardSpeed);
        });
        if (material) {
          for (const [index, wheel] of state.wheels.entries()) {
            if (definition.wheels[index]!.drive) {
              assert.ok(wheel.tractionSlip! > 0.05, `${material} reverse=${reverse}: slip ${wheel.tractionSlip}`);
              assert.ok(excess[index]! > 0.2, `${material}: driven tyre has excess rolling speed ${excess[index]}`);
              assert.equal(Math.sign(wheel.rotation - before.wheels[index]!.rotation), reverse ? -1 : 1);
            } else {
              assert.equal(wheel.tractionSlip, 0);
              assert.ok(Math.abs(excess[index]!) < 0.6, `free tyre rolls with chassis: ${excess[index]}`);
            }
          }
        }
        return Math.abs(state.forwardSpeed);
      } finally { physics.dispose(); }
    };
    for (const reverse of [false, true]) {
      const firm = await run(null, reverse);
      for (const material of ["mud", "snow"]) {
        const soft = await run(material, reverse);
        assert.ok(soft > 0 && soft < firm * 0.8, `${material} reverse=${reverse}: soft ${soft}, firm ${firm}`);
      }
    }
  });

  await checkAsync("wheel traction rapier: stuck wheels splash while digging; brake, grip recovery and respawn clear spin", async () => {
    const world = await createWorld();
    const { physics } = world;
    try {
      physics.setEntities([...world.entities, {
        id: "wall", components: {
          Transform: { position: [0, 1, 2.6], rotation: [0, 0, 0], scale: [1, 1, 1] },
          Collider: { shape: "box", size: [4, 2, 0.5], isStatic: true, isSensor: false },
        },
      }]);
      const definition = createReferenceCarDefinition();
      physics.createVehicle("car", definition);
      physics.setVehicleSurfaceProvider(() => ({ ...resolveSurfaceSample("mud"), frictionSlipScale: 0.1 }));
      world.tick(1);
      world.drive({ throttle: 1 });
      world.tick(3);
      const before = physics.vehicleState("car")!;
      world.tick(1 / 60);
      const spinning = physics.vehicleState("car")!;
      assert.ok(Math.abs(spinning.forwardSpeed) < 0.05);
      for (const [index, wheel] of spinning.wheels.entries()) {
        if (!definition.wheels[index]!.drive) continue;
        assert.ok((wheel.rotation - before.wheels[index]!.rotation) * wheel.radius * 60 > 1);
        assert.ok(wheelSurfaceFxLevels({ inContact: wheel.inContact, wheelSpeed: 0, groundSpeed: 0,
          chassisSpeed: spinning.forwardSpeed, tractionSlip: wheel.tractionSlip }).emissionRate > 0.05);
      }
      world.drive({ handbrake: true });
      world.tick(1);
      const braking = physics.vehicleState("car")!;
      world.tick(1 / 60);
      const braked = physics.vehicleState("car")!;
      for (const [index, wheel] of braked.wheels.entries()) {
        assert.equal(wheel.tractionSlip, 0);
        assert.ok(Math.abs(wheel.rotation - braking.wheels[index]!.rotation) < 0.02);
      }
      // Returning to firm ground releases extra RPM without snapping the angle.
      world.drive({ throttle: 1 });
      world.tick(0.5);
      physics.setVehicleSurfaceProvider(null);
      world.drive({});
      world.tick(1);
      const recovered = physics.vehicleState("car")!;
      world.tick(1 / 60);
      assert.ok(physics.vehicleState("car")!.wheels.every((wheel, index) =>
        Math.abs(wheel.rotation - recovered.wheels[index]!.rotation) < 0.02));
      physics.resetVehicle("car", { position: [0, 1, -20], rotation: [0, 0, 0], scale: [1, 1, 1] });
      assert.ok(physics.vehicleState("car")!.wheels.every((wheel) => wheel.tractionSlip === 0));
      world.tick(1);
      const reset = physics.vehicleState("car")!;
      world.tick(1 / 60);
      assert.ok(physics.vehicleState("car")!.wheels.every((wheel, index) =>
        Math.abs(wheel.rotation - reset.wheels[index]!.rotation) < 0.02));
    } finally { physics.dispose(); }
  });

  const curve = async (provider: "mesh" | VehicleSurfaceProvider | null, materialId?: string): Promise<number[]> => {
    const world = await createWorld();
    const { physics } = world;
    try {
      if (materialId) {
        world.entities[0]!.components.Collider!.physicalMaterialId = materialId;
        physics.setEntities(world.entities);
      }
      if (provider !== null) physics.setVehicleSurfaceProvider(provider === "mesh"
        ? createPhysicalMaterialSurfaceProvider((id) => physics.colliderPhysicalMaterialId(id)) : provider);
      physics.createVehicle("car", createReferenceCarDefinition());
      world.tick(1);
      world.drive({ throttle: 1 });
      const speeds: number[] = [];
      for (let index = 0; index < 6; index += 1) {
        world.tick(0.5);
        speeds.push(physics.vehicleState("car")!.forwardSpeed);
      }
      return speeds;
    } finally {
      physics.dispose();
    }
  };

  await checkAsync("surface response rapier: no provider and neutral providers preserve the legacy speed curve exactly", async () => {
    // Captured before the surface-response change, using this same scenario.
    const legacy = [2.423356630827677, 4.706326462197407, 6.856473538317414, 8.88154189164081, 10.788810524948119, 12.585117386888854];
    assert.deepEqual(await curve(null), legacy);
    assert.deepEqual(await curve(() => null), legacy);
    for (const id of [undefined, "default", "slippery", "rubber", "metal", "wood", "stone"]) {
      assert.deepEqual(await curve("mesh", id), legacy, String(id));
    }
    assert.deepEqual(await curve(null, "mud"), legacy, "an authored soft surface also needs a provider");
  });

  await checkAsync("surface response rapier: mud mesh provider reduces acceleration under identical throttle", async () => {
    const neutral = await curve("mesh");
    const mud = await curve("mesh", "mud");
    assert.ok(mud[1]! > 0 && mud[1]! < neutral[1]! * 0.8, `1 s: mud=${mud[1]}, neutral=${neutral[1]}`);
    assert.ok(mud[5]! < neutral[5]! * 0.8, `3 s: mud=${mud[5]}, neutral=${neutral[5]}`);
  });

  await checkAsync("surface response rapier: clearing a mud provider or returning null restores neutral wheel response", async () => {
    const curves: number[][] = [];
    for (const provider of [null, () => null, () => NEUTRAL_SURFACE_SAMPLE]) {
      const world = await createWorld();
      const { physics } = world;
      try {
        physics.setVehicleSurfaceProvider(() => resolveSurfaceSample("mud"));
        physics.createVehicle("car", createReferenceCarDefinition());
        world.tick(1);
        world.drive({ throttle: 1 });
        world.tick(3);
        physics.setVehicleSurfaceProvider(provider);
        const speeds: number[] = [];
        for (const handbrake of [false, true, false]) {
          world.drive({ throttle: 1, steer: 0.4, handbrake });
          world.tick(0.5);
          speeds.push(physics.vehicleState("car")!.forwardSpeed);
        }
        curves.push(speeds);
      } finally {
        physics.dispose();
      }
    }
    assert.deepEqual(curves[0], curves[2]);
    assert.deepEqual(curves[1], curves[2]);
  });

  await checkAsync("surface response rapier: groundEntityId and provider contacts follow the collider owner", async () => {
    const world = await createWorld();
    const { physics } = world;
    try {
      let calls = 0;
      const seen = new Set<number>();
      physics.setVehicleSurfaceProvider((vehicle, wheel, ground, point) => {
        assert.equal(vehicle, "car");
        assert.equal(ground, "ground");
        assert.ok(Math.abs(point[1]) < 1e-5, `contact y=${point[1]}`);
        seen.add(wheel);
        calls += 1;
        return null;
      });
      physics.createVehicle("car", createReferenceCarDefinition());
      world.tick(1);
      assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
      assert.ok(physics.vehicleState("car")!.wheels.every((wheel) => wheel.inContact && wheel.groundEntityId === "ground"));
      const before = calls;
      physics.setVehicleSurfaceProvider(null);
      world.tick(0.5);
      assert.equal(calls, before, "clearing the provider stops callbacks");
      physics.setEntities(world.entities);
      world.tick(1);
      assert.ok(physics.vehicleState("car")!.wheels.every((wheel) => wheel.groundEntityId === "ground"), "mapping survives world rebuild");
      physics.resetVehicle("car", { position: [0, 100, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
      world.tick(0.5);
      assert.ok(physics.vehicleState("car")!.wheels.every((wheel) => !wheel.inContact && wheel.groundEntityId === null));
      physics.setVehicleSurfaceProvider(() => assert.fail("airborne wheel queried the surface provider"));
      world.tick(0.5);
    } finally {
      physics.dispose();
    }
  });

  await checkAsync("wheel sink rapier: a constant track lowers the chassis by its depth at the slew rate and climbs back out", async () => {
    const world = await createWorld();
    const { physics } = world;
    try {
      physics.createVehicle("car", createReferenceCarDefinition());
      world.tick(2);
      const base = world.position()[1];
      physics.setVehicleGroundSinkProvider(() => ({ depth: 0.12, resistance: 0.5 }));
      world.tick(0.1);
      assert.ok(base - world.position()[1] <= 0.3 * 0.1 + 0.005, `dropped ${base - world.position()[1]} m in 0.1 s`);
      world.tick(2.9);
      const sunk = physics.vehicleState("car")!;
      for (const wheel of sunk.wheels) {
        assert.ok(wheel.inContact, "every wheel keeps its contact while sinking");
        assert.ok(Math.abs(wheel.sinkDepth! - 0.12) < 1e-9, `sink ${wheel.sinkDepth}`);
      }
      assert.ok(Math.abs(base - world.position()[1] - 0.12) < 0.01, `chassis dropped ${base - world.position()[1]} m`);
      const heights: number[] = [];
      for (let index = 0; index < 20; index += 1) {
        world.tick(0.05);
        heights.push(world.position()[1]);
      }
      assert.ok(Math.max(...heights) - Math.min(...heights) < 0.002, "a settled sunk chassis does not bounce");
      physics.setVehicleGroundSinkProvider(null);
      world.tick(2);
      assert.ok(physics.vehicleState("car")!.wheels.every((wheel) => wheel.sinkDepth === 0), "no provider restores the authored rest");
      assert.ok(Math.abs(world.position()[1] - base) < 0.01, `back at ${world.position()[1]}, started at ${base}`);
    } finally {
      physics.dispose();
    }
  });

  await checkAsync("wheel sink rapier: the chassis bottom caps the sink and deeper mud drags on the belly", async () => {
    const run = async (depth: number): Promise<{ speed: number; sink: number }> => {
      const world = await createWorld();
      const { physics } = world;
      try {
        physics.createVehicle("car", createReferenceCarDefinition());
        physics.setVehicleGroundSinkProvider(() => ({ depth, resistance: 0.5 }));
        world.tick(3);
        world.drive({ throttle: 1 });
        world.tick(3);
        const state = physics.vehicleState("car")!;
        return { speed: state.forwardSpeed, sink: Math.max(...state.wheels.map((wheel) => wheel.sinkDepth ?? 0)) };
      } finally {
        physics.dispose();
      }
    };
    // Reference car: rest 0.35 m, so the rest-length floor (0.05 m) caps the sink at 0.30 m.
    const atLimit = await run(0.3);
    const beyond = await run(0.5);
    assert.ok(Math.abs(atLimit.sink - 0.3) < 1e-9 && Math.abs(beyond.sink - 0.3) < 1e-9, `sinks ${atLimit.sink} / ${beyond.sink}`);
    assert.ok(atLimit.speed > 3, `a full-depth rut alone still drives: ${atLimit.speed} m/s`);
    assert.ok(beyond.speed < atLimit.speed * 0.5, `belly drag: ${beyond.speed} vs ${atLimit.speed} m/s`);
  });

  await checkAsync("wheel sink rapier: traction slip reports engine impulse the tyres could not transfer", async () => {
    const world = await createWorld();
    const { physics } = world;
    try {
      physics.createVehicle("car", createReferenceCarDefinition());
      world.tick(1);
      const driven = (): number => Math.max(...physics.vehicleState("car")!.wheels.map((wheel) => wheel.tractionSlip ?? 0));
      assert.equal(driven(), 0, "a parked car does not slip");
      physics.setVehicleSurfaceProvider(() => ({ ...NEUTRAL_SURFACE_SAMPLE, frictionSlipScale: 0.05 }));
      world.drive({ throttle: 1 });
      world.tick(0.5);
      assert.ok(driven() > 0.3, `ice-like grip spins the driven wheels: ${driven()}`);
      physics.setVehicleSurfaceProvider(null);
      world.drive({});
      world.tick(0.5);
      assert.equal(driven(), 0, "coasting transfers no engine impulse to lose");
    } finally {
      physics.dispose();
    }
  });

  const MUD = PHYSICAL_MATERIALS.mud!.deformation!;
  const mud: SurfaceDeformationSample = {
    deformability: 1, maxDepth: MUD.maxDepth, compaction: MUD.compaction, digRate: MUD.digRate,
    recoveryRate: MUD.recoveryRate, sinkResistance: MUD.sinkResistance,
  };
  /**
   * The terrain deformation module's loop without its services: physics reads
   * the field, the stamper writes it. Creates the car; `frame` steps 1/60 s.
   */
  const rutLoop = (
    world: VehicleSurfaceTestWorld,
    grip: SurfaceSample = resolveSurfaceSample("mud"),
    options: { rutSteering?: boolean; field?: DeformationField } = {},
  ) => {
    const { physics } = world;
    const field = options.field ?? new DeformationField();
    const stamper = new WheelTrackStamper(field);
    const definition = createReferenceCarDefinition();
    // Isolate soil behaviour from the spawn drop's transient landing load.
    physics.createVehicle("car", definition);
    world.tick(2);
    physics.setVehicleSurfaceProvider(() => grip);
    // Mirrors the terrain deformation module's provider.
    physics.setVehicleGroundSinkProvider((query) => {
      const depthAt = (x: number, z: number) => field.sample(x, z).depth;
      const [x, , z] = query.contactPoint;
      const depth = wheelFootprintDepth(depthAt, x, z, query.heading, query.width);
      if (depth <= 0) return null;
      if (options.rutSteering === false) return { depth, resistance: mud.sinkResistance };
      const slope = rutSlopeAhead(depthAt, x, z, query.heading, query.width, query.radius ?? 0, depth, query.travel ?? 0);
      return { depth, resistance: mud.sinkResistance, slope };
    });
    const frame = (): void => {
      world.tick(1 / 60);
      stamper.stampVehicle("car", physics.vehicleState("car")!, definition, () => mud, 1 / 60);
    };
    return { definition, frame, field };
  };
  /** Two straight 0.3 m wide, 0.1 m deep ruts along +Z under the reference car's wheels, for 60 m. */
  const pressedRuts = (): DeformationField => {
    const field = new DeformationField();
    const halfTrack = Math.abs(createReferenceCarDefinition().wheels[0]!.position[0]);
    for (const x of [-halfTrack, halfTrack]) {
      field.stampWheel({ from: [x, -10], to: [x, 30], width: 0.3, contactLength: 0.3, targetDepth: 0.1, compaction: 1, disturbance: 255 });
    }
    return field;
  };
}

const VEHICLE_SLICE = 1 / 60;

async function createVehicleTestWorld(options: { slopeDeg?: number; groundSize?: number; fixedTimestep?: number } = {}) {
  const physics = new PhysicsSubsystem({ backend: "rapier", fixedTimestep: options.fixedTimestep });
  physics.setGravity([0, -9.81, 0]);
  let pose: TransformComponent | null = null;
  physics.setTransformSink((entityId, transform) => {
    if (entityId === "car") pose = transform;
  });
  const slope = options.slopeDeg ?? 0;
  const entities: Entity[] = [
    {
      id: "ground",
      components: {
        Transform: { position: [0, -0.5, 0], rotation: [-slope, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [options.groundSize ?? 400, 1, options.groundSize ?? 400], isStatic: true, isSensor: false },
      },
    },
    {
      id: "car",
      components: {
        Transform: { position: [0, 1, 0], rotation: [-slope, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1.8, 0.6, 4.2],
          isStatic: false,
          isSensor: false,
          simulatePhysics: true,
        },
      },
    },
  ];
  physics.setEntities(entities);
  await physics.init();
  let frame = 0;
  const tick = (seconds: number): void => {
    const frames = Math.round(seconds / VEHICLE_SLICE);
    for (let index = 0; index < frames; index += 1) {
      frame += 1;
      physics.update({ deltaSeconds: VEHICLE_SLICE, elapsedSeconds: frame * VEHICLE_SLICE, frame });
    }
  };
  const position = (): Vec3 => {
    const current = pose as TransformComponent | null;
    return current ? [...current.position] : assert.fail("car pose not synced");
  };
  const drive = (patch: Partial<VehicleInput>): void =>
    physics.setVehicleInput("car", { ...NEUTRAL_VEHICLE_INPUT, ...patch });
  return { physics, entities, tick, position, drive };
}

registerSurfaceResponseTests(test as unknown as Parameters<typeof registerSurfaceResponseTests>[0]);
await registerSurfaceResponseRapierTests(test as unknown as Parameters<typeof registerSurfaceResponseRapierTests>[0], createVehicleTestWorld);
