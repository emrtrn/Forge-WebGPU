import assert from "node:assert/strict";
import { test } from "vitest";
import type { ProcMesh } from "../mesh.ts";
import type { Vec3 } from "../vector.ts";
import { dilate, octDecode, octEncode, rasterize, type BakeCamera, type BakeSurface } from "./rasterizer.ts";

// Looking down -z from +z: image x = +x, image y = +y; a 2 × 2 m view at the origin.
const CAMERA: BakeCamera = { center: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1], halfWidth: 1, halfHeight: 1, halfDepth: 1 };

/** A quad x0..x1, y0..y1 at depth z (toward the camera = larger z), CCW seen from +z. */
function quad(x0: number, x1: number, y0: number, y1: number, z = 0, normal: Vec3 = [0, 0, 1]): ProcMesh {
  return {
    positions: new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]),
    normals: new Float32Array([...normal, ...normal, ...normal, ...normal]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

const alphaAt = (rgba: Uint8Array, width: number, x: number, y: number): number => rgba[(y * width + x) * 4 + 3]!;

test("a quad over the left half covers exactly the left half: no gaps, nothing twice", () => {
  const [layer] = rasterize([{ mesh: quad(-1, 0, -1, 1), layer: 0 }], CAMERA, { width: 8, height: 8, layers: 1, supersample: 1 });
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) assert.equal(alphaAt(layer!.albedo, 8, x, y), x < 4 ? 255 : 0, `${x},${y}`);
  // Two halves sharing the diagonal and the middle edge: every sample exactly once (full coverage, no overflow).
  const surfaces: BakeSurface[] = [{ mesh: quad(-1, 0, -1, 1), layer: 0 }, { mesh: quad(0, 1, -1, 1), layer: 0 }];
  const [full] = rasterize(surfaces, CAMERA, { width: 7, height: 5, layers: 1, supersample: 3 });
  for (let i = 3; i < full!.albedo.length; i += 4) assert.equal(full!.albedo[i], 255);
});

test("the alpha test discards a texture's transparent half", () => {
  const rgba = new Uint8Array(2 * 1 * 4);
  rgba.set([200, 100, 50, 255, 0, 0, 0, 0]);
  const mesh = quad(-1, 1, -1, 1);
  // u along x; nearest-like sampling far from the texel boundary.
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const [layer] = rasterize([{ mesh, uvs, texture: { width: 2, height: 1, rgba }, layer: 0 }], CAMERA, { width: 16, height: 4, layers: 1, supersample: 1 });
  assert.equal(alphaAt(layer!.albedo, 16, 1, 1), 255);
  assert.deepEqual([...layer!.albedo.subarray((1 * 16 + 1) * 4, (1 * 16 + 1) * 4 + 3)], [200, 100, 50]);
  assert.equal(alphaAt(layer!.albedo, 16, 14, 1), 0);
});

test("layers keep their own depth; extra is the min of front and hidden fragments", () => {
  const wood = quad(-1, 1, -1, 1, -0.5);
  const front = quad(-1, 1, -1, 1, 0.5), behind = quad(-1, 1, -1, 1, 0);
  const surfaces: BakeSurface[] = [
    { mesh: wood, layer: 0, color: [0.5, 0.25, 0] },
    { mesh: front, layer: 1, threshold: new Float32Array([0.8, 0.8, 0.8, 0.8]) },
    { mesh: behind, layer: 1, threshold: new Float32Array([0.2, 0.2, 0.2, 0.2]), color: [0, 1, 0] },
  ];
  const [w, l] = rasterize(surfaces, CAMERA, { width: 4, height: 4, layers: 2, supersample: 1 });
  assert.equal(alphaAt(w!.albedo, 4, 1, 1), 255);
  assert.deepEqual([...w!.albedo.subarray(0, 3)], [128, 64, 0]);
  // The front leaf wins the colour (white); the hidden one still lowers the threshold (the pixel stays leafy while it remains).
  assert.deepEqual([...l!.albedo.subarray(0, 3)], [255, 255, 255]);
  assert.equal(l!.normal[3], Math.round(0.2 * 255));
  // Depth: the front quad at +0.5 toward the camera maps near 0.25.
  assert.equal(l!.normal[2], Math.round(0.25 * 255));
});

test("double-sided back faces flip their normal toward the camera; single-sided ones are culled", () => {
  const back: ProcMesh = { ...quad(-1, 1, -1, 1, 0, [0, 0, -1]), indices: new Uint32Array([0, 2, 1, 0, 3, 2]) };
  const [two] = rasterize([{ mesh: back, layer: 0 }], CAMERA, { width: 2, height: 2, layers: 1, supersample: 1 });
  const n = octDecode(two!.normal[0]! / 255, two!.normal[1]! / 255);
  assert.ok(n[2] > 0.95, `normal ${n}`);
  const [one] = rasterize([{ mesh: back, layer: 0, doubleSided: false }], CAMERA, { width: 2, height: 2, layers: 1, supersample: 1 });
  assert.ok(one!.albedo.every((value) => value === 0));
});

test("octahedral encoding round trips", () => {
  for (let i = 0; i < 200; i++) {
    const z = 1 - 2 * (i + 0.5) / 200, r = Math.sqrt(1 - z * z), phi = i * 2.399963;
    const n: Vec3 = [r * Math.cos(phi), r * Math.sin(phi), z];
    const back = octDecode(...octEncode(n));
    assert.ok(Math.hypot(back[0] - n[0], back[1] - n[1], back[2] - n[2]) < 0.01, `${n}`);
  }
});

test("supersampling gives partial coverage on an edge, the same bytes every run", () => {
  const tri: ProcMesh = { positions: new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0]), normals: new Float32Array(9).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), indices: new Uint32Array([0, 1, 2]) };
  const run = () => rasterize([{ mesh: tri, layer: 0 }], CAMERA, { width: 8, height: 8, layers: 1, supersample: 4 })[0]!;
  const a = run(), b = run();
  assert.deepEqual(a.albedo, b.albedo);
  assert.deepEqual(a.normal, b.normal);
  const partial = [...Array(64).keys()].map((p) => a.albedo[p * 4 + 3]!).filter((value) => value > 0 && value < 255);
  assert.ok(partial.length >= 6, `${partial.length} partial pixels`);
});

test("dilate fills neighbours and leaves covered pixels alone", () => {
  const [layer] = rasterize([{ mesh: quad(-1, 0, -1, 1), layer: 0, color: [1, 0, 0] }], CAMERA, { width: 8, height: 8, layers: 1, supersample: 1 });
  const before = Uint8Array.from(layer!.albedo);
  dilate(layer!, 8, 8, 2);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
    const k = (y * 8 + x) * 4;
    assert.deepEqual([...layer!.albedo.subarray(k, k + 4)], [...before.subarray(k, k + 4)]);
  }
  const k = (3 * 8 + 4) * 4;
  assert.deepEqual([...layer!.albedo.subarray(k, k + 4)], [255, 0, 0, 0]);
  assert.equal(layer!.albedo[(3 * 8 + 7) * 4], 0, "beyond two rings stays empty");
});
