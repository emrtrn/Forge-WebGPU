// Generated zones written to a level (plan 5c R9b Z4): what `forge zones`
// and the editor's Generate Zones change, as one edit.
//
// - Occluders: the level's large opaque statics as world boxes. Shapes are
//   cubes of 0.5 m at scale 1; static meshes their model's bounds (the caller
//   reads them). A static takes part when its longest world edge reaches
//   `OCCLUDER_MIN_EDGE`: walls, floors, ceilings and lintels do, furniture
//   does not (furniture inside a room would split it at eye height).
// - Zones and portals marked `generated` are replaced; the others are the
//   user's and stay. A generated room whose centre lies in a kept zone is
//   left to it, and a door of that room joins the kept zone instead.
// - New actors get stable GUIDs from the level id and their order, so a
//   second run over the same level writes the same bytes. They are always
//   loaded (not cell-streamed): a zone must be there for what it hides.

import type { ActorId, ComponentMap, Vec3 } from "../../core/index.ts";
import { stableHex } from "../forgeImport/ids.ts";
import { decomposeMat4, multiplyMat4, rotate, invertQuat, sub, type Mat4 } from "../math/affine.ts";
import { generateZones, zoneOccluderBounds, type ZoneGenerationOptions, type ZoneOccluder, type ZoneOccluderBounds } from "./zoneGeneration.ts";
import type { ZoneQuat, ZoneVec3 } from "./zones.ts";

export const ZONE_TYPE = "forge.zone";
export const PORTAL_TYPE = "forge.portal";
/** Longest world edge from which a static is an occluder for generation (m). */
export const OCCLUDER_MIN_EDGE = 1.5;
/** A shape's edge at scale 1 (`forge.shape`). */
const SHAPE_EDGE = 0.5;

export interface ZoneLevelActor {
  readonly id: ActorId;
  readonly name: string;
  /** Its effective components (a class actor's merged with its overrides). */
  readonly components: ComponentMap;
  /** World matrix of the actor. */
  readonly world: Mat4;
}

/** Model bounds in model space; null when unknown (the static is skipped). */
export type ModelBounds = (model: string) => { readonly min: Vec3; readonly max: Vec3 } | null;

const typeName = (type: string): string => type.split("@")[0]!;

const localMatrix = (local: { p: Vec3; r: readonly [number, number, number, number]; s: Vec3 } | undefined): Mat4 => {
  const p = local?.p ?? [0, 0, 0], r = local?.r ?? [0, 0, 0, 1], s = local?.s ?? [1, 1, 1];
  const [x, y, z, w] = r;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    p[0], p[1], p[2], 1,
  ];
};

/** A box of `min`..`max` in a component's space, placed by `matrix`, as a world occluder (no shear assumed). */
function boxOccluder(matrix: Mat4, min: Vec3, max: Vec3): ZoneOccluder {
  const { p, r, s } = decomposeMat4(matrix);
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const offset = rotate(r, [centre[0] * s[0], centre[1] * s[1], centre[2] * s[2]]);
  return {
    center: [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]],
    rotation: r,
    halfExtents: [Math.abs((max[0] - min[0]) * s[0]) / 2, Math.abs((max[1] - min[1]) * s[1]) / 2, Math.abs((max[2] - min[2]) * s[2]) / 2],
  };
}

