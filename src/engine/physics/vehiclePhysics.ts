// Ported from Forge WebGL engine/physics/physicsSubsystem.ts (vehicles) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Forge's PhysicsSubsystem was one 2,817-line file; this repo's budget stops at
// 1,500, so it is split into physicsSubsystem / staticWorld / vehiclePhysics /
// physicsBodies / physicsTypes with method bodies unchanged. The ragdoll is not
// ported (plan K12).
import { type TransformComponent } from "../legacy/components.ts";
import { computeVehicleDrive } from "./vehicle/vehicleDrive.ts";
import { nominalWheelLoad, sinkage, vehicleWheelWidth } from "./surface/sinkage.ts";
import { frameCompaction } from "./surface/wheelTracks.ts";
import { resistanceImpulse, wheelGroundResistance } from "./surface/softGroundResistance.ts";
import { computeWheelSurfaceResponse, type SurfaceSample, type VehicleGroundSinkProvider, type VehicleSurfaceProvider } from "./surface/surfaceResponse.ts";
import { bellyDragImpulse, digTargetDepth, rutLateralImpulse, slewSinkDepth, tractionSlip, wheelSinkLimit } from "./surface/wheelSink.ts";
import { advanceWheelSpin, limitWheelEngineForce, longitudinalSlip } from "./surface/wheelTraction.ts";
import { computeVehicleAerodynamics, initialVehicleDrivetrainState } from "./vehicle/vehicleDrivetrain.ts";
import { NEUTRAL_VEHICLE_INPUT, type VehicleDefinition, type VehicleInput, type VehicleMotionState, type VehicleState } from "./vehicle/vehicleTypes.ts";
import type { EntityId } from "../legacy/entity.ts";
import type { Vec3 } from "../legacy/layout.ts";
import { type PhysicsBody, type RapierModule, type RapierWorld, type RapierRigidBody, type RapierVehicleController, type VehicleRecord, type RapierBodyRecord, type SuspendedDynamicBody } from "./physicsTypes.ts";
import { pointInverseMass, chassisForwardSpeed, RUT_STEERING_MIN_SPEED, chassisBottomY, vectorFromVec3 } from "./physicsBodies.ts";

/** What VehiclePhysics reads from its subsystem; asked each time (the world is rebuilt). */
export interface VehiclePhysicsHost {
  rapierModule(): RapierModule | null;
  rapierWorld(): RapierWorld | null;
  rapierBodies(): ReadonlyMap<EntityId, RapierBodyRecord>;
  bodies(): readonly PhysicsBody[];
  suspendedDynamicBodies(): ReadonlyMap<EntityId, SuspendedDynamicBody>;
  rapierColliderToEntity(): ReadonlyMap<number, EntityId>;
  gravity(): Vec3;
  setEntityTransform(entityId: EntityId, transform: TransformComponent): void;
}

/**
 * Ray-cast vehicles on the physics world: records, drive, suspension, sinkage
 * and ground resistance. Split out of Forge's PhysicsSubsystem (one class of
 * 2,817 lines); the methods are Forge's, unchanged except that the world state
 * they read comes through {@link VehiclePhysicsHost}.
 */
export class VehiclePhysics {
  private readonly host: VehiclePhysicsHost;

  constructor(host: VehiclePhysicsHost) {
    this.host = host;
  }

  vehicles = new Map<EntityId, VehicleRecord>();
  vehicleSurfaceProvider: VehicleSurfaceProvider | null = null;
  vehicleGroundSinkProvider: VehicleGroundSinkProvider | null = null;

  /** Installs optional wheel surface response; null restores authored behaviour. */
  setVehicleSurfaceProvider(provider: VehicleSurfaceProvider | null): void {
    this.vehicleSurfaceProvider = provider;
  }

  /**
   * Installs the soft-track depth source (TERRAIN_DEFORMATION Faz 3). Null
   * lets every sunk wheel climb back to its authored rest length at the slew rate.
   */
  setVehicleGroundSinkProvider(provider: VehicleGroundSinkProvider | null): void {
    this.vehicleGroundSinkProvider = provider;
  }

