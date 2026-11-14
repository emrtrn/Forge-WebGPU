// The gizmo's drag math, three-free (plan phase 4 step 4, decision 2; a
// rewrite of Forge WebGL editor/gizmos/transformDrag.ts and
// editor/render-three/transformMatrices.ts @ forge-webgl-final, INV-A05/A06).
//
// What changed from Forge, and why:
// - Forge moved an x / z handle by the pointer's hit on the floor plane (y = 0)
//   and the y handle by 0.01 m per screen pixel; the floor is edge-on in the
//   Front and Left views and a pixel is a different distance at every depth.
//   An axis handle here follows the point of its axis line closest to the
//   pointer ray, in every view and at any distance; the free handle moves on
//   the plane facing the camera, not by 0.01 m per pixel.
// - Rotation is a quaternion (`r`), not Euler degrees: a rotate drag turns
//   the start rotation about the handle's world axis, and the snap applies to
//   the angle turned (Forge snapped the absolute Euler value).
// - A move in world space puts the dragged coordinates on the grid, as Forge
//   did; a plane handle no longer snaps the coordinate it leaves out.
// Kept as Forge had them: 0.5° per horizontal pixel, the scale factor
// (horizontal - vertical pixels) x 0.005 and its 0.05 floor, two-decimal
// positions, the pivot correction.

import type { Vec3 } from "../../core/index.ts";
import { add, dot, invertQuat, multiplyQuat, normalizeQuat, quatFromAxisAngle, rotate, sub, type Quat } from "../math/affine.ts";
import { axisToIndex, isPlaneAxis, planeAxisIndices, type AxisIndex, type GizmoAxis } from "./axes.ts";
import { round, snapValue, type SnapSettings } from "./snap.ts";

export interface Ray {
  readonly origin: Vec3;
  /** Unit length. */
  readonly direction: Vec3;
}

/** Forge: degrees per horizontal pixel of a rotate drag. */
export const ROTATE_DEGREES_PER_PIXEL = 0.5;
/** Forge: scale added per pixel of (horizontal - vertical) travel. */
export const SCALE_PER_PIXEL = 0.005;
/** Forge: no axis scales below this. */
export const MIN_SCALE = 0.05;
/** Below this the pointer ray runs along the axis and gives no usable point. */
const PARALLEL = 1e-3;

/**
 * Where on the line `origin + t * axis` (unit axis) the ray passes closest: t.
 * Null when the ray runs (nearly) along the axis.
 */
export function axisParameter(ray: Ray, origin: Readonly<Vec3>, axis: Readonly<Vec3>): number | null {
  const w0 = sub(ray.origin, origin);
  const b = dot(ray.direction, axis);
  const denom = 1 - b * b;
  if (denom < PARALLEL) return null;
  return (dot(axis, w0) - b * dot(ray.direction, w0)) / denom;
}

/** The ray's hit on a plane, ahead of its origin; null when it misses or runs along it. */
export function rayPlane(ray: Ray, point: Readonly<Vec3>, normal: Readonly<Vec3>): Vec3 | null {
  const denom = dot(normal, ray.direction);
  if (Math.abs(denom) < 1e-6) return null;
  const t = dot(normal, sub(point, ray.origin)) / denom;
  if (t < 0) return null;
  return add(ray.origin, [ray.direction[0] * t, ray.direction[1] * t, ray.direction[2] * t]);
}

/**
 * An axis handle: `start` moved `distance` along `axis`. A world axis
 * (`worldIndex`) sets only that coordinate, on the move grid (Forge); a local
 * axis snaps the distance travelled.
 */
export function axisMovePosition(start: Readonly<Vec3>, axis: Readonly<Vec3>, distance: number, snap: SnapSettings, worldIndex: AxisIndex | null): Vec3 {
  if (worldIndex !== null) {
    const position: Vec3 = [start[0], start[1], start[2]];
    position[worldIndex] = snapValue(start[worldIndex] + distance, snap.move, snap.moveEnabled);
    return position;
  }
  const travelled = snapValue(distance, snap.move, snap.moveEnabled);
  return [round(start[0] + axis[0] * travelled), round(start[1] + axis[1] * travelled), round(start[2] + axis[2] * travelled)];
}

