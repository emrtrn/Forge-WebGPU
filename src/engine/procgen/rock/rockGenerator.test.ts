import assert from "node:assert/strict";
import { test } from "vitest";
import { generateRock } from "./rockGenerator.ts";
import { validateMesh } from "../mesh.ts";
import type { ProcMesh } from "../mesh.ts";
import { meshStats } from "../stats.ts";
import { cross, dot, pointAt, sub, unit } from "../vector.ts";
import type { Vec3 } from "../vector.ts";

function rock(params: Record<string, unknown> = {}) {
  const result = generateRock(params);
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}
function bytes(array: Float32Array | Uint32Array): Uint8Array {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}
function sameMesh(a: ProcMesh, b: ProcMesh): void {
  for (const key of ["positions", "normals", "indices", "colors"] as const) {
    assert.ok(a[key] && b[key]);
    assert.deepEqual(bytes(a[key]), bytes(b[key]), key);
  }
}
function assertColliderContains(result: ReturnType<typeof rock>): void {
  const { points, indices } = result.collider;
  assert.ok(points.length / 3 <= 32);
  assert.ok(indices.length > 0);
  const colliderMesh = { positions: points, normals: new Float32Array(points.length), indices };
  assert.ok(meshStats(colliderMesh).isClosed);
  const tolerance = Math.max(...result.stats[0]!.bounds.max.map((v, i) => v - result.stats[0]!.bounds.min[i]!)) * 1e-5;
  for (let i = 0; i < indices.length; i += 3) {
    const a = pointAt(points, indices[i]!);
    const normal = unit(cross(sub(pointAt(points, indices[i + 1]!), a), sub(pointAt(points, indices[i + 2]!), a)));
    for (let v = 0; v < result.lods[0]!.positions.length / 3; v++) {
      assert.ok(dot(normal, sub(pointAt(result.lods[0]!.positions, v), a)) <= tolerance, `outside collider face ${i / 3}`);
    }
  }
}

// Independent ray/triangle intersection queries the actual LOD0 surface.
function rayDistance(mesh: ProcMesh, origin: Vec3, direction: Vec3): number {
  let nearest = Infinity;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = pointAt(mesh.positions, mesh.indices[i]!);
    const e1 = sub(pointAt(mesh.positions, mesh.indices[i + 1]!), a);
    const e2 = sub(pointAt(mesh.positions, mesh.indices[i + 2]!), a);
    const h = cross(direction, e2), determinant = dot(e1, h);
    if (Math.abs(determinant) < 1e-12) continue;
    const s = sub(origin, a), u = dot(s, h) / determinant;
    const q = cross(s, e1), v = dot(direction, q) / determinant;
    const t = dot(e2, q) / determinant;
    if (u >= -1e-5 && v >= -1e-5 && u + v <= 1 + 1e-5 && t > 0) nearest = Math.min(nearest, t);
  }
  return nearest;
}

