// Ported from Forge WebGL engine/scene/transform.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
import type { Vec3 } from "../legacy/layout.ts";

const DEG_TO_RAD = Math.PI / 180;

export function degreesToRadians(degrees: number | undefined): number {
  return (degrees ?? 0) * DEG_TO_RAD;
}

/** Resolves a placement's rotation to a full XYZ Euler vector (degrees). */
export function readRotation(
  source: { rotation?: Vec3; rotationYDeg?: number },
): Vec3 {
  if (source.rotation) {
    return [source.rotation[0], source.rotation[1], source.rotation[2]];
  }
  return [0, source.rotationYDeg ?? 0, 0];
}

/** Resolves a placement's scale (uniform scalar or per-axis) to an XYZ vector. */
export function readScale(source: { scale?: number | Vec3 }): Vec3 {
  const scale = source.scale;
  if (Array.isArray(scale)) return [scale[0], scale[1], scale[2]];
  const value = scale ?? 1;
  return [value, value, value];
}

/** Resolves a placement's local authoring pivot offset; absent means the origin. */
export function readPivot(source: { pivot?: Vec3 }): Vec3 {
  const pivot = source.pivot;
  return pivot ? [pivot[0], pivot[1], pivot[2]] : [0, 0, 0];
}

/**
 * Rotates a local-space vector by an XYZ-order Euler rotation in degrees.
 * Kept Three-free so gameplay/behavior code can query actor direction vectors
 * without importing the render layer.
 */
export function rotateVectorByEulerDegrees(vector: Vec3, rotation: Vec3): Vec3 {
  const rx = rotation[0] * DEG_TO_RAD;
  const ry = rotation[1] * DEG_TO_RAD;
  const rz = rotation[2] * DEG_TO_RAD;

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  let x = vector[0];
  let y = vector[1];
  let z = vector[2];

  // XYZ Euler order: local X, then Y, then Z.
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return [cleanAxis(x), cleanAxis(y), cleanAxis(z)];
}

/** Actor forward is local +Z, matching Forge character facing/yaw semantics. */
export function forwardVectorFromRotation(rotation: Vec3): Vec3 {
  return rotateVectorByEulerDegrees([0, 0, 1], rotation);
}

export function rightVectorFromRotation(rotation: Vec3): Vec3 {
  return rotateVectorByEulerDegrees([1, 0, 0], rotation);
}

export function upVectorFromRotation(rotation: Vec3): Vec3 {
  return rotateVectorByEulerDegrees([0, 1, 0], rotation);
}

function cleanAxis(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value;
}
