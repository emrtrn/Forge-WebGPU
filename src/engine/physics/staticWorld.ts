// Ported from Forge WebGL engine/physics/physicsSubsystem.ts (static world) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Forge's PhysicsSubsystem was one 2,817-line file; this repo's budget stops at
// 1,500, so it is split into physicsSubsystem / staticWorld / vehiclePhysics /
// physicsBodies / physicsTypes with method bodies unchanged. The ragdoll is not
// ported (plan K12).
import { StaticSpatialIndex, compareStaticEntries, staticCellOf, staticEntryOverlapsSquare, type StaticSpatialEntry } from "./staticSpatialIndex.ts";
import { HeightfieldStaticSource, forEachHeightfieldTriangle, heightfieldSupportsOnDemand, type HeightfieldCellEntries } from "./heightfieldStatic.ts";
import { classifyStaticTriangle } from "./staticTriangles.ts";
import { bodyNavigationBounds, forEachBodyNavigationObstacle, forEachBodyNavigationTriangle, type NavigationObstacleVisitor, type NavigationRect, type NavigationTriangleVisitor } from "./navigationGeometry.ts";
import { sampleTriangleHeight, type GroundSurfaceSample } from "../movement/slopeSurface.ts";
import { rotatePointAboutOrigin } from "./rotatedBox.ts";
import type { EntityId } from "../legacy/entity.ts";
import type { PhysicsAabb, PhysicsSurfaceTriangle } from "./physicsQuery.ts";
import type { Vec3 } from "../legacy/layout.ts";
import { MAX_NAVIGATION_DIRTY_REGIONS, type PhysicsBody, type Aabb, type StaticBodyRecord } from "./physicsTypes.ts";
import { appendBlockerAabbs, appendSurfaceTriangles } from "./physicsBodies.ts";

/**
 * The static half of the physics world: every static, non-sensor body's
 * blockers and walkable surfaces, their spatial indices and caches, and the
 * navigation views over them. Split out of Forge's PhysicsSubsystem (one class
 * of 2,817 lines); the methods are Forge's, unchanged. Shares the subsystem's
 * `collisionDisabled` set and `bodiesById` map (mutated in place, never
 * replaced) instead of copying them.
 */
export class StaticWorld {
  readonly collisionDisabled: Set<EntityId>;
  readonly bodiesById: Map<EntityId, PhysicsBody>;

  constructor(collisionDisabled: Set<EntityId>, bodiesById: Map<EntityId, PhysicsBody>) {
    this.collisionDisabled = collisionDisabled;
    this.bodiesById = bodiesById;
  }

  readonly staticRecords = new Map<EntityId, StaticBodyRecord>();
  /** Static-geometry changes since the nav consumer last took them (see {@link takeNavigationDirtyRegions}). */
  navigationDirty: NavigationRect[] | "all" = "all";
  readonly staticBlockerIndex = new StaticSpatialIndex<Aabb>();
  readonly staticSurfaceIndex = new StaticSpatialIndex<PhysicsSurfaceTriangle>();
  /** Static records that carry on-demand heightfields, by entity id (a subset of `staticRecords`). */
  readonly heightfieldRecords = new Map<EntityId, StaticBodyRecord>();
  nextStaticOrder = 0;
  staticInvalidations = 0;
  staticRecordBuilds = 0;
  blockerCandidatesInspected = 0;
  /** Cached movement blockers (static colliders don't move); rebuilt lazily. */
  staticBlockerCache: Aabb[] | null = null;
  /** Cached walkable surface triangles (static trimesh); rebuilt lazily. */
  staticSurfaceCache: PhysicsSurfaceTriangle[] | null = null;
  /** Cached AI-navigation blockers, filtered by Collider.navigationRole. */
  staticNavigationBlockerCache: Aabb[] | null = null;
  /** Cached AI-navigation surfaces, filtered by Collider.navigationRole. */
  staticNavigationSurfaceCache: PhysicsSurfaceTriangle[] | null = null;
  /** Identity changes even on terrain-only edits, so baked nav revisions still advance. */
  staticNavigationNonHeightfieldSurfaceCache: PhysicsSurfaceTriangle[] | null = null;

  /**
   * World-space AABBs of every static, non-sensor collider — the movement
   * blockers fed to `resolvePlanarMovement`. A compound collider contributes one
   * AABB per primitive, and a `trimesh` primitive (complexAsSimple) contributes
   * one AABB per triangle, so the player collides with the actual footprint (e.g.
   * walks into an L-shaped wall's concave corner) instead of an enclosing box.
   * Cached because static colliders don't move.
   */
  staticBlockerAabbs(): readonly PhysicsAabb[] {
    if (this.staticBlockerCache) return this.staticBlockerCache;
    const blockers: Aabb[] = [];
    for (const [id, record] of this.staticRecords) {
      if (this.collisionDisabled.has(id)) continue;
      for (const entry of record.blockers) blockers.push(entry.value);
      for (const field of record.fields) for (const blocker of field.allBlockers()) blockers.push(blocker as Aabb);
    }
    this.staticBlockerCache = blockers;
    return blockers;
  }

