// The Foliage brush's pure core (plan 5d step 6, INV-B09). Adapted from Forge
// WebGL engine/scene/foliagePaint.ts, engine/render-three/foliage.ts
// (foliageInstanceFromRoll, reattachFoliageInstance, reapplyFoliageInstance)
// and SceneApp's brush / fill / Select Invalid rules @ forge-webgl-final
// (04b5fb23); the rolls and filters are foliageRoll.ts (5c). What differs:
//
// - A stored instance is the level part's (core/level/foliageCells.ts): a unit
//   quaternion, one scale, no surface normal. The old up is read from the
//   rotation when the type aligns to the normal.
// - Every stored number is Float32-exact, so an instance equals itself after
//   a save and a reload.
// - The spacing test uses a grid (Forge scanned every instance); same answers.

import type { Vec3, Vec4 } from "../../core/schema/fields.ts";
import { multiplyQuat, normalizeQuat, quatFromAxisAngle, rotate, type Quat } from "../math/affine.ts";
import { makeFoliageRng, passesFoliageFilters, rollFoliageInstance, type FoliageInstanceRoll, type FoliageSurfaceHit } from "./foliageRoll.ts";
import type { FoliageTypeParams } from "./foliageTypeParams.ts";

/** One painted instance (world space); immutable: an edit makes a new object. */
export interface PaintedFoliageInstance {
  readonly position: Readonly<Vec3>;
  readonly rotation: Readonly<Vec4>;
  readonly scale: number;
  readonly seed: number;
}

export interface FoliageBrush {
  readonly center: Readonly<Vec3>;
  readonly radius: number;
  /** Paint Density, 0..4. */
  readonly density: number;
}

/** What painting needs of a Foliage Type beyond generation's fields. */
export interface FoliagePaintType extends FoliageTypeParams {
  /** Smallest horizontal spacing of two instances of the type, metres. */
  readonly radius: number;
  readonly density: number;
}

/** World XZ footprint of a Fill target. */
export interface FoliageFillArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Instances per square metre at brush density 1 before the type's (Forge). */
export const FOLIAGE_BASE_DENSITY = 1.5;
/** Samples one Fill tries at most; a larger target spaces them wider (Forge). */
export const FOLIAGE_FILL_MAX_SAMPLES = 20000;

const DEG = Math.PI / 180;
const UP: Vec3 = [0, 1, 0];

/** Samples one dab tries: a budget, the filters and the spacing thin it. */
export function foliageSampleTargetCount(type: Pick<FoliagePaintType, "density">, brush: Pick<FoliageBrush, "radius" | "density">): number {
  return Math.max(1, Math.round(Math.PI * brush.radius * brush.radius * FOLIAGE_BASE_DENSITY * type.density * brush.density));
}

/** A dab's sample points (XZ), uniform over the disk. */
export function foliageBrushSamples(type: Pick<FoliagePaintType, "density">, brush: FoliageBrush, rng: () => number): [number, number][] {
  return Array.from({ length: foliageSampleTargetCount(type, brush) }, (): [number, number] => {
    const radius = brush.radius * Math.sqrt(rng());
    const angle = rng() * Math.PI * 2;
    return [brush.center[0] + Math.cos(angle) * radius, brush.center[2] + Math.sin(angle) * radius];
  });
}

/** Fill's grid spacing: the type's radius, wider when the area would pass the sample cap. */
export function foliageFillSpacing(type: Pick<FoliagePaintType, "radius">, area: FoliageFillArea): number {
  const cap = Math.sqrt(Math.max(((area.maxX - area.minX) * (area.maxZ - area.minZ)) / FOLIAGE_FILL_MAX_SAMPLES, 0));
  return Math.max(type.radius, 0.05, cap);
}

/** One jittered point per grid cell of the area, kept with probability `density`. */
export function foliageFillSamplePoints(area: FoliageFillArea, spacing: number, density: number, rng: () => number): [number, number][] {
  const points: [number, number][] = [];
  const width = area.maxX - area.minX;
  const depth = area.maxZ - area.minZ;
  if (spacing <= 0 || width <= 0 || depth <= 0) return points;
  const keep = Math.min(1, Math.max(0, density));
  const cols = Math.max(1, Math.ceil(width / spacing));
  const rows = Math.max(1, Math.ceil(depth / spacing));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (rng() > keep) continue;
      const x = area.minX + (col + rng()) * (width / cols);
      const z = area.minZ + (row + rng()) * (depth / rows);
      points.push([x, z]);
    }
  }
  return points;
}

/** Horizontal spacing test against added points: closer than `radius` overlaps. */
export class FoliageSpacing {
  private readonly radius: number;
  private readonly size: number;
  private readonly cells = new Map<string, [number, number][]>();

  constructor(radius: number) {
    this.radius = radius;
    this.size = Math.max(radius, 1e-3);
  }

  add(position: Readonly<Vec3>): void {
    const key = `${Math.floor(position[0] / this.size)},${Math.floor(position[2] / this.size)}`;
    const list = this.cells.get(key);
    if (list) list.push([position[0], position[2]]);
    else this.cells.set(key, [[position[0], position[2]]]);
  }

  overlaps(position: Readonly<Vec3>): boolean {
    const r2 = this.radius * this.radius;
    const cx = Math.floor(position[0] / this.size), cz = Math.floor(position[2] / this.size);
    for (let z = cz - 1; z <= cz + 1; z += 1) {
      for (let x = cx - 1; x <= cx + 1; x += 1) {
        for (const [px, pz] of this.cells.get(`${x},${z}`) ?? []) {
          const dx = px - position[0], dz = pz - position[2];
          if (dx * dx + dz * dz < r2) return true;
        }
      }
    }
    return false;
  }
}

