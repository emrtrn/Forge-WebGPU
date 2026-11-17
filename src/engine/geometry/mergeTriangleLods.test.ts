import { test } from "vitest";
import assert from "node:assert/strict";
import { mergeTriangleLods, type TriangleLodPiece } from "./mergeTriangleLods.ts";
import { TRIANGLE_VERSION, type TriangleData } from "./triangleData.ts";

function data(lods: TriangleData["lods"]): TriangleData {
  return { version: TRIANGLE_VERSION, key: "source", lods };
}

function piece(lods: TriangleData["lods"], overrides: Partial<TriangleLodPiece> = {}): TriangleLodPiece {
  return { data: data(lods), vertexOffset: 0, vertexCount: 4, flip: false, scale: 1, ...overrides };
}

function triangles(count: number): number[] {
  return Array.from({ length: count * 3 }, (_, i) => i % 3);
}

test("LOD0 concatenates pieces in order with vertex offsets and the caller's identity", () => {
  const result = mergeTriangleLods([
    piece([{ indices: [2, 0, 1, 1, 3, 2], error: 0 }], { vertexOffset: 5 }),
    piece([{ indices: [0, 2, 3], error: 0 }], { vertexOffset: 9 }),
  ], "merged");
  assert.deepStrictEqual(result, {
    version: TRIANGLE_VERSION, key: "merged",
    lods: [{ indices: [7, 5, 6, 6, 8, 7, 9, 11, 12], error: 0 }],
  });
  assert.ok(Array.isArray(result.lods[0]!.indices));
});

test("mirrored pieces flip every triangle at every level and input groups are omitted", () => {
  const source = [
    { indices: [0, 1, 2, 1, 3, 2], error: 0, groups: [{ start: 0, count: 6, materialIndex: 7 }] },
    { indices: [1, 3, 2], error: 1, groups: [{ start: 0, count: 3, materialIndex: 8 }] },
  ];
  const result = mergeTriangleLods([
    piece(source, { vertexOffset: 4, flip: true }),
    piece(source, { vertexOffset: 8 }),
  ], "flipped");
  assert.deepStrictEqual(result.lods, [
    { indices: [4, 6, 5, 5, 6, 7, 8, 9, 10, 9, 11, 10], error: 0 },
    { indices: [5, 6, 7, 9, 11, 10], error: 1 },
  ]);
  for (const lod of result.lods) assert.equal(Object.hasOwn(lod, "groups"), false);
});

test("shorter chains retain their last level and errors use the largest scaled error", () => {
  const result = mergeTriangleLods([
    piece([
      { indices: triangles(8), error: 0 },
      { indices: triangles(4), error: 2 },
      { indices: [1, 2, 3], error: 6 },
    ], { scale: 2 }),
    piece([
      { indices: triangles(4), error: 0 },
      { indices: [0, 2, 3], error: 3 },
    ], { vertexOffset: 4, scale: 3 }),
  ], "unequal");
  assert.deepStrictEqual(result.lods, [
    { indices: [...triangles(8), ...triangles(4).map((i) => i + 4)], error: 0 },
    { indices: [...triangles(4), 4, 6, 7], error: 9 },
    { indices: [1, 2, 3, 4, 6, 7], error: 12 },
  ]);
  for (let i = 1; i < result.lods.length; i += 1) {
    assert.ok(result.lods[i]!.error >= result.lods[i - 1]!.error);
  }
});

test("the 0.85 threshold is inclusive and skips compare against the last kept level", () => {
  const result = mergeTriangleLods([
    piece([10, 9, 7, 5, 4].map((count, error) => ({ indices: triangles(count), error }))),
    piece([{ indices: triangles(10), error: 0 }], { vertexOffset: 4 }),
  ], "threshold");
  assert.deepStrictEqual(result.lods.map((lod) => lod.indices.length), [60, 51, 42]);
  assert.deepStrictEqual(result.lods.map((lod) => lod.error), [0, 2, 4]);
});

test("merging is deterministic and leaves all input data unchanged", () => {
  const pieces = [piece([
    { indices: [0, 1, 2, 1, 3, 2], error: 0, groups: [{ start: 0, count: 6, materialIndex: 2 }] },
    { indices: [1, 3, 2], error: 2 },
  ], { vertexOffset: 7, flip: true, scale: 3 })];
  const before = structuredClone(pieces);
  const first = mergeTriangleLods(pieces, "stable");
  assert.deepStrictEqual(first, mergeTriangleLods(pieces, "stable"));
  assert.deepStrictEqual(pieces, before);
  assert.notStrictEqual(first.lods[0]!.indices, pieces[0]!.data.lods[0]!.indices);
});

const valid = piece([{ indices: [0, 1, 2], error: 0 }]);
const invalidCases: { name: string; pieces: readonly TriangleLodPiece[] }[] = [
  { name: "empty pieces", pieces: [] },
  { name: "zero LODs", pieces: [piece([])] },
  { name: "wrong version", pieces: [{ ...valid, data: { ...valid.data, version: "old" as typeof TRIANGLE_VERSION } }] },
];
for (const field of ["vertexOffset", "vertexCount"] as const) {
  for (const value of [-1, 1.5, NaN, Infinity, -Infinity]) {
    invalidCases.push({ name: `${field} ${value}`, pieces: [{ ...valid, [field]: value }] });
  }
}
for (const scale of [0, -1, NaN, Infinity, -Infinity]) {
  invalidCases.push({ name: `scale ${scale}`, pieces: [{ ...valid, scale }] });
}
for (const indices of [[0], [0, 1], [0, 1, -1], [0, 1, 4], [0, 1, 1.5], [0, 1, NaN], [0, 1, Infinity]]) {
  // A later candidate that would be skipped must still be validated.
  invalidCases.push({ name: `invalid later indices ${indices}`, pieces: [piece([
    { indices: [0, 1, 2], error: 0 }, { indices, error: 1 },
  ])] });
}
invalidCases.push({ name: "index into zero vertices", pieces: [{ ...valid, vertexCount: 0 }] });
for (const invalid of invalidCases) {
  test(`rejects ${invalid.name}`, () => {
    assert.throws(() => mergeTriangleLods(invalid.pieces, "invalid"), (error: unknown) =>
      error instanceof Error && error.message.startsWith("triangles:"));
  });
}
