// Ported from Forge WebGL engine/behavior/behaviorSubsystem.ts (the physics query types) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Physics owns its query contract; Forge declared it beside the behavior host.
import type { EntityId } from "../legacy/entity.ts";
import type { NavigationRole } from "./collision.ts";
import type { PhysicsImpact } from "./impactEvents.ts";

export interface PhysicsContact {
  readonly a: EntityId;
  readonly b: EntityId;
  readonly isSensor: boolean;
}

/** A world-space axis-aligned bounding box. */
export interface PhysicsAabb {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** AI navigation interpretation; absent behaves like `auto`. */
  readonly navigationRole?: NavigationRole;
  /**
   * Oriented convex XZ ground silhouette of a rotated box collider (the exact
   * footprint the `min`/`max` AABB otherwise bloats to enclose). Present only
   * when the collider is rotated off-axis; consumers that only need the AABB
   * (perception, ground probe) ignore it, while the AI debug overlay draws it
   * so a diagonal wall no longer reads as a fat axis-aligned area.
   */
  readonly footprint?: readonly (readonly [number, number])[];
}

/**
 * A world-space walkable surface triangle (from a static trimesh collider), with
 * its upward normal component precomputed. Fed to the ground probe so a ramp is
 * walked at its true incline height instead of a flat AABB top.
 */
export interface PhysicsSurfaceTriangle {
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
  readonly c: readonly [number, number, number];
  /** Signed normal.y after normalization: +1 = up-facing floor, 0 = vertical, -1 = down-facing. */
  readonly normalY: number;
}

export interface PhysicsQuery {
  contactsForEntity(entityId: EntityId): readonly PhysicsContact[];
  /** The latest frame's impacts involving the entity (opt-in sources only). */
  impactsForEntity?(entityId: EntityId): readonly PhysicsImpact[];
  /** World-space AABBs of every static, non-sensor collider (movement blockers). */
  staticBlockerAabbs(): readonly PhysicsAabb[];
  /** Inclusive X/Z square candidates; hosts without the index use the full list. */
  staticBlockerAabbsNear?(x: number, z: number, radius: number): readonly PhysicsAabb[];
  /** Whether any static ground/blocker exists globally, without building flat arrays. */
  hasStaticGround?(): boolean;
  /** World-space walkable surface triangles (static trimesh) for the ground probe. */
  staticSurfaceTriangles(): readonly PhysicsSurfaceTriangle[];
  /**
   * Candidate static surface triangles near a world X/Z point. Implementations may
   * use a spatial index; callers must fall back to `staticSurfaceTriangles()` when
   * this optional fast path is unavailable.
   */
  staticSurfaceTrianglesNear?(x: number, z: number): readonly PhysicsSurfaceTriangle[];
  /** AI-nav blockers, after navigation-role filtering. */
  staticNavigationBlockerAabbs?(): readonly PhysicsAabb[];
  /** AI-nav surfaces, after navigation-role filtering. */
  staticNavigationSurfaceTriangles?(): readonly PhysicsSurfaceTriangle[];
  /** Half-extents (size*scale/2) of an entity's collider, or null if it has none. */
  colliderHalfExtents(entityId: EntityId): readonly [number, number, number] | null;
}
