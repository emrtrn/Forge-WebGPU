import assert from "node:assert/strict";
import { test } from "vitest";
import { convexHull, simplifyHullPoints } from "./convexHull.ts";
import { computeVertexNormals, validateMesh } from "./mesh.ts";
import { meshStats } from "./stats.ts";
import { createStream } from "./random.ts";
import { cross, dot, sub, unit } from "./vector.ts";
import type { Vec3 } from "./vector.ts";

test("incremental hull encloses a cube with duplicates/interior/coplanar face points and outward winding", () => {
  const points: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push([x, y, z]);
  points.push([0, 0, 0], [1, 0, 0], [-1, -1, -1], [0, 0, 1]);
  const indices = convexHull(points);
  assert.ok(indices);
  const mesh = { positions: Float32Array.from(points.flat()), normals: new Float32Array(points.length * 3), indices };
  computeVertexNormals(mesh);
  assert.deepEqual(validateMesh(mesh), []);
  assert.equal(meshStats(mesh).isClosed, true);
  assert.equal(indices.length / 3, 12);
  for (let i = 0; i < indices.length; i += 3) {
    const a = points[indices[i]!]!;
    const n = unit(cross(sub(points[indices[i + 1]!]!, a), sub(points[indices[i + 2]!]!, a)));
    assert.ok(dot(n, a) > 0);
    for (const p of points) assert.ok(dot(n, sub(p, a)) < 1e-8);
  }
  assert.deepEqual(convexHull(points), indices);
});

test("hull safely rejects coplanar/collinear/duplicate-only sets", () => {
  assert.equal(convexHull([]), null);
  assert.equal(convexHull([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]), null);
  assert.equal(convexHull([[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]]), null);
  assert.equal(convexHull([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0.5, 0.5, 0]]), null);
});

test("point reduction is reproducible, well spread, bounded and duplicate tolerant", () => {
  const random = createStream(8, "points");
  const points = Array.from({ length: 300 }, () => random.unitVector());
  const reduced = simplifyHullPoints(points, 32);
  assert.equal(reduced.length, 32);
  assert.deepEqual(simplifyHullPoints(points, 32), reduced);
  for (const p of points) assert.ok(Math.min(...reduced.map(q => Math.hypot(...sub(p, q)))) < 0.55);
  assert.ok(convexHull(reduced));
  assert.deepEqual(simplifyHullPoints([[1, 2, 3], [1, 2, 3]], 32), [[1, 2, 3]]);
  assert.deepEqual(simplifyHullPoints(points, 0), []);
});
