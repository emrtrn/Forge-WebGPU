// Ported from Forge WebGL engine/scene/components.ts (collider, transform, vehicle, character movement, behavior, interaction, script actor readers) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b, user decision 2026-11-11): Forge WebGL's old entity and
// component model, only the part ported subsystems read. Faz 6 replaces it with
// schema components (each subsystem binds to the world with its feature) and
// deletes src/engine/legacy. Kept inside src/engine (engine-legacy-stays-in-engine).
import type { Entity, SceneJsonValue } from "./entity.ts";
import type { LayoutPhysicsAxisLocks, Vec3 } from "./layout.ts";
import { isNavigationRole, type NavigationRole } from "../physics/collision.ts";
import { resolveCapsuleDimensions } from "./capsule.ts";

export const TRANSFORM_COMPONENT = "Transform";
export const COLLIDER_COMPONENT = "Collider";
/** Ray-cast wheeled vehicle on a dynamic chassis (`engine/physics/vehicle`). */
export const VEHICLE_COMPONENT = "Vehicle";
export type ColliderShape =
  | "box"
  | "sphere"
  | "capsule"
  | "cylinder"
  | "cone"
  | "convex"
  | "trimesh"
  | "heightfield";

export interface TransformComponent {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

/**
 * A regular height grid for `shape === "heightfield"` (World Terrain tiles,
 * OPEN_WORLD_PLAN Faz 3). Centred on the body origin in X/Z: sample (x, z) sits
 * at body-local `[x · spacing − quadsX · spacing / 2, height, z · spacing − quadsZ · spacing / 2]`,
 * and each quad splits into triangles (x,z)(x,z+1)(x+1,z) and (x+1,z)(x,z+1)(x+1,z+1),
 * the same order and diagonal as the terrain trimesh it replaces. The array is
 * shared, never copied: heights must not change while the body exists.
 */
export interface ColliderHeightfield {
  quadsX: number;
  quadsZ: number;
  spacing: number;
  /** `(quadsX + 1) · (quadsZ + 1)` body-local heights, row-major: `index = z · (quadsX + 1) + x`. */
  heights: Float32Array;
}

/**
 * One simple-collision shape of a (possibly compound) collider. Sizes/centers
 * are world-scaled (placement scale baked in), like {@link ColliderComponent};
 * `rotation` is a local Euler rotation in degrees for oriented shapes.
 */
export interface ColliderPrimitive {
  shape: ColliderShape;
  size: Vec3;
  center?: Vec3;
  rotation?: Vec3;
  /** Baked convex hull points (world-scaled, relative to body origin) for `shape === "convex"`. */
  points?: Vec3[];
  /** Baked triangle vertices (world-scaled, relative to body origin) for `shape === "trimesh"`. */
  vertices?: Vec3[];
  /** Triangle index buffer into `vertices`, grouped by threes, for `shape === "trimesh"`. */
  indices?: number[];
  /** Height grid for `shape === "heightfield"`; `size`/`center` describe its AABB, as for a trimesh. */
  heightfield?: ColliderHeightfield;
}

export interface ColliderComponent {
  shape: ColliderShape;
  /** World-axis-aligned full size (placement scale already baked in). */
  size: Vec3;
  /** Capsule radius before conversion to the legacy size AABB. */
  capsuleRadius?: number;
  /** Capsule half-height from center to top/bottom of the hemispheres. */
  capsuleHalfHeight?: number;
  /**
   * Offset of the collider center from the entity's transform position, in world
   * space (placement scale baked in). Absent means centered on the position.
   */
  center?: Vec3;
  /**
   * Authored compound collision shapes (Static Mesh editor). When present, the
   * physics backend builds one collider per primitive; `shape`/`size`/`center`
   * above describe the encompassing AABB used by the broad-phase / movement.
   */
  primitives?: ColliderPrimitive[];
  isStatic: boolean;
  isSensor: boolean;
  /**
   * Hides the runtime collider debug wireframe in Game/Play mode. The collider
   * still collides — this only suppresses the diagnostic overlay the runtime
   * draws around the actual (scale-baked) physics collider. Absent/false means
   * the wireframe is visible so scaling can be observed.
   */
  hideInGame?: boolean;
  /** Surface friction (Rapier). Absent uses the backend default. */
  friction?: number;
  /** Authored surface profile id, retained for ray-cast vehicle response. */
  physicalMaterialId?: string;
  /** Surface restitution / bounciness (Rapier). Absent uses the backend default. */
  restitution?: number;
  /** AI navigation interpretation; affects nav generation only, not physics collision. */
  navigationRole?: NavigationRole;
  /** Emit begin/end overlap events for sensors. Absent means true. */
  generateOverlapEvents?: boolean;
  /** Emit hit events while simulating physics. Absent means true. */
  simulationGeneratesHitEvents?: boolean;
  /** Packed Rapier interaction groups (membership<<16 | filter). Absent = interact with all. */
  collisionGroups?: number;
  /**
   * The profile ignores the `camera` trace channel: a spring-arm camera passes
   * through this collider instead of being pulled in by it. Derived from the
   * collision preset/responses, like {@link collisionGroups}.
   */
  ignoreCameraTrace?: boolean;
  simulatePhysics?: boolean;
  massKg?: number;
  linearDamping?: number;
  angularDamping?: number;
  enableGravity?: boolean;
  lockPosition?: LayoutPhysicsAxisLocks;
  lockRotation?: LayoutPhysicsAxisLocks;
}

function readVec3(value: SceneJsonValue | undefined): Vec3 | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const [x, y, z] = value;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return undefined;
  return [x, y, z];
}

