// Ported from Forge WebGL engine/physics/physicsSubsystem.ts (shared types and constants) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Forge's PhysicsSubsystem was one 2,817-line file; this repo's budget stops at
// 1,500, so it is split into physicsSubsystem / staticWorld / vehiclePhysics /
// physicsBodies / physicsTypes with method bodies unchanged. The ragdoll is not
// ported (plan K12).
import { type StaticSpatialEntry } from "./staticSpatialIndex.ts";
import { HeightfieldStaticSource } from "./heightfieldStatic.ts";
import { type ColliderComponent, type TransformComponent } from "../legacy/components.ts";
import { type NavigationRole } from "./collision.ts";
import { type PoseQuat } from "./fixedStep.ts";
import { type VehicleDefinition, type VehicleDrivetrainState, type VehicleInput, type VehicleTelemetry } from "./vehicle/vehicleTypes.ts";
import type { EntityId } from "../legacy/entity.ts";
import type { PhysicsSurfaceTriangle } from "./physicsQuery.ts";
import type { Vec3 } from "../legacy/layout.ts";

/** Past this many pending regions the log collapses to "everything changed". */
export const MAX_NAVIGATION_DIRTY_REGIONS = 256;

export const PHYSICS_SUBSYSTEM_ID = "physics";
/** Bodies this close still count as touching; a pair is released past it, metres. */
export const PASS_THROUGH_MARGIN = 0.05;
/** Collider surface defaults when no physical material is assigned. */
export const DEFAULT_FRICTION = 0.8;
export const DEFAULT_RESTITUTION = 0;
export type PhysicsBackend = "placeholder" | "rapier";
export type PhysicsTransformSink = (entityId: EntityId, transform: TransformComponent) => void;

export interface PhysicsSubsystemOptions {
  backend?: PhysicsBackend;
  /** Rapier simulation slice in seconds (default 1/60); see {@link FixedStepClock}. */
  fixedTimestep?: number;
  /** Max Rapier slices per frame (default 4); a longer frame drops its backlog. */
  maxSubstepsPerFrame?: number;
}

/** Optional Phase 7 policy for dynamically simulated bodies in large worlds. */
export interface DynamicPhysicsActiveAreaSettings {
  /** Runtime-owned focus point, normally the possessed pawn. */
  focusPosition?: () => readonly [number, number, number] | null;
  /** Dynamic bodies farther than this distance are suspended until focus returns. */
  activeDistance?: number;
}

export interface PhysicsBody {
  id: EntityId;
  transform: TransformComponent;
  collider: ColliderComponent;
  /** From the entity's `Vehicle` component: the body becomes a vehicle chassis. */
  vehicle?: VehicleDefinition;
}

export interface Aabb {
  min: [number, number, number];
  max: [number, number, number];
  navigationRole?: NavigationRole;
  /** Oriented XZ ground silhouette for a rotated box collider (see {@link PhysicsAabb}). */
  footprint?: readonly (readonly [number, number])[];
}

export interface StaticBodyRecord {
  readonly order: number;
  readonly blockers: StaticSpatialEntry<Aabb>[];
  readonly surfaces: StaticSpatialEntry<PhysicsSurfaceTriangle>[];
  readonly navigationRole: NavigationRole | undefined;
  /** Heightfield primitives answered on demand instead of filed into the index; after the body's other items. */
  readonly fields: HeightfieldStaticSource[];
}

export type RapierModule = typeof import("@dimforge/rapier3d-compat");
export type RapierWorld = InstanceType<RapierModule["World"]>;
export type RapierRigidBody = ReturnType<RapierWorld["createRigidBody"]>;
export type RapierCollider = ReturnType<RapierWorld["createCollider"]>;
export type RapierEventQueue = InstanceType<RapierModule["EventQueue"]>;
export type RapierVehicleController = ReturnType<RapierWorld["createVehicleController"]>;

/**
 * A ray-cast vehicle bound to a dynamic chassis entity. The definition and the
 * driver state outlive a world rebuild; the controller is re-created on the
 * new world's chassis body.
 */
export interface VehicleRecord {
  readonly entityId: EntityId;
  readonly definition: VehicleDefinition;
  /** `component`: built from the entity's `Vehicle` component; `api`: `createVehicle`. */
  readonly source: "component" | "api";
  controller: RapierVehicleController | null;
  input: VehicleInput;
  /** Smoothed steering input (-1..1). */
  steer: number;
  drivetrain: VehicleDrivetrainState | null;
  /** The driving pedal of the latest slice (0..1); see `VehicleDriveResult.engineLoad`. */
  engineLoad: number;
  /** Applied virtual sink per wheel (m), slew-limited toward the provider's depth. */
  sink: number[];
  /** Deepest sink per wheel before the chassis would touch the terrain collider. */
  sinkLimits: number[];
  /** Per-wheel `tractionSlip` read back after the latest slice. */
  tractionSlip: number[];
  wheelSpinSpeed: number[];
  wheelSpinRotation: number[];
  groundResistance?: number[];
  /** Local digging survives without a track field, but never travels with the tyre. */
  soil?: ({ x: number; z: number; depth: number } | null)[];
  telemetry?: { -readonly [K in keyof Omit<VehicleTelemetry, "pitchDeg" | "gravityForwardForce">]: VehicleTelemetry[K] };
}

export interface RapierBodyRecord {
  id: EntityId;
  body: RapierRigidBody;
  /** One or more colliders (compound when the entity has authored primitives). */
  colliders: RapierCollider[];
  isSensor: boolean;
}

/** A dynamic body's simulated pose one fixed step back, the render blend's start. */
export interface PreviousBodyPose {
  position: Vec3;
  rotation: PoseQuat;
}

export interface SuspendedDynamicBody {
  linearVelocity: Vec3;
  angularVelocity: Vec3;
}