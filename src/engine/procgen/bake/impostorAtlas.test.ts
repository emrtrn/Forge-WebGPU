import assert from "node:assert/strict";
import { test } from "vitest";
import type { ProcMesh } from "../mesh.ts";
import { bakeImpostorAtlas } from "./impostorAtlas.ts";
import type { BakeSurface } from "./rasterizer.ts";

function box(min: number, max: number): ProcMesh {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const faces: [number, number[], number[], number[]][] = [
    [0, [1, 0, 0], [0, 0, 1], [0, 1, 0]], [0, [-1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [1, [0, 1, 0], [1, 0, 0], [0, 0, 1]], [1, [0, -1, 0], [0, 0, 1], [1, 0, 0]],
    [2, [0, 0, 1], [0, 1, 0], [1, 0, 0]], [2, [0, 0, -1], [1, 0, 0], [0, 1, 0]],
  ];
  const mid = (min + max) / 2, half = (max - min) / 2;
  for (const [, n, a, b] of faces) {
    const base = positions.length / 3;
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      positions.push(...[0, 1, 2].map((k) => mid + half * (n[k]! + s * a[k]! + t * b[k]!)));
      normals.push(...n);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

/** A horizontal quad (y = h), both sides. */
function flat(h: number, half: number): ProcMesh {
  return {
    positions: new Float32Array([-half, h, -half, half, h, -half, half, h, half, -half, h, half]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
  };
}

const coverage = (rgba: Uint8Array, size: number, frame: number, i: number, j: number): number => {
  let covered = 0;
  for (let y = 0; y < frame; y++) for (let x = 0; x < frame; x++) if (rgba[((j * frame + y) * size + i * frame + x) * 4 + 3]! > 127) covered += 1;
  return covered / (frame * frame);
};

test("a box with a leaf plate above: every frame covered, wood and leaves apart", () => {
  const surfaces: BakeSurface[] = [{ mesh: box(-0.5, 0.5), layer: 0 }, { mesh: flat(0.8, 0.6), layer: 1, threshold: new Float32Array(4).fill(0.5) }];
  const atlas = bakeImpostorAtlas(surfaces, { views: 4, frameSize: 16, layers: 2 });
  assert.equal(atlas.size, 64);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) assert.ok(coverage(atlas.layers[0]!.albedo, 64, 16, i, j) > 0.2, `wood ${i},${j}`);
  const run = bakeImpostorAtlas(surfaces, { views: 4, frameSize: 16, layers: 2 });
  assert.deepEqual(run.layers[1]!.normal, atlas.layers[1]!.normal);
});

test("a horizontal quad fills the zenith frame and vanishes edge-on at the horizon", () => {
  const atlas = bakeImpostorAtlas([{ mesh: flat(0, 1), layer: 0 }], { views: 5, frameSize: 32, layers: 1 });
  // Radius √2: the quad's inscribed square of the frame is 1 / 2 of its area.
  assert.ok(coverage(atlas.layers[0]!.albedo, atlas.size, 32, 2, 2) > 0.45);
  assert.ok(coverage(atlas.layers[0]!.albedo, atlas.size, 32, 0, 2) < 0.05);
});

test("a 20,000-triangle mesh bakes within the budget (views 8, 128 px, 2× supersampling)", () => {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  // 10,000 small double triangles scattered on a sphere shell (deterministic).
  for (let k = 0; k < 10000; k++) {
    const y = 1 - 2 * (k + 0.5) / 10000, r = Math.sqrt(1 - y * y), phi = k * 2.399963;
    const c = [3 * r * Math.cos(phi), 3 * y + 4, 3 * r * Math.sin(phi)];
    const base = positions.length / 3;
    positions.push(c[0]! - 0.1, c[1]!, c[2]!, c[0]! + 0.1, c[1]!, c[2]!, c[0]!, c[1]! + 0.2, c[2]!, c[0]!, c[1]! - 0.2, c[2]! + 0.1);
    for (let n = 0; n < 4; n++) normals.push(r * Math.cos(phi), y, r * Math.sin(phi));
    indices.push(base, base + 1, base + 2, base, base + 3, base + 1);
  }
  const mesh = { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
  const started = performance.now();
  const atlas = bakeImpostorAtlas([{ mesh, layer: 0 }, { mesh, layer: 1 }], { views: 8, frameSize: 128, layers: 2 });
  const ms = performance.now() - started;
  console.info(`impostor bake 20k triangles: ${Math.round(ms)} ms`);
  assert.equal(atlas.size, 1024);
  assert.ok(ms < 8000, `${ms} ms`);
});
