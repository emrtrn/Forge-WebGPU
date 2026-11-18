import { test } from "vitest";
import assert from "node:assert/strict";
import type { LevelFoliageIndex } from "../../core/level/foliage.ts";
import type { FoliageInstances } from "../../core/level/foliageCells.ts";
import { PaintedFoliageStreaming } from "./paintedFoliageStreaming.ts";

const ORIGIN = [0, 0] as const;
const DISTANT = [1024, 0] as const;
const GRID = { cellSize: 64, loadRange: 128 };

const INDEX: LevelFoliageIndex = {
  schema: "forge.levelFoliage/1",
  level: "lvl_00000000000000000000000000000001",
  cellSize: GRID.cellSize,
  types: ["ast_00000000000000000000000000000001", "ast_00000000000000000000000000000002"],
  cells: [
    { key: "0_0", counts: [1, 2] },
    { key: "1_0", counts: [0, 1] },
    { key: "2_0", counts: [1, 0] },
    { key: "3_0", counts: [1, 0] },
    { key: "4_0", counts: [0, 1] },
    { key: "15_0", counts: [1, 0] },
    { key: "16_0", counts: [1, 0] },
    { key: "17_0", counts: [1, 0] },
  ],
};

function instances(count: number, x: number, seed: number): FoliageInstances {
  const positions = new Float32Array(3 * count);
  const rotations = new Float32Array(4 * count);
  const scales = new Float32Array(count);
  const seeds = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = x + i;
    rotations[i * 4 + 3] = 1;
    scales[i] = 1;
    seeds[i] = seed + i;
  }
  return { positions, rotations, scales, seeds };
}

function cellData(key: string): readonly FoliageInstances[] {
  const x = parseInt(key, 10) * GRID.cellSize;
  return INDEX.cells.find((cell) => cell.key === key)!.counts.map((count, type) =>
    instances(count, x, 10 * (type + 1)));
}

