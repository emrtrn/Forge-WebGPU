import { convexHull, simplifyHullPoints } from "../convexHull.ts";
import { cross, dot, pointAt, sub, unit } from "../vector.ts";
import type { Vec3 } from "../vector.ts";

export interface RockCollider { points: Float32Array; indices: Uint32Array }

/** A hull of a subset is inscribed and cannot enclose the original surface.
 * Expand the sampled hull homothetically about its interior centroid, using
 * the maximum support-plane ratio of ALL LOD0 vertices. This is conservative,
 * at most 32 points, and keeps the deterministic sampled topology/winding.
 */
export function rockCollider(positions: Float32Array): RockCollider | null {
  const samples = simplifyHullPoints(positions, 32);
  const indices = convexHull(samples);
  if (!indices) return null;
  const center: Vec3 = [0, 0, 0];
  for (const p of samples) for (let axis = 0; axis < 3; axis++) center[axis] = center[axis]! + p[axis]! / samples.length;
  let expansion = 1;
  for (let i = 0; i < indices.length; i += 3) {
    const a = samples[indices[i]!]!, b = samples[indices[i + 1]!]!, c = samples[indices[i + 2]!]!;
    const normal = unit(cross(sub(b, a), sub(c, a)));
    const support = dot(normal, sub(a, center));
    if (support <= 0) return null;
    for (let v = 0; v < positions.length / 3; v++) {
      expansion = Math.max(expansion, dot(normal, sub(pointAt(positions, v), center)) / support);
    }
  }
  // Relative margin covers conversion back to Float32, including thin rocks.
  expansion *= 1.00002;
  const points = new Float32Array(samples.length * 3);
  for (let i = 0; i < samples.length; i++) for (let axis = 0; axis < 3; axis++) {
    points[i * 3 + axis] = center[axis]! + (samples[i]![axis]! - center[axis]!) * expansion;
  }
  return { points, indices };
}
