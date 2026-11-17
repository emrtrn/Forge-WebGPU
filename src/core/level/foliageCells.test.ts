import { expect, test } from "vitest";
import { buildLevelFoliage, decodeFoliageCell, encodeFoliageCell, type FoliageInstances } from "./foliageCells.ts";
import { assetId, levelId } from "./testKit.ts";

const A = assetId("a"), B = assetId("b");
const Q = [0, 0.3826834, 0, 0.9238795] as const; // 45° about Y

function instances(n: number, offset = 0): FoliageInstances {
  return {
    positions: Float32Array.from({ length: n * 3 }, (_, index) => offset + index * 1.25),
    rotations: Float32Array.from({ length: n * 4 }, (_, index) => Q[index % 4]!),
    scales: Float32Array.from({ length: n }, (_, index) => 0.5 + index),
    seeds: Uint32Array.from({ length: n }, (_, index) => 0xfffffff0 + index),
  };
}

test("a cell file round-trips bit-exact at 36 bytes an instance", () => {
  const perType = [instances(3), instances(0), instances(2, 100)];
  const bytes = encodeFoliageCell(perType);
  expect(bytes.byteLength).toBe(16 + 4 * 3 + 36 * 5);
  expect(decodeFoliageCell(bytes, [3, 0, 2])).toEqual(perType);
  expect(decodeFoliageCell(bytes.buffer as ArrayBuffer)).toEqual(perType);
});

test("malformed cell files and index disagreements throw", () => {
  const good = encodeFoliageCell([instances(2)]);
  const patched = (write: (view: DataView) => void) => {
    const copy = good.slice();
    write(new DataView(copy.buffer));
    return copy;
  };
  expect(() => decodeFoliageCell(patched((v) => v.setUint32(0, 0, true)))).toThrow(/magic/);
  expect(() => decodeFoliageCell(patched((v) => v.setUint32(4, 2, true)))).toThrow(/version/);
  expect(() => decodeFoliageCell(good.slice(0, good.byteLength - 4))).toThrow(/bytes/);
  expect(() => decodeFoliageCell(patched((v) => v.setUint32(12, 3, true)))).toThrow(/add up/);
  expect(() => decodeFoliageCell(good, [1])).toThrow(/index/);
  expect(() => decodeFoliageCell(good, [2, 0])).toThrow(/index/);
  const positionsAt = 16 + 4;
  expect(() => decodeFoliageCell(patched((v) => v.setFloat32(positionsAt, Number.NaN, true)))).toThrow(/non-finite/);
  const scalesAt = positionsAt + 4 * (6 + 8);
  expect(() => decodeFoliageCell(patched((v) => v.setFloat32(scalesAt, 0, true)))).toThrow(/scale/);
  const rotationAt = positionsAt + 4 * 6;
  expect(() => decodeFoliageCell(patched((v) => v.setFloat32(rotationAt, 0.9, true)))).toThrow(/quaternion/);
});

test("instances go to the cell under their X / Z; a cell border belongs to the next cell", () => {
  const at = (x: number, z: number, seed: number) => ({ position: [x, 0, z] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number], scale: 1, seed });
  const { index, cells } = buildLevelFoliage({
    level: levelId("1"), cellSize: 128,
    groups: [
      { type: B, instances: [at(128, 0, 1), at(127.9, 0, 2)] },
      { type: A, instances: [at(-0.1, -0.1, 3)] },
      { type: B, instances: [at(130, 5, 4)] },
    ],
  });
  expect(index.types).toEqual([A, B]);
  expect(index.cells).toEqual([
    { key: "-1_-1", counts: [1, 0] },
    { key: "0_0", counts: [0, 1] },
    { key: "1_0", counts: [0, 2] },
  ]);
  const [, inOne] = decodeFoliageCell(cells.get("1_0")!, [0, 2]);
  expect(Array.from(inOne!.seeds)).toEqual([1, 4]);
});

test("the same input builds the same bytes; empty input builds nothing", () => {
  const input = {
    level: levelId("1"), cellSize: 64,
    groups: [{ type: A, instances: [{ position: [3, 2, 1] as [number, number, number], rotation: [...Q] as [number, number, number, number], scale: 1.5, seed: 7 }] }],
  };
  const first = buildLevelFoliage(input), second = buildLevelFoliage(input);
  expect(second.index).toEqual(first.index);
  expect([...second.cells]).toEqual([...first.cells]);
  const empty = buildLevelFoliage({ level: levelId("1"), cellSize: 64, groups: [{ type: A, instances: [] }] });
  expect(empty.index.types).toEqual([]);
  expect(empty.index.cells).toEqual([]);
  expect(empty.cells.size).toBe(0);
});