function readPhysicsAxisLocks(
  value: SceneJsonValue | undefined,
): LayoutPhysicsAxisLocks | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const [x, y, z] = value;
  if (typeof x !== "boolean" || typeof y !== "boolean" || typeof z !== "boolean") {
    return undefined;
  }
  return [x, y, z];
}

/** Reads a typed transform from an entity's serializable component data. */
export function readTransformComponent(entity: Entity): TransformComponent | undefined {
  const data = entity.components[TRANSFORM_COMPONENT];
  if (!data) return undefined;
  const position = readVec3(data.position);
  const rotation = readVec3(data.rotation);
  const scale = readVec3(data.scale);
  if (!position || !rotation || !scale) return undefined;
  return { position, rotation, scale };
}

const COLLIDER_SHAPES: readonly ColliderShape[] = [
  "box",
  "sphere",
  "capsule",
  "cylinder",
  "cone",
  "convex",
  "trimesh",
  "heightfield",
];

/** A heightfield whose sample count matches its grid, or undefined. Keeps the array by reference. */
function readColliderHeightfield(value: unknown): ColliderHeightfield | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { quadsX, quadsZ, spacing, heights } = value as Record<string, unknown>;
  if (typeof quadsX !== "number" || typeof quadsZ !== "number" || typeof spacing !== "number" ||
    !Number.isInteger(quadsX) || !Number.isInteger(quadsZ) || quadsX < 1 || quadsZ < 1 || !(spacing > 0) ||
    !(heights instanceof Float32Array) || heights.length !== (quadsX + 1) * (quadsZ + 1)) {
    return undefined;
  }
  return { quadsX, quadsZ, spacing, heights };
}

