import type { Vec3 } from "../../core/index.ts";
import { transformPoint, type Mat4 } from "../math/affine.ts";
import type { ColliderPrimitive } from "./colliderTypes.ts";

export function triangleMeshPrimitive(positions: ArrayLike<number>, indices: ArrayLike<number>, transform?: Mat4): ColliderPrimitive {
  const vertices: Vec3[] = [];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    let vertex: Vec3 = [positions[i]!, positions[i + 1]!, positions[i + 2]!];
    if (transform) vertex = transformPoint(transform, vertex);
    vertices.push(vertex);
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], vertex[axis]);
      max[axis] = Math.max(max[axis], vertex[axis]);
    }
  }
  const triangles = Array.from(indices);
  if (transform) {
    const [a, d, g, , b, e, h, , c, f, i] = transform as readonly [number, number, number, number, number, number, number, number, number, number, number];
    if (a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g) < 0) {
      for (let j = 0; j + 2 < triangles.length; j += 3) {
        [triangles[j + 1], triangles[j + 2]] = [triangles[j + 2]!, triangles[j + 1]!];
      }
    }
  }
  return {
    shape: "trimesh", vertices, indices: triangles,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: [(max[0] + min[0]) * 0.5, (max[1] + min[1]) * 0.5, (max[2] + min[2]) * 0.5],
  };
}
