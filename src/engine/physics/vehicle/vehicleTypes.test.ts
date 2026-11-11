// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { type TransformComponent } from "../../legacy/components.ts";
import { type Entity } from "../../legacy/entity.ts";
import { type Vec3 } from "../../legacy/layout.ts";
import { PhysicsSubsystem } from "../physicsSubsystem.ts";
import { computeVehicleDrive } from "./vehicleDrive.ts";
import { NEUTRAL_VEHICLE_INPUT, createReferenceCarDefinition, resolveVehicleDefinition, type VehicleInput, vehicleDefinitionFromComponent } from "./vehicleTypes.ts";
import { test } from "vitest";

const check = test;
const checkAsync = test;

async function withQuietRapierInit(run: () => Promise<void>): Promise<void> {
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) {
      return;
    }
    warn(...args);
  };
  try {
    await run();
  } finally {
    console.warn = warn;
  }
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

// Vehicle plan Faz 1: ray-cast vehicle on the Rapier world.
check("resolveVehicleDefinition fills defaults and rejects unusable numbers", () => {
  const definition = resolveVehicleDefinition({
    massKg: -5,
    maxEngineForce: Number.NaN,
    maxSteerAngleDeg: 400,
    wheels: [{ position: [1, 0, 2], radius: 0, drive: true }],
  });
  assert.equal(definition.massKg, 1200);
  assert.equal(definition.maxEngineForce, 6000);
  assert.equal(definition.maxSteerAngleDeg, 80);
  const wheel = definition.wheels[0] ?? assert.fail("wheel");
  assert.deepEqual(wheel.position, [1, 0, 2]);
  assert.equal(wheel.radius, 0.35);
  assert.equal(wheel.drive, true);
  assert.equal(wheel.steer, false);
  assert.equal(wheel.brake, true);
});

check("computeVehicleDrive splits pedals across drive, brake and handbrake wheels", () => {
  const car = createReferenceCarDefinition(); // front: steer; rear: drive + handbrake
  const input = (patch: Partial<VehicleInput>): VehicleInput => ({ ...NEUTRAL_VEHICLE_INPUT, ...patch });

  const throttle = computeVehicleDrive(car, input({ throttle: 1 }), 5, 0, 1 / 60);
  assert.deepEqual(throttle.wheels.map((w) => w.engineForce), [0, 0, 3000, 3000]);
  assert.ok(throttle.wheels.every((w) => w.brakeForce === 0), "no rolling resistance under throttle");

  const braking = computeVehicleDrive(car, input({ brake: 1 }), 10, 0, 1 / 60);
  assert.ok(braking.wheels.every((w) => w.engineForce === 0));
  assert.deepEqual(braking.wheels.map((w) => w.brakeForce), [2750, 2750, 2750, 2750]);

  const reversing = computeVehicleDrive(car, input({ brake: 1 }), 0.2, 0, 1 / 60);
  assert.deepEqual(reversing.wheels.map((w) => w.engineForce), [0, 0, -1500, -1500]);

  // Throttle while still rolling backwards brakes first instead of fighting the roll.
  const recovering = computeVehicleDrive(car, input({ throttle: 1 }), -3, 0, 1 / 60);
  assert.ok(recovering.wheels.every((w) => w.engineForce === 0));
  assert.ok(recovering.wheels.every((w) => w.brakeForce > 0));

  const handbrake = computeVehicleDrive(car, input({ handbrake: true }), 5, 0, 1 / 60);
  const [frontLeft, , rearLeft] = handbrake.wheels;
  assert.equal(frontLeft?.brakeForce, 75); // coasting rolling resistance only
  assert.equal(rearLeft?.brakeForce, 75 + 2500);
});