  /**
   * World-space walkable surface triangles from every static, non-sensor trimesh
   * (`complexAsSimple`) collider, with the body's placement rotation baked into
   * each vertex and the upward normal precomputed. Feeds the ground probe so a
   * ramp is walked at its true incline height. Cached like the blocker AABBs.
   */
  staticSurfaceTriangles(): readonly PhysicsSurfaceTriangle[] {
    if (this.staticSurfaceCache) return this.staticSurfaceCache;
    const surfaces: PhysicsSurfaceTriangle[] = [];
    for (const [id, record] of this.staticRecords) {
      if (this.collisionDisabled.has(id)) continue;
      for (const entry of record.surfaces) surfaces.push(entry.value);
      for (const field of record.fields) for (const surface of field.all().surfaces) surfaces.push(surface);
    }
    this.staticSurfaceCache = surfaces;
    return surfaces;
  }

  /**
   * Static ground candidates at X/Z. Landscapes otherwise make every character
   * probe scan every triangle, which turns sprinting into long frame spikes and
   * can make the movement step skip its ground follow window.
   */
  staticSurfaceTrianglesNear(x: number, z: number): readonly PhysicsSurfaceTriangle[] {
    if (this.heightfieldRecords.size === 0) return this.staticSurfaceIndex.atCell(x, z);
    const at = staticCellOf(x, z);
    const touched: HeightfieldCellEntries[] = [];
    for (const [id, record] of this.heightfieldRecords) {
      if (this.collisionDisabled.has(id)) continue;
      for (const field of record.fields) {
        if (!field.touchesCell(at.x, at.z)) continue;
        const cell = field.cellEntries(at.x, at.z);
        if (cell.surfaces.length > 0) touched.push(cell);
      }
    }
    const { cell, overflow } = this.staticSurfaceIndex.atCellEntries(x, z);
    // Inside one tile with nothing else nearby (the common case): already in order.
    if (touched.length === 1 && cell.length === 0 && overflow.length === 0) return touched[0]!.surfaceValues;
    let merged = cell;
    for (const extra of touched) merged = merged.concat(extra.surfaces);
    if (touched.length > 0) merged.sort(compareStaticEntries);
    return merged.concat(overflow).map((entry) => entry.value);
  }

  /** All blockers intersecting the inclusive X/Z square, in body/primitive order. */
  staticBlockerAabbsNear(x: number, z: number, radius: number): readonly PhysicsAabb[] {
    if (this.heightfieldRecords.size === 0) {
      const blockers = this.staticBlockerIndex.near(x, z, radius);
      this.blockerCandidatesInspected += this.staticBlockerIndex.lastCandidateCount;
      return blockers;
    }
    const entries: StaticSpatialEntry<Aabb>[] = this.staticBlockerIndex.nearEntries(x, z, radius);
    this.blockerCandidatesInspected += this.staticBlockerIndex.lastCandidateCount;
    const r = Math.max(0, radius);
    const from = staticCellOf(x - r, z - r);
    const to = staticCellOf(x + r, z + r);
    const multiCell = from.x !== to.x || from.z !== to.z;
    let added = false;
    for (const [id, record] of this.heightfieldRecords) {
      if (this.collisionDisabled.has(id)) continue;
      for (const field of record.fields) {
        if (!field.overlapsSquare(x, z, r)) continue;
        // A triangle filed under several cells is one item: keep it once.
        let seen: Set<number> | null = null;
        for (let cz = from.z; cz <= to.z; cz += 1) {
          for (let cx = from.x; cx <= to.x; cx += 1) {
            if (!field.touchesCell(cx, cz)) continue;
            const blockers = field.cellEntries(cx, cz).blockers;
            for (const entry of blockers) {
              if (multiCell) {
                seen ??= new Set();
                if (seen.has(entry.itemOrder)) continue;
                seen.add(entry.itemOrder);
              }
              this.blockerCandidatesInspected += 1;
              if (!staticEntryOverlapsSquare(entry, x, z, radius)) continue;
              entries.push(entry as StaticSpatialEntry<Aabb>);
              added = true;
            }
          }
        }
      }
    }
    if (added) entries.sort(compareStaticEntries);
    return entries.map((entry) => entry.value);
  }