/** The level's statics that take part in generation (cubes and static meshes with known bounds, long enough). */
export function zoneOccluders(actors: readonly ZoneLevelActor[], modelBounds: ModelBounds): ZoneOccluder[] {
  const occluders: ZoneOccluder[] = [];
  for (const actor of actors) {
    for (const component of Object.values(actor.components)) {
      const data = component as unknown as { type: string; local?: Parameters<typeof localMatrix>[0]; primitive?: string; mesh?: string | null };
      const name = typeName(data.type);
      let box: { min: Vec3; max: Vec3 } | null = null;
      if (name === "forge.shape" && data.primitive === "cube") box = { min: [-SHAPE_EDGE / 2, -SHAPE_EDGE / 2, -SHAPE_EDGE / 2], max: [SHAPE_EDGE / 2, SHAPE_EDGE / 2, SHAPE_EDGE / 2] };
      else if (name === "forge.staticMesh" && data.mesh) box = modelBounds(data.mesh);
      if (!box) continue;
      const occluder = boxOccluder(multiplyMat4(actor.world, localMatrix(data.local)), box.min, box.max);
      if (Math.max(...occluder.halfExtents) * 2 >= OCCLUDER_MIN_EDGE) occluders.push(occluder);
    }
  }
  return occluders;
}

/** The walkable floor: the highest top among flat occluders at the foot of the tall ones; else their foot. */
export function zoneFloorY(occluders: readonly ZoneOccluder[]): number | null {
  const spans = occluders.map((occluder) => {
    const [hx, hy, hz] = occluder.halfExtents;
    const extent = [rotate(occluder.rotation, [hx, 0, 0]), rotate(occluder.rotation, [0, hy, 0]), rotate(occluder.rotation, [0, 0, hz])]
      .reduce((sum, axis) => sum + Math.abs(axis[1]), 0);
    return { bottom: occluder.center[1] - extent, top: occluder.center[1] + extent };
  });
  const tall = spans.filter((span) => span.top - span.bottom >= 1.5);
  if (tall.length === 0) return null;
  const foot = Math.min(...tall.map((span) => span.bottom));
  const floors = spans.filter((span) => span.top - span.bottom < 1.5 && span.top <= foot + 0.5 && span.top >= foot - 0.5);
  return floors.length > 0 ? Math.max(...floors.map((span) => span.top)) : foot;
}

export interface ZoneLevelPlan {
  /** Generated zones and portals to delete. */
  readonly remove: readonly ActorId[];
  /** New actor documents (raw: the caller normalises them). */
  readonly add: readonly Record<string, unknown>[];
  readonly floorY: number | null;
  readonly floorYs: readonly number[];
  readonly zones: number;
  readonly portals: number;
  /** User zones kept, and generated rooms left to them. */
  readonly kept: number;
  readonly skipped: number;
}

export interface ZoneLevelOptions extends Partial<ZoneGenerationOptions> {
  readonly levelId: string;
}

function inZone(world: Mat4, size: Vec3, point: ZoneVec3): boolean {
  const { p, r, s } = decomposeMat4(world);
  const local = rotate(invertQuat(r), sub(point, p));
  return [0, 1, 2].every((axis) => Math.abs(local[axis]!) <= Math.abs(size[axis]! * s[axis]!) / 2 + 1e-6);
}

const FLOOR_TOLERANCE = 0.08;
interface Floor { readonly y: number; readonly slabs: ZoneOccluderBounds[] }

function zoneFloors(occluders: readonly ZoneOccluder[], options: ZoneLevelOptions): Floor[] {
  const ground = options.floorY ?? zoneFloorY(occluders);
  if (ground === null) return [];
  const floors: Floor[] = [{ y: ground, slabs: [] }];
  if (options.floorY !== undefined) return floors;

  const boxes = occluders.map(zoneOccluderBounds);
  const probeHeight = Math.max(...(options.probeHeights ?? [0.3, 1.0, 1.7]));
  const walls = boxes.filter(({ min, max }) => max[1] - min[1] >= probeHeight);
  const slabs = boxes.filter(({ min, max }) => max[1] - min[1] <= 0.5 && max[1] >= ground + probeHeight
    && (max[0] - min[0]) * (max[2] - min[2]) >= (options.minRoomArea ?? 4))
    .sort((a, b) => a.max[1] - b.max[1]);
  for (const slab of slabs) {
    const y = slab.max[1];
    if (!walls.some(({ min, max }) => min[1] <= y + 0.5 && max[1] >= y + probeHeight
      && min[0] <= slab.max[0] && max[0] >= slab.min[0] && min[2] <= slab.max[2] && max[2] >= slab.min[2])) continue;
    const floor = floors.at(-1)!;
    if (y - floor.y <= FLOOR_TOLERANCE) floor.slabs.push(slab);
    else floors.push({ y, slabs: [slab] });
  }
  return floors;
}