check("computeVehicleDrive reports the driving pedal as engine load, not a braking one or a shift cut", () => {
  const car = createReferenceCarDefinition(); // reverse threshold 0.5 m/s
  const input = (patch: Partial<VehicleInput>): VehicleInput => ({ ...NEUTRAL_VEHICLE_INPUT, ...patch });
  assert.equal(computeVehicleDrive(car, input({ throttle: 0.6 }), 10, 0, 1 / 60).engineLoad, 0.6);
  assert.equal(computeVehicleDrive(car, input({ brake: 1 }), 10, 0, 1 / 60).engineLoad, 0, "braking");
  assert.equal(computeVehicleDrive(car, input({ brake: 0.8 }), 0, 0, 1 / 60).engineLoad, 0.8, "reversing");
  assert.equal(computeVehicleDrive(car, input({ throttle: 1 }), -5, 0, 1 / 60).engineLoad, 0, "throttle as brake");
  assert.equal(computeVehicleDrive(car, NEUTRAL_VEHICLE_INPUT, 10, 0, 1 / 60).engineLoad, 0, "coasting");
  const geared = resolveVehicleDefinition({ wheels: car.wheels, drivetrain: {} });
  const midShift = { engineRpm: 3000, gear: 2, shiftTimeRemaining: 0.15 };
  assert.equal(computeVehicleDrive(geared, input({ throttle: 1 }), 15, 0, 1 / 60, midShift).engineLoad, 0,
    "the power cut of a gear change");
});

check("computeVehicleDrive eases steering and turns right as a negative yaw", () => {
  const car = createReferenceCarDefinition(); // steerSpeed 3/s, full lock 35°
  const right: VehicleInput = { ...NEUTRAL_VEHICLE_INPUT, steer: 1 };
  const first = computeVehicleDrive(car, right, 0, 0, 0.1);
  assert.ok(Math.abs(first.steer - 0.3) < 1e-9, `steer=${first.steer}`);
  const [front, , rear] = first.wheels;
  assert.ok(Math.abs((front?.steering ?? 0) - (-0.3 * 35 * Math.PI) / 180) < 1e-9);
  assert.equal(rear?.steering, 0);
  const full = computeVehicleDrive(car, right, 0, first.steer, 1);
  assert.equal(full.steer, 1); // clamps at the target, no overshoot
  const back = computeVehicleDrive(car, NEUTRAL_VEHICLE_INPUT, 0, 1, 0.1);
  assert.ok(Math.abs(back.steer - 0.7) < 1e-9);
});

await checkAsync("rapier vehicle settles on its suspension with every wheel grounded", async () => {
  await withQuietRapierInit(async () => {
    const world = await createVehicleTestWorld();
    world.physics.createVehicle("car", createReferenceCarDefinition());
    world.tick(3);
    const state = world.physics.vehicleState("car") ?? assert.fail("vehicle state");
    assert.equal(state.wheels.length, 4);
    for (const wheel of state.wheels) {
      assert.ok(wheel.inContact, "wheel off the ground at rest");
      // ~7 cm static sag: g / (4 wheels × stiffness 30) below the 0.35 m rest length.
      assert.ok(wheel.suspensionLength > 0.25 && wheel.suspensionLength < 0.34, `length=${wheel.suspensionLength}`);
    }
    // Ground top is y=0: hard point (-0.1) + spring + radius puts the body ~0.73 up.
    const [, y] = world.position();
    assert.ok(y > 0.68 && y < 0.78, `chassis y=${y}`);
    assert.ok(Math.abs(state.forwardSpeed) < 0.05, `creeping at ${state.forwardSpeed}`);
    world.physics.dispose();
  });
});

await checkAsync("rapier vehicle drives forward, steers right, brakes and reverses", async () => {
  await withQuietRapierInit(async () => {
    const world = await createVehicleTestWorld();
    world.physics.createVehicle("car", createReferenceCarDefinition());
    world.tick(1);

    world.drive({ throttle: 1 });
    world.tick(3);
    const afterThrottle = world.position();
    const speed = world.physics.vehicleState("car")?.forwardSpeed ?? 0;
    assert.ok(speed > 10 && speed < 15, `3 s of full throttle reached ${speed} m/s`);
    assert.equal(world.physics.vehicleState("car")?.engineLoad, 1, "the engine pulls flat out");
    assert.ok(afterThrottle[2] > 15, `forward is +Z: z=${afterThrottle[2]}`);
    assert.ok(Math.abs(afterThrottle[0]) < 0.1, `drifted sideways: x=${afterThrottle[0]}`);
    assert.ok(Math.abs(afterThrottle[1] - 0.73) < 0.08, `chassis y=${afterThrottle[1]}`);

    world.drive({ throttle: 0.5, steer: 1 });
    world.tick(1.5);
    const afterTurn = world.position();
    assert.ok(afterTurn[0] < afterThrottle[0] - 2, `right turn heads to -X: x=${afterTurn[0]}`);

    world.drive({ brake: 1 });
    world.tick(2.5);
    const stopped = world.physics.vehicleState("car")?.forwardSpeed ?? Number.NaN;
    assert.ok(stopped < 0, `holding brake past a stop reverses: ${stopped}`);
    world.tick(1.5);
    const reversing = world.physics.vehicleState("car")?.forwardSpeed ?? Number.NaN;
    assert.ok(reversing < -2, `reverse speed ${reversing}`);
    world.physics.dispose();
  });
});