function deferredCell() {
  let resolve!: (data: readonly FoliageInstances[]) => void;
  const promise = new Promise<readonly FoliageInstances[]>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

function fixture(fetchCell = (key: string) => Promise.resolve(cellData(key))) {
  const fetched: string[] = [];
  const added: { key: string; types: readonly string[]; perType: readonly FoliageInstances[] }[] = [];
  const removed: string[] = [];
  const warnings: string[] = [];
  const stream = new PaintedFoliageStreaming({
    index: INDEX,
    grid: GRID,
    fetchCell(key) {
      fetched.push(key);
      return fetchCell(key);
    },
    sink: {
      addCell(key, types, perType) {
        added.push({ key, types, perType });
        return perType.reduce((count, data) => count + data.scales.length, 0);
      },
      removeCell(key) {
        removed.push(key);
      },
    },
    warn: (message) => warnings.push(message),
  });
  return { stream, fetched, added, removed, warnings };
}

test("prepare prefetches the ring and activates the load range in type order", async () => {
  const outer = deferredCell();
  const { stream, fetched, added } = fixture((key) => key === "3_0" ? outer.promise : Promise.resolve(cellData(key)));

  await stream.prepare(ORIGIN);

  assert.deepEqual(fetched, ["0_0", "1_0", "2_0", "3_0"]);
  assert.deepEqual(added.map(({ key }) => key), ["0_0", "1_0", "2_0"]);
  assert.deepEqual(added[0], {
    key: "0_0", types: INDEX.types, perType: [instances(1, 0, 10), instances(2, 0, 20)],
  });
  assert.deepEqual(added[1], {
    key: "1_0", types: INDEX.types, perType: [instances(0, 64, 10), instances(1, 64, 20)],
  });
  assert.deepEqual(stream.snapshot(), { activeCells: 3, totalCells: 8, fetchedCells: 3, instances: 5, fetching: 1 });

  outer.resolve(cellData("3_0"));
  await outer.promise;
  assert.deepEqual(stream.snapshot(), { activeCells: 3, totalCells: 8, fetchedCells: 4, instances: 5, fetching: 0 });
});

test("update retains cells through hysteresis and budgets two activations per frame", async () => {
  const { stream, added, removed } = fixture();
  await stream.prepare(ORIGIN);

  stream.update([0, -160]);
  assert.deepEqual(removed, ["1_0", "2_0"]);
  assert.equal(stream.snapshot().activeCells, 1);

  stream.update([0, -161]);
  assert.deepEqual(removed, ["1_0", "2_0", "0_0"]);

  stream.update(DISTANT);
  assert.equal(stream.snapshot().activeCells, 0);
  await Promise.resolve();

  stream.update(DISTANT);
  assert.deepEqual(added.slice(3).map(({ key }) => key), ["15_0", "16_0"]);
  assert.equal(stream.snapshot().activeCells, 2);

  stream.update(DISTANT);
  assert.deepEqual(added.slice(3).map(({ key }) => key), ["15_0", "16_0", "17_0"]);
  assert.equal(stream.snapshot().activeCells, 3);
});

test("leaving the prefetch ring drops an in-flight cell and ignores its late answer", async () => {
  const old = deferredCell();
  const current = deferredCell();
  const pending = [old, current];
  const { stream, fetched, added } = fixture((key) => key === "0_0"
    ? pending.shift()!.promise
    : Promise.resolve(cellData(key)));

  stream.update(ORIGIN);
  await Promise.resolve();
  assert.equal(stream.snapshot().fetching, 1);

  stream.update([0, -241]);
  assert.equal(stream.snapshot().fetching, 0);
  stream.update(ORIGIN);
  assert.equal(fetched.filter((key) => key === "0_0").length, 2);

  old.resolve(cellData("0_0"));
  await old.promise;
  stream.update(ORIGIN);
  assert.equal(stream.snapshot().fetching, 1);
  assert.ok(added.every(({ key }) => key !== "0_0"));

  current.resolve(cellData("0_0"));
  await current.promise;
  stream.update(ORIGIN);
  assert.equal(added.filter(({ key }) => key === "0_0").length, 1);
});

test("a rejected fetch warns once and activates an empty cell without retrying", async () => {
  const { stream, fetched, added, warnings } = fixture((key) => key === "0_0"
    ? Promise.reject(new Error("file missing"))
    : Promise.resolve(cellData(key)));

  await stream.prepare(ORIGIN);
  stream.update(ORIGIN);
  stream.update(ORIGIN);

  assert.equal(fetched.filter((key) => key === "0_0").length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /0_0.*file missing/);
  assert.deepEqual(added.filter(({ key }) => key === "0_0"), [{
    key: "0_0", types: INDEX.types, perType: [instances(0, 0, 0), instances(0, 0, 0)],
  }]);
  assert.deepEqual(stream.snapshot(), { activeCells: 3, totalCells: 8, fetchedCells: 4, instances: 2, fetching: 0 });
});

test("fetching counts in-flight cells while prepare waits for the load range", async () => {
  const inner = deferredCell();
  const { stream, added } = fixture((key) => key === "0_0" ? inner.promise : Promise.resolve(cellData(key)));

  const prepared = stream.prepare(ORIGIN);
  assert.equal(stream.snapshot().fetching, 4);
  await Promise.resolve();
  assert.equal(stream.snapshot().fetching, 1);
  assert.equal(added.length, 0);

  inner.resolve(cellData("0_0"));
  await prepared;
  assert.equal(stream.snapshot().fetching, 0);
  assert.equal(added.length, 3);
});

test("dispose removes every live cell and ignores later fetch answers", async () => {
  const outer = deferredCell();
  const { stream, added, fetched, removed } = fixture((key) => key === "3_0" ? outer.promise : Promise.resolve(cellData(key)));

  await stream.prepare(ORIGIN);
  assert.equal(stream.snapshot().fetching, 1);
  stream.dispose();

  assert.deepEqual(removed, ["0_0", "1_0", "2_0"]);
  outer.resolve(cellData("3_0"));
  await outer.promise;
  stream.update([192, 0]);
  await stream.prepare([192, 0]);
  stream.dispose();

  assert.deepEqual(fetched, ["0_0", "1_0", "2_0", "3_0"]);
  assert.deepEqual(added.map(({ key }) => key), removed);
  assert.deepEqual(stream.snapshot(), { activeCells: 0, totalCells: 8, fetchedCells: 0, instances: 0, fetching: 0 });
});