  /** Global availability without materializing flat arrays (preserves void/fallback-floor semantics). */
  hasStaticGround(): boolean {
    if (this.staticBlockerIndex.size > 0 || this.staticSurfaceIndex.size > 0) return true;
    for (const id of this.heightfieldRecords.keys()) if (!this.collisionDisabled.has(id)) return true;
    return false;
  }

  /** Cumulative work counters for deterministic streaming and movement performance checks. */
  staticQueryDebug(): { invalidations: number; recordBuilds: number; blockerCandidatesInspected: number } {
    return {
      invalidations: this.staticInvalidations,
      recordBuilds: this.staticRecordBuilds,
      blockerCandidatesInspected: this.blockerCandidatesInspected,
    };
  }

  invalidateStaticCaches(): void {
    this.staticInvalidations += 1;
    this.staticBlockerCache = null;
    this.staticSurfaceCache = null;
    this.staticNavigationBlockerCache = null;
    this.staticNavigationSurfaceCache = null;
    this.staticNavigationNonHeightfieldSurfaceCache = null;
  }

  recordStaticBody(body: PhysicsBody, previousOrder?: number): void {
    if (!body.collider.isStatic || body.collider.isSensor) return;
    const order = previousOrder ?? this.nextStaticOrder++;
    const blockers: Aabb[] = [];
    const surfaces: PhysicsSurfaceTriangle[] = [];
    appendBlockerAabbs(blockers, body);
    appendSurfaceTriangles(surfaces, body);
    // Heightfields come after the body's other items; most answer on demand.
    const fields: HeightfieldStaticSource[] = [];
    const origin = body.transform.position as Vec3;
    const rotation = body.transform.rotation as Vec3;
    for (const primitive of body.collider.primitives ?? []) {
      const field = primitive.shape === "heightfield" ? primitive.heightfield : undefined;
      if (!field) continue;
      if (heightfieldSupportsOnDemand(field, rotation)) {
        fields.push(new HeightfieldStaticSource(origin, field, body.collider.navigationRole, order,
          { blockers: blockers.length, surfaces: surfaces.length }));
        continue;
      }
      forEachHeightfieldTriangle(field, 0, field.quadsX - 1, 0, field.quadsZ - 1, (a, b, c) => {
        const classified = classifyStaticTriangle(
          rotatePointAboutOrigin(origin, a, rotation),
          rotatePointAboutOrigin(origin, b, rotation),
          rotatePointAboutOrigin(origin, c, rotation),
          body.collider.navigationRole,
        );
        if ("surface" in classified) surfaces.push(classified.surface);
        else blockers.push(classified.blocker as Aabb);
      });
    }
    const record: StaticBodyRecord = {
      order,
      fields,
      navigationRole: body.collider.navigationRole,
      blockers: blockers.map((value, itemOrder) => ({
        value, bodyOrder: order, itemOrder,
        minX: value.min[0], maxX: value.max[0], minZ: value.min[2], maxZ: value.max[2],
      })),
      surfaces: surfaces.map((value, itemOrder) => ({
        value, bodyOrder: order, itemOrder,
        minX: Math.min(value.a[0], value.b[0], value.c[0]),
        maxX: Math.max(value.a[0], value.b[0], value.c[0]),
        minZ: Math.min(value.a[2], value.b[2], value.c[2]),
        maxZ: Math.max(value.a[2], value.b[2], value.c[2]),
      })),
    };
    this.staticRecords.set(body.id, record);
    if (fields.length > 0) this.heightfieldRecords.set(body.id, record);
    else this.heightfieldRecords.delete(body.id);
    this.staticRecordBuilds += 1;
    if (!this.collisionDisabled.has(body.id)) this.indexStaticRecord(record, true);
  }

  indexStaticRecord(record: StaticBodyRecord, enabled: boolean): void {
    for (const entry of record.blockers) {
      if (enabled) this.staticBlockerIndex.add(entry);
      else this.staticBlockerIndex.remove(entry);
    }
    for (const entry of record.surfaces) {
      if (enabled) this.staticSurfaceIndex.add(entry);
      else this.staticSurfaceIndex.remove(entry);
    }
  }

  dropStaticRecord(entityId: EntityId): void {
    const record = this.staticRecords.get(entityId);
    if (!record) return;
    this.indexStaticRecord(record, false);
    this.staticRecords.delete(entityId);
    this.heightfieldRecords.delete(entityId);
  }