await checkAsync("rapier vehicle handbrake holds on a slope and releasing it rolls downhill", async () => {
  await withQuietRapierInit(async () => {
    const world = await createVehicleTestWorld({ slopeDeg: 8 });
    world.physics.createVehicle("car", createReferenceCarDefinition());
    world.drive({ handbrake: true });
    world.tick(1);
    const held = world.position();
    world.tick(3);
    const later = world.position();
    assert.ok(Math.abs(later[2] - held[2]) < 0.15, `handbrake crept ${later[2] - held[2]} m`);

    // The parked chassis is asleep by now; releasing must wake it.
    world.drive({});
    world.tick(2);
    const rolled = world.position();
    assert.ok(later[2] - rolled[2] > 1, `rolled ${later[2] - rolled[2]} m downhill`);
    world.physics.dispose();
  });
});

await checkAsync("rapier vehicle survives a world rebuild and leaves with its entity", async () => {
  await withQuietRapierInit(async () => {
    const world = await createVehicleTestWorld();
    world.physics.createVehicle("car", createReferenceCarDefinition());
    world.physics.setEntities(world.entities); // e.g. a level reload rebuilds the world
    assert.equal(world.physics.hasVehicle("car"), true);
    world.tick(1);
    world.drive({ throttle: 1 });
    world.tick(1);
    assert.ok((world.physics.vehicleState("car")?.forwardSpeed ?? 0) > 3, "re-attached vehicle drives");

    world.physics.removeEntity("car");
    assert.equal(world.physics.hasVehicle("car"), false);
    assert.equal(world.physics.vehicleState("car"), null);
    world.tick(0.1); // stepping without the chassis must not touch a freed controller
    world.physics.dispose();
  });
});

check("vehicleDefinitionFromComponent overrides the reference car and replaces its wheels", () => {
  assert.equal(vehicleDefinitionFromComponent(undefined), null);
  assert.equal(vehicleDefinitionFromComponent([1, 2]), null);
  const reference = createReferenceCarDefinition();
  assert.deepEqual(vehicleDefinitionFromComponent({}), reference);
  const tuned = vehicleDefinitionFromComponent({
    massKg: 900,
    maxEngineForce: "fast",
    wheels: [
      { position: [0, 0, 1], steer: true, drive: "yes" },
      { radius: 0.4 }, // no position: dropped
    ],
  });
  assert.equal(tuned?.massKg, 900);
  assert.equal(tuned?.maxEngineForce, reference.maxEngineForce);
  assert.equal(tuned?.wheels.length, 1);
  assert.equal(tuned?.wheels[0]?.steer, true);
  assert.equal(tuned?.wheels[0]?.drive, false); // non-boolean flag falls back
});

await checkAsync("rapier vehicle aerodynamics slow a coasting chassis and compress suspension with downforce", async () => {
  await withQuietRapierInit(async () => {
    const results: { speed: number; spring: number }[] = [];
    for (const aerodynamics of [
      { dragCoefficient: 0, downforceCoefficient: 0 },
      { dragCoefficient: 4, downforceCoefficient: 0 },
      { dragCoefficient: 0, downforceCoefficient: 12 },
    ]) {
      const world = await createVehicleTestWorld();
      try {
        const definition = vehicleDefinitionFromComponent({ aerodynamics })!;
        world.physics.createVehicle("car", definition);
        world.tick(2);
        world.physics.applyImpulse("car", [0, 0, definition.massKg * 20]);
        world.tick(1);
        const state = world.physics.vehicleState("car")!;
        assert.ok(state.wheels.every((wheel) => wheel.inContact));
        results.push({ speed: state.forwardSpeed,
          spring: state.wheels.reduce((sum, wheel) => sum + wheel.suspensionLength, 0) / state.wheels.length });
      } finally {
        world.physics.dispose();
      }
    }
    assert.ok(results[1]!.speed < results[0]!.speed - 0.8, `drag: ${JSON.stringify(results)}`);
    assert.ok(results[2]!.spring < results[0]!.spring - 0.01, `downforce: ${JSON.stringify(results)}`);
  });
});
