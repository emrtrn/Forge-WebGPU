import { unit } from "../vector.ts";
import type { Vec3 } from "../vector.ts";

/** Shared midpoint indices keep the sphere closed; refinement retains all old
 * sample directions exactly, so every LOD samples the same parameter domain.
 */
export function icosphere(level: number): { directions: Vec3[]; indices: Uint32Array } {
  const t = (1 + Math.sqrt(5)) / 2;
  const directions: Vec3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(p => unit(p as Vec3));
  let faces = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  for (let step = 0; step < level; step++) {
    const midpoints = new Map<string, number>(), refined: number[] = [];
    const midpoint = (a: number, b: number): number => {
      const key = `${Math.min(a, b)},${Math.max(a, b)}`;
      const existing = midpoints.get(key);
      if (existing !== undefined) return existing;
      const pa = directions[a]!, pb = directions[b]!;
      const index = directions.length;
      directions.push(unit([pa[0] + pb[0], pa[1] + pb[1], pa[2] + pb[2]]));
      midpoints.set(key, index);
      return index;
    };
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i]!, b = faces[i + 1]!, c = faces[i + 2]!;
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      refined.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    faces = refined;
  }
  return { directions, indices: new Uint32Array(faces) };
}
