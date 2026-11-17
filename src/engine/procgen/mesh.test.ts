import assert from "node:assert/strict";
import { test } from "vitest";
import { MeshBuilder, computeVertexNormals, meshBounds, validateMesh, weldVertices } from "./mesh.ts";

test("builder computes area-weighted normals, preserves linear RGBA, and returns independent arrays", () => {
  const builder = new MeshBuilder();
  builder.addVertex([0, 0, 0], undefined, [0.2, 0.4, 0.6, 1]);
  builder.addVertex([2, 0, 0]); builder.addVertex([0, 2, 0]); builder.addVertex([0, 0, 0.5]);
  builder.addTriangle(0, 1, 2); builder.addTriangle(0, 3, 1);
  const mesh = builder.build();
  assert.deepEqual(validateMesh(mesh), []);
  assert.ok(Math.abs(mesh.normals[1]! - 1 / Math.sqrt(17)) < 1e-6);
  assert.ok(Math.abs(mesh.normals[2]! - 4 / Math.sqrt(17)) < 1e-6);
  assert.equal(mesh.colors!.length, 16);
  assert.ok(Math.abs(mesh.colors![0]! - 0.2) < 1e-6);
  assert.deepEqual(meshBounds(mesh), { min: [0, 0, 0], max: [2, 2, 0.5] });
  mesh.positions[0] = 99;
  assert.equal(builder.build().positions[0], 0);
  assert.deepEqual(meshBounds({ positions: new Float32Array() }), { min: [0, 0, 0], max: [0, 0, 0] });
});

test("welding merges across spatial cell boundaries, keeps colors, and removes collapsed faces", () => {
  const builder = new MeshBuilder();
  for (const p of [[0.099, 0, 0], [1, 0, 0], [0, 1, 0], [0.101, 0, 0]] as [number, number, number][]) {
    builder.addVertex(p, undefined, [0.5, 0.25, 0, 1]);
  }
  builder.addTriangle(0, 1, 2); builder.addTriangle(0, 3, 1);
  const mesh = weldVertices(builder.build(), 0.01);
  assert.equal(mesh.positions.length / 3, 3);
  assert.equal(mesh.indices.length / 3, 1);
  assert.equal(mesh.colors!.length, 12);
  assert.deepEqual(validateMesh(mesh), []);
  assert.equal(weldVertices(builder.build(), 0).positions.length / 3, 4);
});

test("validation reports invalid indices, non-finite channels, degeneracy and non-unit normals", () => {
  const builder = new MeshBuilder();
  builder.addVertex([0, 0, 0]); builder.addVertex([1, 0, 0]); builder.addVertex([0, 1, 0]);
  builder.addTriangle(0, 1, 2);
  const mesh = builder.build();
  mesh.indices[0] = 100;
  assert.ok(validateMesh(mesh).includes("index out of range"));
  mesh.indices[0] = 1;
  assert.ok(validateMesh(mesh).includes("degenerate triangles: 1"));
  mesh.positions[0] = NaN; mesh.normals[0] = 2;
  const errors = validateMesh(mesh);
  assert.ok(errors.includes("positions contains NaN or Infinity"));
  assert.ok(errors.some(error => error.startsWith("non-unit normals:")));
  mesh.indices[0] = 0; mesh.positions[0] = 0;
  computeVertexNormals(mesh);
  assert.deepEqual(validateMesh(mesh), []);
});