/** three's Quaternion.setFromUnitVectors(world up, `to`). */
function alignUp(to: Readonly<Vec3>): Quat {
  const r = to[1] + 1;
  // Straight down: any half turn about a horizontal axis; three's choice for (0, 1, 0).
  if (r < 1e-8) return [0, 0, 1, 0];
  return normalizeQuat([to[2], 0, -to[0], r]);
}

function unitOrUp(normal: Readonly<Vec3>): Vec3 {
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  return length < 1e-4 ? [...UP] : [normal[0] / length, normal[1] / length, normal[2] / length];
}

function stored(position: Readonly<Vec3>, rotation: Readonly<Quat>, scale: number, seed: number): PaintedFoliageInstance {
  const q = normalizeQuat([rotation[0], rotation[1], rotation[2], rotation[3]]);
  return {
    position: [Math.fround(position[0]), Math.fround(position[1]), Math.fround(position[2])],
    rotation: [Math.fround(q[0]), Math.fround(q[1]), Math.fround(q[2]), Math.fround(q[3])],
    scale: Math.fround(scale),
    seed: seed >>> 0,
  };
}

/** An accepted roll as a stored instance: aligned to the normal when the type says so, turned, lifted by its offset along its up. */
export function paintedInstanceFromRoll(type: Pick<FoliageTypeParams, "alignToNormal">, roll: FoliageInstanceRoll): PaintedFoliageInstance {
  const up = type.alignToNormal ? unitOrUp(roll.normal) : UP;
  const rotation = multiplyQuat(alignUp(up), quatFromAxisAngle(UP, roll.yawDeg * DEG));
  const { position, zOffset } = roll;
  return stored([position[0] + up[0] * zOffset, position[1] + up[1] * zOffset, position[2] + up[2] * zOffset], rotation, roll.scale[0], roll.seed);
}

/** Places what the filters and the spacing let through, in order (`null`: no surface there). */
export function placeFoliage(
  type: FoliagePaintType, hits: Iterable<FoliageSurfaceHit | null>, existing: Iterable<Pick<PaintedFoliageInstance, "position">>, rng: () => number,
): PaintedFoliageInstance[] {
  const spacing = new FoliageSpacing(type.radius);
  for (const instance of existing) spacing.add(instance.position);
  const placed: PaintedFoliageInstance[] = [];
  for (const hit of hits) {
    if (!hit || !passesFoliageFilters(type, hit) || spacing.overlaps(hit.position)) continue;
    const instance = paintedInstanceFromRoll(type, rollFoliageInstance(type, hit, rng));
    placed.push(instance);
    spacing.add(instance.position);
  }
  return placed;
}

/** The instance's own up: what its normal alignment left in the rotation. */
const upOf = (instance: PaintedFoliageInstance, type: Pick<FoliageTypeParams, "alignToNormal">): Vec3 =>
  type.alignToNormal ? unitOrUp(rotate([...instance.rotation] as Quat, UP)) : [...UP];

/** Moves an instance onto a surface point; an aligned one tilts to the new normal and keeps its turn. */
export function reattachPaintedInstance(instance: PaintedFoliageInstance, type: Pick<FoliageTypeParams, "alignToNormal">, surface: FoliageSurfaceHit): PaintedFoliageInstance {
  const rotation = [...instance.rotation] as Quat;
  if (!type.alignToNormal) return stored(surface.position, rotation, instance.scale, instance.seed);
  const [x, y, z, w] = alignUp(upOf(instance, type));
  const delta = multiplyQuat(alignUp(unitOrUp(surface.normal)), [-x, -y, -z, w]);
  return stored(surface.position, multiplyQuat(delta, rotation), instance.scale, instance.seed);
}

/** Rolls scale and turn again from the type's settings now and the stored seed; the position stays (Forge: an offset change needs a repaint). */
export function reapplyPaintedInstance(instance: PaintedFoliageInstance, type: FoliageTypeParams): PaintedFoliageInstance {
  const rng = makeFoliageRng(instance.seed);
  const scale = type.scaleMin[0] + (type.scaleMax[0] - type.scaleMin[0]) * rng();
  // Forge rolled three axes; the turn's draw stays the fourth.
  rng();
  rng();
  const yaw = type.randomYaw ? rng() * 360 : 0;
  const rotation = multiplyQuat(alignUp(upOf(instance, type)), quatFromAxisAngle(UP, yaw * DEG));
  return stored(instance.position, rotation, scale, instance.seed);
}

/** Forge's Select Invalid: nothing under it, far from the ground under it, or ground the type refuses. */
export function foliageInvalid(instance: PaintedFoliageInstance, type: FoliageTypeParams | null, surface: FoliageSurfaceHit | null): boolean {
  if (!surface) return true;
  const tolerance = 0.5 + (type ? Math.max(Math.abs(type.zOffsetMin), Math.abs(type.zOffsetMax)) : 0);
  if (Math.abs(surface.position[1] - instance.position[1]) > tolerance) return true;
  return type !== null && !passesFoliageFilters(type, surface);
}

/** Instances within a horizontal distance of `center`. */
export function foliageInRadius(instances: readonly PaintedFoliageInstance[], center: Readonly<Vec3>, radius: number): PaintedFoliageInstance[] {
  const r2 = radius * radius;
  return instances.filter(({ position }) => {
    const dx = position[0] - center[0], dz = position[2] - center[2];
    return dx * dx + dz * dz <= r2;
  });
}
