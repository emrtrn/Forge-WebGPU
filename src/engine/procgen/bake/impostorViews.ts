// The impostor's view layout (vegetation plan PG3, §6.4): a views × views
// grid of directions on the upper hemisphere (y up), hemi-octahedral, frame
// (i, j) at the grid POINT u = i / (views - 1), v = j / (views - 1): the outer
// ring is the horizon, the centre the zenith. The runtime shader
// (render/plant/impostorMaterial.ts) mirrors these functions exactly; change
// both together.

import { cross, unit } from "../vector.ts";
import type { Vec3 } from "../vector.ts";

/** d = dir / (|x|+|y|+|z|) with y clamped >= 0; u = (d.x + d.z) / 2 + 1/2, v = (d.x - d.z) / 2 + 1/2. */
export function hemiOctEncode(dir: Vec3): [number, number] {
  const y = Math.max(0, dir[1]);
  const sum = Math.abs(dir[0]) + y + Math.abs(dir[2]) || 1;
  const x = dir[0] / sum, z = dir[2] / sum;
  return [(x + z) * 0.5 + 0.5, (x - z) * 0.5 + 0.5];
}

export function hemiOctDecode(u: number, v: number): Vec3 {
  const px = u * 2 - 1, py = v * 2 - 1;
  const x = (px + py) / 2, z = (px - py) / 2;
  const y = Math.max(0, 1 - Math.abs(x) - Math.abs(z));
  return unit([x, y, z]);
}

/** Direction from the object toward the camera of frame (i, j). */
export function impostorViewDirection(views: number, i: number, j: number): Vec3 {
  return hemiOctDecode(i / (views - 1), j / (views - 1));
}

/** The frame's camera basis; forward looks at the object. */
export function impostorFrameBasis(views: number, i: number, j: number): { right: Vec3; up: Vec3; forward: Vec3 } {
  const v = impostorViewDirection(views, i, j);
  return impostorBasisOf(v);
}

/** The basis for a view direction (toward the camera): the shader builds the same one. */
export function impostorBasisOf(v: Vec3): { right: Vec3; up: Vec3; forward: Vec3 } {
  const upHint: Vec3 = Math.abs(v[1]) > 0.999 ? [0, 0, -1] : [0, 1, 0];
  const right = unit(cross(upHint, v));
  const up = cross(v, right);
  return { right, up, forward: [-v[0], -v[1], -v[2]] };
}

/**
 * The three frames around `dir` (toward the camera) and their weights: g = hemiOctEncode(dir) × (views - 1),
 * cell = floor(g) clamped to 0..views-2, f = g - cell; f.x + f.y < 1 → (cell, cell + x, cell + y) with
 * (1 - f.x - f.y, f.x, f.y), else (cell + x + y, cell + y, cell + x) with (f.x + f.y - 1, 1 - f.x, 1 - f.y).
 */
export function impostorBlend(views: number, dir: Vec3): {
  frames: [[number, number], [number, number], [number, number]];
  weights: [number, number, number];
} {
  const [u, v] = hemiOctEncode(dir);
  const gx = u * (views - 1), gy = v * (views - 1);
  const cx = Math.min(views - 2, Math.max(0, Math.floor(gx))), cy = Math.min(views - 2, Math.max(0, Math.floor(gy)));
  const fx = Math.min(1, Math.max(0, gx - cx)), fy = Math.min(1, Math.max(0, gy - cy));
  if (fx + fy < 1) {
    return { frames: [[cx, cy], [cx + 1, cy], [cx, cy + 1]], weights: [1 - fx - fy, fx, fy] };
  }
  return { frames: [[cx + 1, cy + 1], [cx, cy + 1], [cx + 1, cy]], weights: [fx + fy - 1, 1 - fx, 1 - fy] };
}
