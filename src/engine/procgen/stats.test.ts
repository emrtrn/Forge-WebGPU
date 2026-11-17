import assert from "node:assert/strict";
import { test } from "vitest";
import { MeshBuilder } from "./mesh.ts";
import { meshStats } from "./stats.ts";

test("tetrahedron has analytic surface area, closed edges and bounds; removing a face opens it", () => {
  const builder = new MeshBuilder();
  builder.addVertex([0, 0, 0]); builder.addVertex([1, 0, 0]);
  builder.addVertex([0, 1, 0]); builder.addVertex([0, 0, 1]);
  builder.addTriangle(0, 2, 1); builder.addTriangle(0, 1, 3);
  builder.addTriangle(0, 3, 2); builder.addTriangle(1, 2, 3);
  const mesh = builder.build(), stats = meshStats(mesh);
  assert.equal(stats.vertices, 4); assert.equal(stats.triangles, 4);
  assert.ok(stats.isClosed);
  assert.ok(Math.abs(stats.surfaceArea - (1.5 + Math.sqrt(3) / 2)) < 1e-12);
  assert.deepEqual(stats.bounds, { min: [0, 0, 0], max: [1, 1, 1] });
  mesh.indices = mesh.indices.slice(0, -3);
  assert.equal(meshStats(mesh).isClosed, false);
  assert.equal(meshStats(new MeshBuilder().build()).isClosed, false);
});
