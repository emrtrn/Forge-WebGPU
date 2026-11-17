// Ported from Forge WebGL engine/scene/foliagePaint.ts @ forge-webgl-final (04b5fb23); generation-only boundary.
import type { Vec3 } from "../../core/schema/fields.ts";
import type { FoliageTypeParams } from "./foliageTypeParams.ts";

/**
 * Pure, three-agnostic Foliage paint core: sample budget, slope/height filters,
 * per-instance random rolls, radius-overlap rejection, and erase masking. The
 * three.js parts (surface raycasts, quaternion normal-alignment) live in the
 * render layer / SceneApp; everything here is deterministic and unit-tested so the
 * brush behaviour is verifiable without a renderer.
 */

/** One accepted surface point under the brush (world space). */
export interface FoliageSurfaceHit {
  position: Vec3;
  /** Unit surface normal (world space). */
  normal: Vec3;
}

const DEG = 180 / Math.PI;

const EPSILON = 1e-4;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic 32-bit PRNG (mulberry32) seeded per brush dab. */
export function makeFoliageRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Surface slope in degrees (0 = flat/up-facing, 90 = vertical). */
export function surfaceSlopeDegrees(normal: Vec3): number {
  return Math.acos(clamp(normal[1], -1, 1)) * DEG;
}

/** Slope + world-height acceptance for a candidate hit. */
export function passesFoliageFilters(type: FoliageTypeParams, hit: FoliageSurfaceHit): boolean {
  const slope = surfaceSlopeDegrees(hit.normal);
  if (slope < type.slopeMin - EPSILON || slope > type.slopeMax + EPSILON) return false;
  const y = hit.position[1];
  if (type.heightMin !== undefined && y < type.heightMin - EPSILON) return false;
  if (type.heightMax !== undefined && y > type.heightMax + EPSILON) return false;
  return true;
}

/** Randomized per-instance parameters; alignment/z-offset are applied by the render layer. */
export interface FoliageInstanceRoll {
  position: Vec3;
  normal: Vec3;
  /** Yaw about the instance up axis, degrees. */
  yawDeg: number;
  scale: Vec3;
  /** Offset along the instance up axis, world units. */
  zOffset: number;
  seed: number;
}

/** Rolls random scale / yaw / z-offset / seed for one accepted hit. */
export function rollFoliageInstance(
  type: FoliageTypeParams,
  hit: FoliageSurfaceHit,
  rng: () => number,
): FoliageInstanceRoll {
  const scaleRatio = lerp(type.scaleMin[0], type.scaleMax[0], rng());
  // Keep yaw/offset/seed rolls stable for existing deterministic brushes: scale
  // used to consume one PRNG draw per axis, but now its one ratio drives XYZ.
  rng();
  rng();
  const scale: Vec3 = [scaleRatio, scaleRatio, scaleRatio];
  const yawDeg = type.randomYaw ? rng() * 360 : 0;
  const zOffset = lerp(type.zOffsetMin, type.zOffsetMax, rng());
  const seed = Math.floor(rng() * 0xffffffff) >>> 0;
  return {
    position: [...hit.position],
    normal: [...hit.normal],
    yawDeg,
    scale,
    zOffset,
    seed,
  };
}