for (const shape of ["rounded", "angular"] as const) {
  test(`${shape}: identical recipes produce byte-identical meshes/colliders, seeds change geometry`, () => {
    const a = rock({ shape }), b = rock({ shape }), changed = rock({ shape, seed: 2 });
    a.lods.forEach((mesh, i) => sameMesh(mesh, b.lods[i]!));
    assert.deepEqual(bytes(a.collider.points), bytes(b.collider.points));
    assert.deepEqual(bytes(a.collider.indices), bytes(b.collider.indices));
    assert.notDeepEqual(bytes(a.lods[0]!.positions), bytes(changed.lods[0]!.positions));
    // Removing/adding an LOD cannot alter existing output or shape streams.
    const sparse = rock({ shape, lods: [3, 1] });
    sameMesh(a.lods[0]!, sparse.lods[0]!); sameMesh(a.lods[2]!, sparse.lods[1]!);
    assert.deepEqual(bytes(a.collider.points), bytes(sparse.collider.points));
  });

  test(`${shape}: default meshes are valid/closed, decrease in complexity, and obey plan triangle budgets`, () => {
    const result = rock({ shape });
    for (let i = 0; i < result.lods.length; i++) {
      const mesh = result.lods[i]!, stats = result.stats[i]!;
      assert.deepEqual(validateMesh(mesh), []);
      assert.ok(stats.isClosed);
      assert.ok(stats.surfaceArea > 0);
      assert.ok(stats.triangles <= [3000, 600, 120][i]!);
      if (i) {
        assert.ok(stats.vertices < result.stats[i - 1]!.vertices);
        assert.ok(stats.triangles < result.stats[i - 1]!.triangles);
      }
      const colors = mesh.colors!;
      assert.equal(colors.length, stats.vertices * 4);
      for (let c = 0; c < colors.length; c++) {
        assert.ok(colors[c]! >= 0 && colors[c]! <= 1);
        if (c % 4 === 3) assert.equal(colors[c], 1);
        if (c % 4 === 1) assert.ok(Math.abs(colors[c]! - Math.max(0, mesh.normals[(c - 1) / 4 * 3 + 1]!)) < 1e-6);
      }
    }
    assertColliderContains(result);
  });

  test(`${shape}: LOD1 vertices intersect the same LOD0 radial surface within 0.2% of size`, () => {
    const result = rock({ shape, flattenBottom: 0 });
    const origin: Vec3 = [0, 0.65 - 0.05, 0];
    for (let i = 0; i < result.stats[1]!.vertices; i++) {
      const ray = sub(pointAt(result.lods[1]!.positions, i), origin);
      const distance = rayDistance(result.lods[0]!, origin, unit(ray));
      assert.ok(Number.isFinite(distance));
      assert.ok(Math.abs(distance - Math.hypot(...ray)) < 0.004);
    }
  });

  test(`${shape}: full flattening creates a planar underside at embedding depth and approximate requested dimensions`, () => {
    const result = rock({ shape, size: [4, 3, 2], flattenBottom: 1, embedDepth: 0.2 });
    for (let lod = 0; lod < result.lods.length; lod++) {
      const mesh = result.lods[lod]!, bounds = result.stats[lod]!.bounds;
      assert.deepEqual(validateMesh(mesh), []);
      assert.ok(Math.abs(bounds.min[1] + 0.2) < 1e-6);
      let flatFaces = 0;
      for (let i = 0; i < mesh.indices.length; i += 3) {
        if ([0, 1, 2].every(k => Math.abs(mesh.positions[mesh.indices[i + k]! * 3 + 1]! + 0.2) < 1e-6)) flatFaces++;
      }
      assert.ok(flatFaces > 0);
      for (let axis = 0; axis < 3; axis++) {
        const ratio = (bounds.max[axis]! - bounds.min[axis]!) / [4, 3, 2][axis]!;
        assert.ok(ratio > 0.65 && ratio < 1.15, `dimension ratio ${ratio}`);
      }
    }
    assertColliderContains(result);
  });
}

test("collider containment and valid surfaces survive seeds, anisotropy, cuts and full noise", () => {
  for (let seed = 0; seed < 6; seed++) {
    const result = rock({ seed, shape: seed % 2 ? "angular" : "rounded", size: [0.1, 4, 1],
      cuts: 64, noiseAmplitude: 0.35, noiseOctaves: 8, flattenBottom: seed % 2, lods: [2, 0] });
    result.lods.forEach(mesh => assert.deepEqual(validateMesh(mesh), []));
    assertColliderContains(result);
  }
});

test("over-budget LODs report before allocation, including explicit lower caps", () => {
  const result = generateRock({ lods: [16, 2] });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.report.code, "vertex-budget");
    assert.equal(result.report.lod, 0);
    assert.equal(result.report.vertexCap, 20000);
    assert.ok(result.report.requestedVertices! > 20000);
  }
  assert.equal(generateRock({ lods: [6] }).ok, false);
  assert.equal(generateRock({}, { vertexCap: 100 }).ok, false);
});

test("default generation completes within 200 ms in Node for both shapes", () => {
  for (const shape of ["rounded", "angular"]) {
    const start = performance.now();
    const result = generateRock({ shape });
    const elapsed = performance.now() - start;
    assert.ok(result.ok);
    assert.ok(elapsed < 200, `${shape}: ${elapsed.toFixed(2)} ms`);
  }
});