export function planZoneLevel(actors: readonly ZoneLevelActor[], occluders: readonly ZoneOccluder[], options: ZoneLevelOptions): ZoneLevelPlan {
  const remove: ActorId[] = [];
  const kept: { id: ActorId; world: Mat4; size: Vec3 }[] = [];
  for (const actor of actors) {
    let generated = false, zone: { world: Mat4; size: Vec3 } | null = null;
    for (const component of Object.values(actor.components)) {
      const data = component as unknown as { type: string; generated?: boolean; size?: Vec3; local?: Parameters<typeof localMatrix>[0] };
      const name = typeName(data.type);
      if (name !== ZONE_TYPE && name !== PORTAL_TYPE) continue;
      if (data.generated) generated = true;
      else if (name === ZONE_TYPE && data.size) zone = { world: multiplyMat4(actor.world, localMatrix(data.local)), size: data.size };
    }
    if (generated) remove.push(actor.id);
    else if (zone) kept.push({ id: actor.id, ...zone });
  }
  const floors = zoneFloors(occluders, options);
  const floorYs: number[] = [];
  const add: Record<string, unknown>[] = [];
  let skipped = 0, zoneCount = 0, portalCount = 0;
  const actorId = (key: string): ActorId => `act_${stableHex(`${options.levelId}/zones/${key}`)}` as ActorId;
  const transform = (p: ZoneVec3, r: ZoneQuat) => ({ p: [...p], r: [...r], s: [1, 1, 1] });
  for (const [story, floor] of floors.entries()) {
    const generated = generateZones(occluders, { ...options, floorY: floor.y });
    const prefix = story === 0 ? "" : `floor/${floor.y.toFixed(3)}/`;
    const idOf = generated.zones.map((zone, index): ActorId | null => {
      const [x, , z] = zone.center;
      if (floor.slabs.length && !floor.slabs.some(({ min, max }) => x >= min[0] && x <= max[0] && z >= min[2] && z <= max[2])) return null;
      const owner = kept.find((entry) => inZone(entry.world, entry.size, zone.center));
      if (owner) { skipped += 1; return owner.id; }
      const id = actorId(`${prefix}zone/${index}`);
      zoneCount += 1;
      add.push({
        id, name: `Zone ${zoneCount}`, class: null, parent: null, spatiallyLoaded: false,
        transform: transform(zone.center, [0, 0, 0, 1]),
        components: { zone: { type: `${ZONE_TYPE}@1`, size: zone.halfExtents.map((half) => half * 2), generated: true } },
      });
      return id;
    });
    if (story === 0 || idOf.some(id => id !== null)) floorYs.push(floor.y);
    generated.portals.forEach((portal, index) => {
      const a = portal.a === null ? null : idOf[portal.a] ?? null;
      const b = idOf[portal.b] ?? null;
      if (b === null || (portal.a !== null && (a === null || a === b))) return;
      portalCount += 1;
      add.push({
        id: actorId(`${prefix}portal/${index}`), name: `Portal ${portalCount}`, class: null, parent: null, spatiallyLoaded: false,
        transform: transform(portal.center, portal.rotation),
        components: { portal: { type: `${PORTAL_TYPE}@1`, size: [portal.halfSize[0] * 2, portal.halfSize[1] * 2], zoneA: a, zoneB: b, generated: true } },
      });
    });
  }
  return { remove, add, floorY: floors[0]?.y ?? null, floorYs,
    zones: zoneCount, portals: portalCount, kept: kept.length, skipped };
}