  /**
   * AI-navigation blockers: `ignored` bodies are omitted, but still collide in
   * physics. Every other body is emitted with its `navigationRole` carried on each
   * AABB. Ground seeding (`findGroundLayersAt` via the host floor sampler) needs
   * `walkable` bodies IN the list — a solid floor/platform box has no trimesh
   * surface triangles, so its walkable top is only discoverable as a blocker top —
   * and reads the role to tell a floor from an obstacle.
   */
  staticNavigationBlockerAabbs(): readonly PhysicsAabb[] {
    if (this.staticNavigationBlockerCache) return this.staticNavigationBlockerCache;
    const blockers: Aabb[] = [];
    for (const [id, record] of this.staticRecords) {
      if (record.navigationRole === "ignored" || this.collisionDisabled.has(id)) continue;
      for (const entry of record.blockers) blockers.push(entry.value);
      for (const field of record.fields) for (const blocker of field.allBlockers()) blockers.push(blocker as Aabb);
    }
    this.staticNavigationBlockerCache = blockers;
    return blockers;
  }

  /** AI-nav surfaces; omit on-demand heightfields when using point samples. */
  staticNavigationSurfaceTriangles(includeHeightfields = true): readonly PhysicsSurfaceTriangle[] {
    const cached = includeHeightfields ? this.staticNavigationSurfaceCache : this.staticNavigationNonHeightfieldSurfaceCache;
    if (cached) return cached;
    const surfaces: PhysicsSurfaceTriangle[] = [];
    for (const [id, record] of this.staticRecords) {
      if (record.navigationRole === "ignored" || record.navigationRole === "obstacleOnly" ||
        this.collisionDisabled.has(id)) continue;
      for (const entry of record.surfaces) surfaces.push(entry.value);
      if (includeHeightfields) {
        for (const field of record.fields) for (const surface of field.all().surfaces) surfaces.push(surface);
      }
    }
    if (includeHeightfields) this.staticNavigationSurfaceCache = surfaces;
    else this.staticNavigationNonHeightfieldSurfaceCache = surfaces;
    return surfaces;
  }

  /**
   * Recast input for one nav tile: the collider triangles of every enabled
   * static body overlapping the X/Z rectangle (`navigationGeometry.ts`).
   * `ignored` bodies are left out, as in the other navigation lists.
   */
  forEachNavigationTriangleInRect(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    visit: NavigationTriangleVisitor,
  ): void {
    const rect = { minX, minZ, maxX, maxZ };
    for (const [id, record] of this.staticRecords) {
      if (record.navigationRole === "ignored" || this.collisionDisabled.has(id)) continue;
      const body = this.bodiesById.get(id);
      if (body) forEachBodyNavigationTriangle(body.transform, body.collider, rect, visit);
    }
  }

  /**
   * X/Z regions whose static navigation geometry changed since the last call
   * (bodies added, removed, moved or collision-toggled — old and new bounds),
   * or "all" after a full rebuild. Taking them clears the log; there is one
   * consumer, the AI capability's nav mesh.
   */
  takeNavigationDirtyRegions(): readonly NavigationRect[] | "all" {
    const dirty = this.navigationDirty;
    this.navigationDirty = [];
    return dirty;
  }

  markNavigationDirty(body: PhysicsBody): void {
    if (!body.collider.isStatic || body.collider.isSensor || this.navigationDirty === "all") return;
    if (this.navigationDirty.length >= MAX_NAVIGATION_DIRTY_REGIONS) {
      this.navigationDirty = "all";
      return;
    }
    this.navigationDirty.push(bodyNavigationBounds(body.transform, body.collider));
  }

  /** Null-area volumes of enabled `obstacleOnly` static bodies overlapping the X/Z rectangle. */
  forEachNavigationObstacleInRect(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    visit: NavigationObstacleVisitor,
  ): void {
    const rect = { minX, minZ, maxX, maxZ };
    for (const [id, record] of this.staticRecords) {
      if (record.navigationRole !== "obstacleOnly" || this.collisionDisabled.has(id)) continue;
      const body = this.bodiesById.get(id);
      if (body) forEachBodyNavigationObstacle(body.transform, body.collider, rect, visit);
    }
  }

  /** Point samples in the full surface list's order, without expanding heightfields. */
  staticNavigationSurfaceSamplesAt(x: number, z: number): readonly GroundSurfaceSample[] {
    const samples: GroundSurfaceSample[] = [];
    for (const [id, record] of this.staticRecords) {
      if (record.navigationRole === "ignored" || record.navigationRole === "obstacleOnly" ||
        this.collisionDisabled.has(id)) continue;
      for (const { value } of record.surfaces) {
        const floorY = sampleTriangleHeight(value, x, z);
        if (floorY !== null) samples.push({ floorY, normalY: value.normalY });
      }
      for (const field of record.fields) samples.push(...field.surfaceSamplesAt(x, z));
    }
    return samples;
  }
}
