import type { Vec3 } from "../../core/index.ts";
import type { CollisionProfile, NavigationRole } from "./collision.ts";

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
  /** Capsule radius before conversion to the bounds used by broad-phase queries. */
  capsuleRadius?: number;
  /** Capsule half-height from center to top/bottom of the hemispheres. */
  capsuleHalfHeight?: number;
  /**
   * Offset of the collider center from the body's transform position, in world
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
  /** Authored response table distinguishes solver blocks from reportable overlaps. */
  profile?: CollisionProfile;
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
  lockPosition?: [boolean, boolean, boolean];
  lockRotation?: [boolean, boolean, boolean];
}