/** Parses the optional compound-collider `primitives` array. */
function readColliderPrimitives(
  value: SceneJsonValue | undefined,
): ColliderPrimitive[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const primitives: ColliderPrimitive[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, SceneJsonValue>;
    if (
      typeof record.shape !== "string" ||
      !COLLIDER_SHAPES.includes(record.shape as ColliderShape)
    ) {
      continue;
    }
    const size = readVec3(record.size);
    if (!size) continue;
    const primitive: ColliderPrimitive = { shape: record.shape as ColliderShape, size };
    if (primitive.shape === "heightfield") {
      // Built in code (never authored JSON), so the grid is a typed array.
      const heightfield = readColliderHeightfield(record.heightfield as unknown);
      if (!heightfield) continue;
      primitive.heightfield = heightfield;
    }
    const center = readVec3(record.center);
    if (center) primitive.center = center;
    const rotation = readVec3(record.rotation);
    if (rotation) primitive.rotation = rotation;
    if (Array.isArray(record.points)) {
      const points = record.points
        .map((point) => readVec3(point))
        .filter((point): point is Vec3 => point !== undefined);
      if (points.length > 0) primitive.points = points;
    }
    if (Array.isArray(record.vertices)) {
      const vertices = record.vertices
        .map((point) => readVec3(point))
        .filter((point): point is Vec3 => point !== undefined);
      if (vertices.length > 0) primitive.vertices = vertices;
    }
    if (Array.isArray(record.indices)) {
      const indices = record.indices.filter(
        (index): index is number =>
          typeof index === "number" && Number.isInteger(index) && index >= 0,
      );
      if (indices.length > 0) primitive.indices = indices;
    }
    primitives.push(primitive);
  }
  return primitives.length > 0 ? primitives : undefined;
}

/** Reads a typed collider from an entity's serializable component data. */
export function readColliderComponent(entity: Entity): ColliderComponent | undefined {
  const data = entity.components[COLLIDER_COMPONENT];
  if (!data) return undefined;
  if (typeof data.shape !== "string" || !COLLIDER_SHAPES.includes(data.shape as ColliderShape)) {
    return undefined;
  }
  const shape = data.shape as ColliderShape;
  const authoredSize = readVec3(data.size);
  const capsuleRadius =
    shape === "capsule" ? readFiniteNumber(data.capsuleRadius, NaN, 0) : NaN;
  const capsuleHalfHeight =
    shape === "capsule" ? readFiniteNumber(data.capsuleHalfHeight, NaN, 0) : NaN;
  const capsule =
    shape === "capsule" && Number.isFinite(capsuleRadius) && Number.isFinite(capsuleHalfHeight)
      ? resolveCapsuleDimensions(capsuleRadius, capsuleHalfHeight)
      : null;
  const size = capsule?.size ?? authoredSize;
  if (!size) return undefined;
  if (typeof data.isStatic !== "boolean" || typeof data.isSensor !== "boolean") return undefined;
  const center = readVec3(data.center) ?? capsule?.center;
  const component: ColliderComponent = {
    shape,
    size,
    isStatic: data.isStatic,
    isSensor: data.isSensor,
  };
  if (capsule) {
    component.capsuleRadius = capsule.radius;
    component.capsuleHalfHeight = capsule.halfHeight;
  }
  if (center) component.center = center;
  if (typeof data.hideInGame === "boolean") component.hideInGame = data.hideInGame;
  const primitives = readColliderPrimitives(data.primitives);
  if (primitives) component.primitives = primitives;
  if (typeof data.friction === "number") component.friction = data.friction;
  if (typeof data.physicalMaterialId === "string") component.physicalMaterialId = data.physicalMaterialId;
  if (typeof data.restitution === "number") component.restitution = data.restitution;
  if (isNavigationRole(data.navigationRole)) component.navigationRole = data.navigationRole;
  if (typeof data.generateOverlapEvents === "boolean") {
    component.generateOverlapEvents = data.generateOverlapEvents;
  }
  if (typeof data.simulationGeneratesHitEvents === "boolean") {
    component.simulationGeneratesHitEvents = data.simulationGeneratesHitEvents;
  }
  if (typeof data.collisionGroups === "number") component.collisionGroups = data.collisionGroups;
  if (data.ignoreCameraTrace === true) component.ignoreCameraTrace = true;
  if (typeof data.simulatePhysics === "boolean") component.simulatePhysics = data.simulatePhysics;
  if (typeof data.massKg === "number") component.massKg = data.massKg;
  if (typeof data.linearDamping === "number") component.linearDamping = data.linearDamping;
  if (typeof data.angularDamping === "number") component.angularDamping = data.angularDamping;
  if (typeof data.enableGravity === "boolean") component.enableGravity = data.enableGravity;
  const lockPosition = readPhysicsAxisLocks(data.lockPosition);
  if (lockPosition) component.lockPosition = lockPosition;
  const lockRotation = readPhysicsAxisLocks(data.lockRotation);
  if (lockRotation) component.lockRotation = lockRotation;
  return component;
}