  /**
   * Turns a dynamic (`simulatePhysics`) entity into a ray-cast vehicle chassis:
   * its mass and centre of mass come from the definition, and each wheel is a
   * suspension ray. Returns false — leaving the body untouched — when Rapier is
   * not live or the entity is not a dynamic body. Replaces an existing vehicle
   * on the same entity.
   */
  createVehicle(entityId: EntityId, definition: VehicleDefinition): boolean {
    this.removeVehicle(entityId);
    const record: VehicleRecord = {
      entityId,
      definition,
      source: "api",
      controller: null,
      input: NEUTRAL_VEHICLE_INPUT,
      steer: 0,
      drivetrain: initialVehicleDrivetrainState(definition),
      engineLoad: 0,
      sink: [],
      sinkLimits: [],
      tractionSlip: [],
      wheelSpinSpeed: [],
      wheelSpinRotation: [],
    };
    if (!this.attachVehicleController(record)) return false;
    this.vehicles.set(entityId, record);
    return true;
  }

  /** Detaches the vehicle controller; the chassis stays a plain dynamic body. */
  removeVehicle(entityId: EntityId): void {
    const record = this.vehicles.get(entityId);
    if (!record) return;
    if (record.controller) this.host.rapierWorld()?.removeVehicleController(record.controller);
    this.vehicles.delete(entityId);
  }

  hasVehicle(entityId: EntityId): boolean {
    return this.vehicles.has(entityId);
  }

  /**
   * Teleports a vehicle to `transform` at rest — the "flip back onto the
   * wheels" reset every driving game needs. Velocities and steering are zeroed.
   */
  resetVehicle(entityId: EntityId, transform: TransformComponent): void {
    const record = this.vehicles.get(entityId);
    const rapier = this.host.rapierBodies().get(entityId);
    if (!record || !rapier) return;
    this.host.setEntityTransform(entityId, transform);
    rapier.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rapier.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    record.steer = 0;
    record.drivetrain = initialVehicleDrivetrainState(record.definition);
    record.engineLoad = 0;
    record.tractionSlip.fill(0);
    record.wheelSpinSpeed.fill(0);
    record.wheelSpinRotation.fill(0);
  }

  /** The resolved definition a vehicle was built from, or null when not a vehicle. */
  vehicleDefinition(entityId: EntityId): VehicleDefinition | null {
    return this.vehicles.get(entityId)?.definition ?? null;
  }

  /**
   * The vehicle's velocities, handbrake and gearbox position, or null when the
   * id is not a live vehicle — the half of a save its pose does not cover.
   */
  vehicleMotion(entityId: EntityId): VehicleMotionState | null {
    const record = this.vehicles.get(entityId);
    const rapier = this.host.rapierBodies().get(entityId);
    if (!record || !rapier) return null;
    const linear = rapier.body.linvel();
    const angular = rapier.body.angvel();
    return {
      linearVelocity: [linear.x, linear.y, linear.z],
      angularVelocity: [angular.x, angular.y, angular.z],
      handbrake: record.input.handbrake,
      drivetrain: record.drivetrain
        ? { gear: record.drivetrain.gear, engineRpm: record.drivetrain.engineRpm }
        : null,
    };
  }

  /**
   * Puts a vehicle back where and how a save found it: teleported to
   * `transform`, moving at the saved velocities, on (or off) its handbrake and
   * in the saved gear. A gear the definition does not have, or a drivetrain on
   * a car that has none, falls back to the reset state; RPM is clamped to the
   * engine's range. Returns false when the id is not a live vehicle.
   */
  restoreVehicle(entityId: EntityId, transform: TransformComponent, motion: VehicleMotionState): boolean {
    const record = this.vehicles.get(entityId);
    const rapier = this.host.rapierBodies().get(entityId);
    if (!record || !rapier) return false;
    this.resetVehicle(entityId, transform);
    const [vx, vy, vz] = motion.linearVelocity;
    const [wx, wy, wz] = motion.angularVelocity;
    rapier.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    rapier.body.setAngvel({ x: wx, y: wy, z: wz }, true);
    record.input = { ...NEUTRAL_VEHICLE_INPUT, handbrake: motion.handbrake };
    const drivetrain = record.definition.drivetrain;
    const gear = motion.drivetrain?.gear ?? 0;
    const gearExists = gear === -1 || (gear >= 1 && gear <= (drivetrain?.transmission.forwardRatios.length ?? 0));
    if (drivetrain && motion.drivetrain && gearExists) {
      const { idleRpm, maxRpm } = drivetrain.engine;
      record.drivetrain = {
        gear,
        engineRpm: Math.min(maxRpm, Math.max(idleRpm, motion.drivetrain.engineRpm)),
        shiftTimeRemaining: 0,
      };
    }
    return true;
  }