/**
 * A plane handle or the free handle: `start` moved by the pointer's travel on
 * the handle's plane. In the world frame (`frame` null) the coordinates in
 * `axes` go on the move grid (Forge); in a local frame the travel along those
 * of its axes snaps.
 */
export function planeMovePosition(start: Readonly<Vec3>, delta: Readonly<Vec3>, snap: SnapSettings, axes: readonly AxisIndex[], frame: Quat | null): Vec3 {
  if (frame === null) {
    const position: Vec3 = [start[0] + delta[0], start[1] + delta[1], start[2] + delta[2]];
    for (const index of axes) position[index] = snapValue(position[index], snap.move, snap.moveEnabled);
    return [round(position[0]), round(position[1]), round(position[2])];
  }
  const local = rotate(invertQuat(frame), delta);
  for (const index of axes) local[index] = snapValue(local[index], snap.move, snap.moveEnabled);
  const moved = add(start, rotate(frame, local));
  return [round(moved[0]), round(moved[1]), round(moved[2])];
}

/** The components a move handle may put on the grid. */
export function movedAxes(axis: GizmoAxis): AxisIndex[] {
  if (isPlaneAxis(axis)) return planeAxisIndices(axis);
  if (axis === "xyz" || axis === "uniform") return [0, 1, 2];
  return [axisToIndex(axis)];
}

/** A rotate drag's angle in degrees: 0.5° per horizontal pixel, the angle snapped. */
export function rotateDragDegrees(deltaClientX: number, snap: SnapSettings): number {
  return snapValue(deltaClientX * ROTATE_DEGREES_PER_PIXEL, snap.rotate, snap.rotateEnabled);
}

/** `rotation` turned `degrees` about a world axis (unit). */
export function rotateAbout(rotation: Readonly<Quat>, axis: Readonly<Vec3>, degrees: number): Quat {
  return normalizeQuat(multiplyQuat(quatFromAxisAngle(axis, (degrees * Math.PI) / 180), rotation));
}

/** `point` carried round `centre` by a rotation. */
export function orbit(point: Readonly<Vec3>, centre: Readonly<Vec3>, turn: Readonly<Quat>): Vec3 {
  return add(centre, rotate(turn, sub(point, centre)));
}

/**
 * A scale drag (Forge): (horizontal - vertical) pixels x 0.005 added to the
 * uniform handle's three axes, a plane handle's two or an axis handle's one;
 * each snapped, never below 0.05.
 */
export function scaleDragScale(axis: GizmoAxis, start: Readonly<Vec3>, deltaClientX: number, deltaClientY: number, snap: SnapSettings): Vec3 {
  const factor = (deltaClientX - deltaClientY) * SCALE_PER_PIXEL;
  const apply = (value: number): number => Math.max(MIN_SCALE, snapValue(value + factor, snap.scale, snap.scaleEnabled));
  const scale: Vec3 = [start[0], start[1], start[2]];
  const indices: readonly AxisIndex[] = axis === "uniform" || axis === "xyz" ? [0, 1, 2] : isPlaneAxis(axis) ? planeAxisIndices(axis) : [axisToIndex(axis)];
  for (const index of indices) scale[index] = apply(start[index]);
  return scale;
}

/**
 * The position that keeps the pivot's point fixed under a rotation and scale
 * (Forge): `pivotPoint - R * S * pivot`, where `pivotPoint` is where the
 * pivot sits in the same space as the position.
 */
export function pivotCorrectedPosition(pivotPoint: Readonly<Vec3>, rotation: Readonly<Quat>, scale: Readonly<Vec3>, pivot: Readonly<Vec3>): Vec3 {
  const offset = rotate(rotation, [scale[0] * pivot[0], scale[1] * pivot[1], scale[2] * pivot[2]]);
  return [round(pivotPoint[0] - offset[0]), round(pivotPoint[1] - offset[1]), round(pivotPoint[2] - offset[2])];
}