function readFiniteNumber(
  value: SceneJsonValue | undefined,
  fallback: number,
  minExclusive?: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (minExclusive !== undefined && value <= minExclusive) return fallback;
  return value;
}

export const CHARACTER_MOVEMENT_COMPONENT = "CharacterMovement";

export type CharacterMovementMode = "walking" | "falling" | "flying" | "swimming" | "custom";

export interface CharacterMovementComponent {
  maxWalkSpeed: number;
  sprintMultiplier: number;
  jumpSpeed: number;
  gravityScale: number;
  airControl: number;
  acceleration: number;
  brakingDeceleration: number;
  groundFriction: number;
  rotationRate: Vec3;
  orientRotationToMovement: boolean;
  orientRotationToControl: boolean;
  movementMode: CharacterMovementMode;
  capsuleRadius: number;
  capsuleHalfHeight: number;
  maxStepHeight: number;
  /**
   * Largest drop (units) the grounded feet follow down without going airborne, so
   * walking down stair-sized ledges stays grounded (no fall animation). A drop
   * beyond this enters falling.
   */
  maxStepDown: number;
  /** Steepest ramp (degrees) the character can walk up; steeper surfaces are not walkable ground. */
  maxSlopeAngleDeg: number;
  /**
   * Planar speed multiplier while climbing at/above a 45° incline (slope ratio 1);
   * shallower climbs blend toward 1, so stairs and ramps read as effort. 1 = no
   * uphill slowdown.
   */
  uphillSpeedScale: number;
  /**
   * Vertical speed (units/s) the grounded feet ease toward a new floor height, so
   * a step is climbed/descended over a few frames instead of snapping in one
   * (which pops the camera). 0 = instant snap. Ramps are unaffected (their
   * per-frame rise is below the per-frame ease budget).
   */
  stepSmoothSpeed: number;
}

const CHARACTER_MOVEMENT_MODES: readonly CharacterMovementMode[] = [
  "walking",
  "falling",
  "flying",
  "swimming",
  "custom",
];


export function readCharacterMovementComponent(
  entity: Entity,
): CharacterMovementComponent | undefined {
  const data = entity.components[CHARACTER_MOVEMENT_COMPONENT];
  if (!data) return undefined;
  const mode =
    typeof data.movementMode === "string" &&
    CHARACTER_MOVEMENT_MODES.includes(data.movementMode as CharacterMovementMode)
      ? (data.movementMode as CharacterMovementMode)
      : "walking";
  return {
    maxWalkSpeed: readFiniteNumber(data.maxWalkSpeed, 3, 0),
    sprintMultiplier: readFiniteNumber(data.sprintMultiplier, 2, 0),
    jumpSpeed: readFiniteNumber(data.jumpSpeed, 4, 0),
    gravityScale: readFiniteNumber(data.gravityScale, 1),
    airControl: readFiniteNumber(data.airControl, 0.25),
    acceleration: readFiniteNumber(data.acceleration, 30, 0),
    brakingDeceleration: readFiniteNumber(data.brakingDeceleration, 24, 0),
    groundFriction: readFiniteNumber(data.groundFriction, 8, 0),
    rotationRate: readVec3(data.rotationRate) ?? [0, 0, 500],
    orientRotationToMovement: data.orientRotationToMovement !== false,
    orientRotationToControl: data.orientRotationToControl === true,
    movementMode: mode,
    capsuleRadius: readFiniteNumber(data.capsuleRadius, 0.3, 0),
    capsuleHalfHeight: readFiniteNumber(data.capsuleHalfHeight, 0.9, 0),
    maxStepHeight: readFiniteNumber(data.maxStepHeight, 0.45, 0),
    maxStepDown: readFiniteNumber(data.maxStepDown, 0.5, 0),
    maxSlopeAngleDeg: readFiniteNumber(data.maxSlopeAngleDeg, 45, 0),
    uphillSpeedScale: readFiniteNumber(data.uphillSpeedScale, 0.65, 0),
    stepSmoothSpeed: readFiniteNumber(data.stepSmoothSpeed, 6, 0),
  };
}