  /** Every entity currently driven as a vehicle, in creation order. */
  vehicleEntityIds(): EntityId[] {
    return [...this.vehicles.keys()];
  }

  /** Sets the driver intent the vehicle follows until the next call. */
  setVehicleInput(entityId: EntityId, input: VehicleInput): void {
    const record = this.vehicles.get(entityId);
    if (!record) return;
    const previous = record.input;
    record.input = { ...input };
    const active = input.throttle !== 0 || input.brake !== 0 || input.steer !== 0 || input.handbrake;
    const changed =
      input.throttle !== previous.throttle ||
      input.brake !== previous.brake ||
      input.steer !== previous.steer ||
      input.handbrake !== previous.handbrake;
    // A parked car sleeps and the ray-cast controller does not wake it on its
    // own — including a handbrake release on a slope, which must let it roll.
    if (active || changed) this.host.rapierBodies().get(entityId)?.body.wakeUp();
  }

  /** Live speed and per-wheel suspension readback, or null when not a vehicle. */
  vehicleState(entityId: EntityId): VehicleState | null {
    const record = this.vehicles.get(entityId);
    const controller = record?.controller;
    const rapier = this.host.rapierBodies().get(entityId);
    if (!record || !controller || !rapier) return null;
    const q = rapier.body.rotation();
    const chassisPosition = rapier.body.translation();
    const forward = { x: 2 * (q.x * q.z + q.w * q.y), y: 2 * (q.y * q.z - q.w * q.x),
      z: 1 - 2 * (q.x * q.x + q.y * q.y) };
    return {
      forwardSpeed: chassisForwardSpeed(rapier.body),
      engineLoad: record.engineLoad,
      drivetrain: record.drivetrain ? { ...record.drivetrain } : null,
      ...(record.telemetry ? { telemetry: {
        ...record.telemetry, input: { ...record.telemetry.input },
        pitchDeg: Math.atan2(forward.y, Math.hypot(forward.x, forward.z)) * 180 / Math.PI,
        gravityForwardForce: record.definition.massKg * (this.host.gravity()[0] * forward.x + this.host.gravity()[1] * forward.y + this.host.gravity()[2] * forward.z),
      } } : {}),
      wheels: record.definition.wheels.map((wheel, index) => {
        const inContact = controller.wheelIsInContact(index);
        const contact = inContact ? controller.wheelContactPoint(index) : null;
        const hardPoint = controller.wheelHardPoint(index);
        const suspensionLength = controller.wheelSuspensionLength(index) ?? wheel.suspensionRestLength;
        const drop = suspensionLength + (record.sink[index] ?? 0);
        const steering = controller.wheelSteering(index) ?? 0;
        const ax = Math.cos(steering), az = -Math.sin(steering);
        const [lx, ly, lz] = [wheel.position[0], wheel.position[1] - drop, wheel.position[2]];
        const tx = 2 * (q.y * lz - q.z * ly), ty = 2 * (q.z * lx - q.x * lz), tz = 2 * (q.x * ly - q.y * lx);
        return {
          position: wheel.position,
          radius: wheel.radius,
          ...(wheel.visualNode ? { visualNode: wheel.visualNode } : {}),
          suspensionLength,
          worldCenter: [chassisPosition.x + lx + q.w * tx + q.y * tz - q.z * ty,
            chassisPosition.y + ly + q.w * ty + q.z * tx - q.x * tz,
            chassisPosition.z + lz + q.w * tz + q.x * ty - q.y * tx] as const,
          worldAxle: [(1 - 2 * (q.y * q.y + q.z * q.z)) * ax + 2 * (q.x * q.z + q.w * q.y) * az,
            2 * (q.x * q.y + q.w * q.z) * ax + 2 * (q.y * q.z - q.w * q.x) * az,
            2 * (q.x * q.z - q.w * q.y) * ax + (1 - 2 * (q.x * q.x + q.y * q.y)) * az] as const,
          suspensionForce: inContact ? Math.max(0, controller.wheelSuspensionForce(index) ?? 0) : 0,
          sinkDepth: record.sink[index] ?? 0,
          ...(record.soil?.[index] ? { soilDepth: record.soil[index]!.depth } : {}),
          groundResistanceForce: inContact ? record.groundResistance?.[index] ?? 0 : 0,
          tractionSlip: record.tractionSlip[index] ?? 0,
          steering: controller.wheelSteering(index) ?? 0,
          rotation: (controller.wheelRotation(index) ?? 0) + (record.wheelSpinRotation[index] ?? 0),
          inContact,
          groundEntityId: inContact ? this.vehicleWheelGroundEntity(controller, index) : null,
          contactPoint: contact ? [contact.x, contact.y, contact.z] : null,
          hardPoint: hardPoint ? [hardPoint.x, hardPoint.y, hardPoint.z] : null,
        };
      }),
    };
  }

