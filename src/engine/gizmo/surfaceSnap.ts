// Snap to floor and snap to wall (plan phase 4 step 4, INV-A06; a rewrite of
// Forge WebGL editor/render-three/{floorSnap,wallSnap}.ts and SceneApp's
// surfaceSnapSelected @ forge-webgl-final), three-free.
//
// - Floor: the selection's world box comes to rest on the surface under it.
//   The caller casts the ray down from the box's bottom centre through the
//   viewport's picker (the selection left out); nothing under it rests on the
//   floor plane y = 0, as in Forge.
// - Wall: Forge slid a model against the nearest of its room's four bounding
//   walls; a level has no room, so the caller casts four level rays (+X, -X,
//   +Z, -Z) from the box's centre and the nearest hit is the wall. The model's
//   front is +Z (Forge): it turns to face away from the wall, keeping its tilt,
//   and slides until its back touches the wall.

import type { Transform, Vec3 } from "../../core/index.ts";
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from "../math/euler.ts";
import { composeMat4, transformPoint, type Mat4, type Quat } from "../math/affine.ts";
import { round } from "./snap.ts";

export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

export const DEFAULT_FLOOR_Y = 0;
export const FLOOR_SNAP_EPSILON = 1e-3;

/** The position that puts the box's bottom on `floorY`; null when it already rests there. */
export function floorSnapPosition(worldBox: Box, position: Readonly<Vec3>, floorY = DEFAULT_FLOOR_Y): Vec3 | null {
  const delta = floorY - worldBox.min[1];
  if (Math.abs(delta) < FLOOR_SNAP_EPSILON) return null;
  return [position[0], round(position[1] + delta), position[2]];
}

export type WallSide = "-x" | "+x" | "-z" | "+z";
export const WALL_SIDES: readonly WallSide[] = ["+x", "-x", "+z", "-z"];
export const WALL_DIRECTIONS: Readonly<Record<WallSide, Vec3>> = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };

/** A wall ray's hit: how far from the box's centre the wall on that side is. */
export interface WallHit {
  readonly side: WallSide;
  readonly distance: number;
}

/** The nearest of the hits (the first of equals, in `WALL_SIDES` order); null for none. */
export function nearestWall(hits: readonly WallHit[]): WallHit | null {
  let best: WallHit | null = null;
  for (const side of WALL_SIDES) {
    const hit = hits.find((one) => one.side === side);
    if (hit && (best === null || hit.distance < best.distance)) best = hit;
  }
  return best;
}

/** The world box of a local box under a matrix (its eight corners). */
export function transformBox(box: Box, matrix: Mat4): Box {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let corner = 0; corner < 8; corner += 1) {
    const point = transformPoint(matrix, [corner & 1 ? box.max[0] : box.min[0], corner & 2 ? box.max[1] : box.min[1], corner & 4 ? box.max[2] : box.min[2]]);
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, point[axis]!);
      max[axis] = Math.max(max[axis]!, point[axis]!);
    }
  }
  return { min, max };
}

/** Forge: the heading (degrees about Y) that turns a +Z front away from the wall. */
const FACING: Readonly<Record<WallSide, number>> = { "-x": 90, "+x": 270, "-z": 0, "+z": 180 };

/**
 * Slides a model flush against a wall and turns it to face away from it.
 * `bounds` is the model's local box, `transform` its world placement, `wall`
 * the wall's coordinate on the side's axis (x for ±x, z for ±z).
 */
export function wallSnap(bounds: Box, transform: Readonly<Transform>, side: WallSide, wall: number): { position: Vec3; rotation: Quat } {
  const euler = quaternionToEulerDegrees(transform.r);
  const rotation = eulerDegreesToQuaternion([euler[0], FACING[side], euler[2]]);
  const probe = transformBox(bounds, composeMat4(transform.p, rotation, transform.s));
  const axis = side === "-x" || side === "+x" ? 0 : 2;
  const toWall = side[0] === "-" ? wall - probe.min[axis] : wall - probe.max[axis];
  const position: Vec3 = [transform.p[0], transform.p[1], transform.p[2]];
  position[axis] = round(position[axis] + toWall);
  return { position, rotation };
}