export const BEHAVIOR_COMPONENT = "Behavior";
export const INTERACTION_COMPONENT = "Interaction";
export const SCRIPT_ACTOR_COMPONENT = "ScriptActor";

/**
 * Attaches a runtime script to an entity: a registered behavior `scriptId` plus
 * opaque JSON `params`. The behavior registry (a runtime concern) resolves the
 * id to an update function; the engine layer only stores the reference.
 */
export interface BehaviorComponent {
  scriptId: string;
  params?: Record<string, SceneJsonValue>;
}

export interface ScriptActorComponent {
  classRef: string;
  nodeId?: string;
  // K12: `variables` (Actor Script variables) are cut.
}

/**
 * Marks an entity as interactable: an `action` id the runtime interprets, an
 * optional player-facing `prompt`, a default `enabled` flag, an optional
 * `requires` gate (e.g. an inventory/key id) and an optional `cooldown` in
 * seconds. Project gameplay rules (runtime) interpret these; the engine only
 * stores the authored data, like Behavior/Metadata. Typically paired with a
 * (sensor) {@link ColliderComponent} so an InteractionSystem can detect overlap.
 */
export interface InteractionComponent {
  action: string;
  prompt?: string;
  enabled?: boolean;
  requires?: string;
  cooldown?: number;
}

/** Reads a typed behavior reference from an entity's serializable component data. */
export function readBehaviorComponent(entity: Entity): BehaviorComponent | undefined {
  const data = entity.components[BEHAVIOR_COMPONENT];
  if (!data) return undefined;
  if (typeof data.scriptId !== "string" || data.scriptId.length === 0) return undefined;
  const component: BehaviorComponent = { scriptId: data.scriptId };
  const params = data.params;
  if (typeof params === "object" && params !== null && !Array.isArray(params)) {
    component.params = { ...(params as Record<string, SceneJsonValue>) };
  }
  return component;
}

/** Reads placed Actor Script instance metadata used by world queries. */
export function readScriptActorComponent(entity: Entity): ScriptActorComponent | undefined {
  const data = entity.components[SCRIPT_ACTOR_COMPONENT];
  if (!data || typeof data.classRef !== "string" || data.classRef.length === 0) return undefined;
  const component: ScriptActorComponent = { classRef: data.classRef };
  if (typeof data.nodeId === "string" && data.nodeId.length > 0) component.nodeId = data.nodeId;
  return component;
}

/** Reads a typed interaction marker from an entity's serializable component data. */
export function readInteractionComponent(entity: Entity): InteractionComponent | undefined {
  const data = entity.components[INTERACTION_COMPONENT];
  if (!data) return undefined;
  if (typeof data.action !== "string" || data.action.length === 0) return undefined;
  const component: InteractionComponent = { action: data.action };
  if (typeof data.prompt === "string") component.prompt = data.prompt;
  if (typeof data.enabled === "boolean") component.enabled = data.enabled;
  if (typeof data.requires === "string") component.requires = data.requires;
  if (typeof data.cooldown === "number") component.cooldown = data.cooldown;
  return component;
}