  /**
   * Builds the Rapier controller for a vehicle record on its chassis body. Mass
   * comes from the definition instead of the colliders (density 0), with a box
   * inertia from the chassis collider size and the authored centre of mass.
   */
  attachVehicleController(record: VehicleRecord): boolean {
    const world = this.host.rapierWorld();
    const rapier = this.host.rapierBodies().get(record.entityId);
    const body = this.host.bodies().find((candidate) => candidate.id === record.entityId);
    if (!world || !rapier || !body?.collider.simulatePhysics || !rapier.body.isDynamic()) return false;

    const { definition } = record;
    for (const collider of rapier.colliders) collider.setDensity(0);
    const [width, height, length] = [
      body.collider.size[0] ?? 1,
      body.collider.size[1] ?? 1,
      body.collider.size[2] ?? 1,
    ];
    const mass = definition.massKg;
    rapier.body.setAdditionalMassProperties(
      mass,
      vectorFromVec3([...definition.centerOfMassOffset]),
      {
        x: (mass / 12) * (height * height + length * length),
        y: (mass / 12) * (width * width + length * length),
        z: (mass / 12) * (width * width + height * height),
      },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    rapier.body.recomputeMassPropertiesFromColliders();

    const controller = world.createVehicleController(rapier.body);
    controller.indexUpAxis = 1;
    controller.setIndexForwardAxis = 2;
    definition.wheels.forEach((wheel, index) => {
      controller.addWheel(
        vectorFromVec3([...wheel.position]),
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        wheel.suspensionRestLength,
        wheel.radius,
      );
      controller.setWheelMaxSuspensionTravel(index, wheel.suspensionMaxTravel);
      controller.setWheelSuspensionStiffness(index, wheel.suspensionStiffness);
      controller.setWheelSuspensionCompression(index, wheel.suspensionCompression);
      controller.setWheelSuspensionRelaxation(index, wheel.suspensionRelaxation);
      controller.setWheelMaxSuspensionForce(index, wheel.maxSuspensionForce);
      controller.setWheelFrictionSlip(index, wheel.frictionSlip);
      controller.setWheelSideFrictionStiffness(index, wheel.sideFrictionStiffness);
    });
    // A new controller starts at the authored rest lengths.
    const bottom = chassisBottomY(body.collider);
    record.sink = definition.wheels.map(() => 0);
    record.sinkLimits = definition.wheels.map((wheel) => wheelSinkLimit(wheel, bottom));
    record.tractionSlip = definition.wheels.map(() => 0);
    record.wheelSpinSpeed = definition.wheels.map(() => 0);
    record.wheelSpinRotation = definition.wheels.map(() => 0);
    record.groundResistance = definition.wheels.map(() => 0);
    record.soil = definition.wheels.map(() => null);
    record.telemetry = { input: { ...NEUTRAL_VEHICLE_INPUT }, requestedDriveForce: 0, appliedDriveForce: 0,
      appliedGroundResistanceForce: 0, bellyResistanceForce: 0 };
    record.controller = controller;
    return true;
  }

  vehicleWheelGroundEntity(controller: RapierVehicleController, index: number): EntityId | null {
    const ground = controller.wheelGroundObject(index);
    return ground ? this.host.rapierColliderToEntity().get(ground.handle) ?? null : null;
  }

  /** Feeds each vehicle's drive commands and runs its wheel rays for one slice. */
  updateVehicles(deltaSeconds: number): void {
    const RAPIER = this.host.rapierModule();
    if (!RAPIER) return;
    for (const record of this.vehicles.values()) {
      const controller = record.controller;
      const rapier = this.host.rapierBodies().get(record.entityId);
      if (!controller || !rapier) continue;
      if (this.host.suspendedDynamicBodies().has(record.entityId)) continue;
      const forwardSpeed = chassisForwardSpeed(rapier.body);
      // Rapier exposes the previous slice's wheel rays/load until updateVehicle.
      // Sample once, before gearing, so the gearbox sees the resistance that
      // will remain active during its power cut. Side stiffness is a scale here
      // and composes with the command's handbrake response below.
      const samples = record.definition.wheels.map((_wheel, index) => {
        const contact = this.vehicleSurfaceProvider && controller.wheelIsInContact(index)
          ? controller.wheelContactPoint(index) : null;
        return contact ? this.vehicleSurfaceProvider!(
          record.entityId, index, this.vehicleWheelGroundEntity(controller, index),
          [contact.x, contact.y, contact.z],
        ) : null;
      });
      const bellyResistance = this.applyWheelSink(record, controller, rapier.body, deltaSeconds, forwardSpeed, samples);
      const surfaces = record.definition.wheels.map((wheel, index) => {
        return computeWheelSurfaceResponse(
          { frictionSlip: wheel.frictionSlip, sideFrictionStiffness: 1 },
          samples[index]!, forwardSpeed, controller.wheelSuspensionForce(index) ?? 0,
        );
      });
      record.groundResistance = record.definition.wheels.map((wheel, index) => controller.wheelIsInContact(index)
        ? wheelGroundResistance(samples[index]!, controller.wheelSuspensionForce(index) ?? 0,
          record.sink[index] ?? 0, wheel.radius, forwardSpeed) : 0);
      const drive = computeVehicleDrive(
        record.definition,
        record.input,
        forwardSpeed,
        record.steer,
        deltaSeconds,
        record.drivetrain,
        bellyResistance + record.groundResistance.reduce((sum, force) => sum + force, 0),
      );
      record.steer = drive.steer;
      record.drivetrain = drive.drivetrain;
      record.engineLoad = drive.engineLoad;
      record.telemetry = { input: { ...record.input },
        requestedDriveForce: drive.wheels.reduce((sum, command) => sum + command.engineForce, 0),
        appliedDriveForce: 0, appliedGroundResistanceForce: 0, bellyResistanceForce: bellyResistance };
      drive.wheels.forEach((command, index) => {
        const surface = surfaces[index]!;
        const reducedGrip = surface.tractionCoefficient !== undefined || surface.frictionSlip < record.definition.wheels[index]!.frictionSlip;
        controller.setWheelEngineForce(index, reducedGrip
          ? limitWheelEngineForce(command.engineForce, controller.wheelSuspensionForce(index) ?? 0, surface.frictionSlip, deltaSeconds, surface.tractionCoefficient)
          : command.engineForce);
        // The controller takes the brake as a per-slice impulse cap.
        controller.setWheelBrake(index, command.brakeForce * deltaSeconds);
        controller.setWheelSteering(index, command.steering);
        controller.setWheelFrictionSlip(index, surface.frictionSlip);
        controller.setWheelSideFrictionStiffness(index, command.sideFrictionStiffness * surface.sideFrictionStiffness);
      });
      const velocity = rapier.body.linvel();
      const force = computeVehicleAerodynamics(record.definition, [velocity.x, velocity.y, velocity.z]);
      if (force.some((component) => component !== 0)) {
        // Impulses apply this slice only; addForce would accumulate between slices.
        rapier.body.applyImpulse({ x: force[0] * deltaSeconds, y: force[1] * deltaSeconds, z: force[2] * deltaSeconds }, false);
      }
      const body = this.host.bodies().find((candidate) => candidate.id === record.entityId);
      controller.updateVehicle(
        deltaSeconds,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        body?.collider.collisionGroups,
      );
      record.telemetry.appliedDriveForce = record.definition.wheels.reduce((sum, _wheel, index) =>
        sum + (controller.wheelIsInContact(index) && controller.wheelEngineForce(index) !== 0
          ? (controller.wheelForwardImpulse(index) ?? 0) / deltaSeconds : 0), 0);
      // Rapier's ray-cast wheels never spin faster than the ground, so wheelspin
      // is read from the friction circle this slice's impulses were judged by.
      record.definition.wheels.forEach((wheel, index) => {
        const command = drive.wheels[index]!;
        record.tractionSlip[index] = controller.wheelIsInContact(index)
          ? Math.max(longitudinalSlip(command.engineForce, controller.wheelSuspensionForce(index) ?? 0, surfaces[index]!.tractionCoefficient), tractionSlip(
            command.engineForce, controller.wheelSideImpulse(index) ?? 0,
            controller.wheelSuspensionForce(index) ?? 0, controller.wheelFrictionSlip(index) ?? 0, deltaSeconds,
          ))
          : 0;
        const reducedGrip = surfaces[index]!.tractionCoefficient !== undefined || surfaces[index]!.frictionSlip < wheel.frictionSlip;
        record.wheelSpinSpeed[index] = advanceWheelSpin(
          record.wheelSpinSpeed[index] ?? 0, command.engineForce,
          reducedGrip ? record.tractionSlip[index]! : 0, command.brakeForce > 0, deltaSeconds,
        );
        record.wheelSpinRotation[index] = (record.wheelSpinRotation[index] ?? 0)
          + record.wheelSpinSpeed[index]! / wheel.radius * deltaSeconds;
      });
    }
  }

  /** Applies after drive AND gravity: a finite soil threshold can hold a resting car. */
  applyVehicleGroundResistance(dt: number): void {
    for (const record of this.vehicles.values()) {
      const controller = record.controller;
      const body = this.host.rapierBodies().get(record.entityId)?.body;
      if (!controller || !body || this.host.suspendedDynamicBodies().has(record.entityId)) continue;
      record.definition.wheels.forEach((wheel, index) => {
        if (!controller.wheelIsInContact(index)) return;
        const point = controller.wheelContactPoint(index);
        const normal = controller.wheelContactNormal(index);
        if (!point || !normal) return;
        const ground = controller.wheelGroundObject(index)?.parent();
        const a = body.velocityAtPoint(point);
        const b = ground?.velocityAtPoint(point) ?? { x: 0, y: 0, z: 0 };
        const normalSpeed = (a.x - b.x) * normal.x + (a.y - b.y) * normal.y + (a.z - b.z) * normal.z;
        const tangent = { x: a.x - b.x - normal.x * normalSpeed,
          y: a.y - b.y - normal.y * normalSpeed, z: a.z - b.z - normal.z * normalSpeed };
        const speed = Math.hypot(tangent.x, tangent.y, tangent.z);
        const sample = this.vehicleSurfaceProvider?.(record.entityId, index,
          this.vehicleWheelGroundEntity(controller, index), [point.x, point.y, point.z]) ?? null;
        const force = wheelGroundResistance(sample, controller.wheelSuspensionForce(index) ?? 0,
          record.sink[index] ?? 0, wheel.radius, speed);
        record.groundResistance![index] = force;
        if (speed < 1e-9 || force <= 0) return;
        const direction = { x: tangent.x / speed, y: tangent.y / speed, z: tangent.z / speed };
        const inverseMass = pointInverseMass(body, point, direction) + (ground ? pointInverseMass(ground, point, direction) : 0);
        const magnitude = resistanceImpulse(speed, force, dt, inverseMass);
        if (record.telemetry) record.telemetry.appliedGroundResistanceForce += magnitude / dt;
        const impulse = { x: -direction.x * magnitude, y: -direction.y * magnitude, z: -direction.z * magnitude };
        body.applyImpulseAtPoint(impulse, point, false);
        if (ground?.isDynamic()) ground.applyImpulseAtPoint({ x: -impulse.x, y: -impulse.y, z: -impulse.z }, point, true);
      });
    }
  }

  /**
   * Faz 3 sinkage as a virtual ground offset: each wheel's rest length shrinks
   * by the track depth under its last contact (Faz 0: `rest − depth`, at most
   * 0.3 m/s, and a sleeping chassis does not notice on its own). The terrain
   * collider never changes, so a wheel stops at the depth where the chassis
   * would reach it; mud wanted deeper than that drags on the belly instead.
   * A rut's cross slope just ahead of a rolling wheel pushes it toward the
   * deeper side at the contact point (rut steering, research C6), so a car
   * tends to follow existing ruts and needs steering to climb out.
   */
  applyWheelSink(
    record: VehicleRecord,
    controller: RapierVehicleController,
    body: RapierRigidBody,
    deltaSeconds: number,
    forwardSpeed: number,
    samples: readonly (SurfaceSample | null)[],
  ): number {
    const provider = this.vehicleGroundSinkProvider;
    if (!provider && !samples.some((sample) => sample?.softGround) && !record.sink.some((depth) => depth > 0)) return 0;
    let heading = 0;
    if (provider) {
      const q = body.rotation();
      heading = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    }
    // Rut steering reads the ground ahead of a rolling wheel; a creeping or parked car has no "ahead".
    const travel = Math.abs(forwardSpeed) < RUT_STEERING_MIN_SPEED ? 0 : Math.sign(forwardSpeed);
    let changed = false;
    let overlap = 0;
    let resistance = 0;
    let sinking = 0;
    record.definition.wheels.forEach((wheel, index) => {
      let target = 0;
      const contact = controller.wheelIsInContact(index) ? controller.wheelContactPoint(index) : null;
      const wheelHeading = heading + (controller.wheelSteering(index) ?? 0);
      const sink = contact && provider ? provider({
        vehicleEntityId: record.entityId,
        wheelIndex: index,
        groundEntityId: this.vehicleWheelGroundEntity(controller, index),
        contactPoint: [contact.x, contact.y, contact.z],
        heading: wheelHeading,
        width: vehicleWheelWidth(wheel),
        radius: wheel.radius,
        travel,
      }) : null;
      let depth = sink && Number.isFinite(sink.depth) ? Math.max(0, sink.depth) : 0;
      const sample = samples[index];
      const soil = sample?.softGround;
      if (contact && soil) {
        const width = vehicleWheelWidth(wheel);
        const loadDepth = sinkage(soil, sample.deformability, {
          load: controller.wheelSuspensionForce(index) ?? 0, nominalLoad: nominalWheelLoad(record.definition), width,
        });
        const previous = record.soil?.[index];
        const staying = previous && Math.hypot(contact.x - previous.x, contact.z - previous.z) < width / 2;
        const current = Math.max(depth, staying ? previous.depth : 0);
        const compacted = current + Math.max(0, loadDepth - current) * frameCompaction(soil.compaction, deltaSeconds);
        depth = digTargetDepth(compacted, record.tractionSlip[index] ?? 0, soil.digRate, deltaSeconds,
          soil.maxDepth * sample.deformability);
        record.soil![index] = { x: staying ? previous.x : contact.x, z: staying ? previous.z : contact.z, depth };
      } else if (record.soil) record.soil[index] = null;
      if (contact && depth > 0) {
        const limit = record.sinkLimits[index] ?? 0;
        target = Math.min(depth, limit);
        overlap += Math.max(0, depth - limit);
        resistance += soil?.sinkResistance ?? sink?.resistance ?? 0;
        sinking += 1;
        const push = rutLateralImpulse(sink?.slope ?? 0, controller.wheelSuspensionForce(index) ?? 0, wheelHeading, deltaSeconds);
        if (push[0] !== 0 || push[2] !== 0) body.applyImpulseAtPoint({ x: push[0], y: 0, z: push[2] }, contact!, true);
      }
      const previous = record.sink[index] ?? 0;
      const next = slewSinkDepth(previous, target, deltaSeconds);
      if (next === previous) return;
      record.sink[index] = next;
      controller.setWheelSuspensionRestLength(index, wheel.suspensionRestLength - next);
      changed = true;
    });
    if (changed) body.wakeUp();
    if (overlap > 0 && sinking > 0) {
      // Spread over every wheel: one wheel in a deep hole drags a quarter as hard as four.
      const velocity = body.linvel();
      const impulse = bellyDragImpulse(
        [velocity.x, velocity.y, velocity.z],
        overlap / record.definition.wheels.length,
        resistance / sinking,
        record.definition.massKg,
        deltaSeconds,
      );
      if (impulse[0] !== 0 || impulse[2] !== 0) body.applyImpulse({ x: impulse[0], y: 0, z: impulse[2] }, true);
      return Math.hypot(impulse[0], impulse[2]) / deltaSeconds;
    }
    return 0;
  }
}
