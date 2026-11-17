import { cross, dot, pointAt, sub, unit } from "./vector.ts";
import type { Vec3 } from "./vector.ts";

export type HullPoints = readonly Vec3[] | Float32Array | Float64Array;
const unpack = (points: HullPoints): readonly Vec3[] => points instanceof Float32Array || points instanceof Float64Array
  ? Array.from({ length: Math.floor(points.length / 3) }, (_, i) => pointAt(points, i)) : points;
interface Face { a: number; b: number; c: number; normal: Vec3 }

/** Incremental 3D hull, deterministic input order, indices refer to original input.
 * Non-finite, duplicate points are ignored. Collinear/coplanar sets return null.
 * Tolerance is relative to the point-cloud extent; faces wind outwards.
 */
export function convexHull(input: HullPoints): Uint32Array | null {
  const points = unpack(input), unique: number[] = [], seen = new Set<string>();
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (!p.every(Number.isFinite)) continue;
    const key = p.join(",");
    if (!seen.has(key)) { seen.add(key); unique.push(i); }
  }
  if (unique.length < 4) return null;
  const first = unique[0]!, origin = points[first]!;
  let second = first, farthest = 0;
  for (const i of unique) {
    const d = dot(sub(points[i]!, origin), sub(points[i]!, origin));
    if (d > farthest) { second = i; farthest = d; }
  }
  const epsilon = Math.sqrt(farthest) * 1e-9;
  if (!farthest) return null;
  const line = unit(sub(points[second]!, origin));
  let third = first; farthest = 0;
  for (const i of unique) {
    const d = Math.hypot(...cross(line, sub(points[i]!, origin)));
    if (d > farthest) { third = i; farthest = d; }
  }
  if (farthest <= epsilon) return null;
  const plane = unit(cross(line, sub(points[third]!, origin)));
  let fourth = first; farthest = 0;
  for (const i of unique) {
    const d = Math.abs(dot(plane, sub(points[i]!, origin)));
    if (d > farthest) { fourth = i; farthest = d; }
  }
  if (farthest <= epsilon) return null;
  const tetra = [first, second, third, fourth];
  const center: Vec3 = [0, 0, 0];
  for (const i of tetra) for (let axis = 0; axis < 3; axis++) center[axis] = center[axis]! + points[i]![axis]! / 4;
  const face = (a: number, b: number, c: number): Face => {
    let normal = unit(cross(sub(points[b]!, points[a]!), sub(points[c]!, points[a]!)));
    if (dot(normal, sub(center, points[a]!)) > 0) {
      [b, c] = [c, b]; normal = [-normal[0], -normal[1], -normal[2]];
    }
    return { a, b, c, normal };
  };
  let faces = [face(first, second, third), face(first, fourth, second),
    face(first, third, fourth), face(second, fourth, third)];
  for (const i of unique) {
    if (tetra.includes(i)) continue;
    const visible = new Set(faces.filter(f => dot(f.normal, sub(points[i]!, points[f.a]!)) > epsilon));
    if (!visible.size) continue;
    const horizon = new Map<string, [number, number]>();
    for (const f of visible) for (const [a, b] of [[f.a, f.b], [f.b, f.c], [f.c, f.a]] as const) {
      const key = `${Math.min(a, b)},${Math.max(a, b)}`;
      if (horizon.has(key)) horizon.delete(key); else horizon.set(key, [a, b]);
    }
    faces = faces.filter(f => !visible.has(f));
    for (const [a, b] of horizon.values()) faces.push(face(a, b, i));
  }
  return Uint32Array.from(faces.flatMap(f => [f.a, f.b, f.c]));
}

/** Deterministic farthest-point sampling. O(n * maxPoints), first point is
 * lexicographically smallest; ties preserve input order. Returns copies.
 */
export function simplifyHullPoints(input: HullPoints, maxPoints: number): Vec3[] {
  if (!Number.isFinite(maxPoints) || maxPoints < 1) return [];
  const points = unpack(input).filter(p => p.every(Number.isFinite));
  const count = Math.min(points.length, Math.floor(maxPoints));
  if (!count) return [];
  let next = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i]!, b = points[next]!;
    if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))) next = i;
  }
  const distances = new Float64Array(points.length).fill(Infinity), result: Vec3[] = [];
  for (let k = 0; k < count; k++) {
    const chosen = points[next]!;
    result.push([...chosen]);
    let best = -1;
    for (let i = 0; i < points.length; i++) {
      const delta = sub(points[i]!, chosen);
      distances[i] = Math.min(distances[i]!, dot(delta, delta));
      if (distances[i]! > best) { best = distances[i]!; next = i; }
    }
    if (best <= 0) break;
  }
  return result;
}
