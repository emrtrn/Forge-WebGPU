import assert from "node:assert/strict";
import { test } from "vitest";
import type { AssetId, LevelId } from "../../core/id.ts";
import { buildLevelFoliage, decodeFoliageCell, type FoliageInstances } from "../../core/level/foliageCells.ts";
import type { PaintedFoliageInstance } from "./foliagePaint.ts";
import { FoliagePaintSession, mergeFoliagePatches, unpackFoliage } from "./foliagePaintSession.ts";

const LEVEL = `lvl_${"1".repeat(32)}` as LevelId;
const GRASS = `ast_${"a".repeat(32)}` as AssetId;
const TREE = `ast_${"b".repeat(32)}` as AssetId;
const at = (x: number, z: number, seed = 1): PaintedFoliageInstance => ({ position: [x, 0, z], rotation: [0, 0, 0, 1], scale: 1, seed });

/** Grass in 0_0 (two) and 1_0 (one) on disk, 100 m cells. */
function disk() {
  const { index, cells } = buildLevelFoliage({ level: LEVEL, cellSize: 100, groups: [{ type: GRASS, instances: [at(10, 10, 1), at(20, 20, 2), at(150, 10, 3)] }] });
  const read = (key: string): FoliageInstances[] => decodeFoliageCell(cells.get(key)!);
  return { index, read };
}
function opened() {
  const { index, read } = disk();
  const session = new FoliagePaintSession({ level: LEVEL, cellSize: 64, index });
  return { session, read, load: (...keys: string[]) => keys.forEach((key) => session.load(key, read(key))) };
}
const grassIn = (session: FoliagePaintSession, key: string): readonly PaintedFoliageInstance[] => session.instances(key).get(GRASS) ?? [];

test("a new level: adding across a cell border, negative cells, undo and redo", () => {
  const session = new FoliagePaintSession({ level: LEVEL, cellSize: 100, index: null });
  assert.equal(session.loaded("5_5"), true);
  const patches = session.adding(GRASS, [at(99, 1), at(100, 1), at(-1, -1)]);
  assert.equal(session.dirty, false, "patches are not applied by themselves");
  assert.deepEqual(session.apply(patches, "after").sort(), ["-1_-1", "0_0", "1_0"]);
  assert.deepEqual([session.dirty, session.count(GRASS), session.types()], [true, 3, [GRASS]]);
  session.apply(patches, "before");
  assert.deepEqual([session.dirty, session.count(GRASS), session.capture()], [false, 0, null]);
  session.apply(patches, "after");
  const capture = session.capture()!;
  assert.deepEqual(capture.index!.cells, [{ key: "-1_-1", counts: [1] }, { key: "0_0", counts: [1] }, { key: "1_0", counts: [1] }]);
  assert.deepEqual([capture.index!.cellSize, capture.deletes], [100, []]);
  assert.deepEqual(unpackFoliage(decodeFoliageCell(capture.cells.get("1_0")!)[0]!), [at(100, 1)]);
  assert.deepEqual(session.capture(), capture);
});

test("a listed cell must be loaded to change; the index's cell size wins; counts mix files and memory", () => {
  const { session, load } = opened();
  assert.equal(session.cellSize, 100);
  assert.deepEqual(session.missing({ minX: 0, minZ: 0, maxX: 250, maxZ: 50 }), ["0_0", "1_0"]);
  assert.throws(() => session.adding(GRASS, [at(5, 5)]), /not loaded/);
  load("0_0");
  load("0_0");
  assert.deepEqual(session.missing({ minX: 0, minZ: 0, maxX: 250, maxZ: 50 }), ["1_0"]);
  session.apply(session.adding(GRASS, [at(5, 5)]), "after");
  assert.deepEqual([session.count(GRASS), session.count(TREE)], [4, 0]);
  assert.deepEqual([session.edited(), session.dirtyCells(), session.missingForSave()], [["0_0"], ["0_0"], []]);
  const capture = session.capture()!;
  assert.deepEqual([...capture.cells.keys()], ["0_0"]);
  assert.deepEqual(capture.index!.cells, [{ key: "0_0", counts: [3] }, { key: "1_0", counts: [1] }]);
});

test("removing and replacing; a replacement may land in another cell", () => {
  const { session, load } = opened();
  load("0_0", "1_0");
  const [first, second] = grassIn(session, "0_0");
  const removing = session.removing(GRASS, new Set([first!]));
  session.apply(removing, "after");
  assert.deepEqual(grassIn(session, "0_0"), [second]);
  const there = at(160, 20, 7), here = at(21, 21, 8);
  const inPlace = session.replacing(GRASS, new Map([[second!, here]]));
  session.apply(inPlace, "after");
  assert.deepEqual(grassIn(session, "0_0"), [here]);
  const across = session.replacing(GRASS, new Map([[here, there]]));
  session.apply(across, "after");
  assert.deepEqual([grassIn(session, "0_0").length, grassIn(session, "1_0").map((one) => one.seed)], [0, [3, 7]]);
  for (const patches of [across, inPlace, removing]) session.apply(patches, "before");
  assert.equal(session.dirty, false);
  assert.deepEqual(grassIn(session, "0_0"), [first, second]);
});

test("apply refuses a state the edit did not leave, changing nothing", () => {
  const { session, load } = opened();
  load("0_0", "1_0");
  const add = [...session.adding(GRASS, [at(1, 1), at(101, 1)])];
  session.apply(add, "after");
  const more = session.adding(GRASS, [at(102, 2)]);
  session.apply(more, "after");
  assert.throws(() => session.apply(add, "before"), /not as the edit left it/);
  assert.deepEqual([grassIn(session, "0_0").length, grassIn(session, "1_0").length], [3, 3]);
});

test("a new type rewrites every listed cell, which must be loaded; types ascend", () => {
  const { session, load } = opened();
  load("0_0");
  session.apply(session.adding(TREE, [at(50, 50)]), "after");
  assert.deepEqual(session.missingForSave(), ["1_0"]);
  assert.throws(() => session.capture(), /1_0/);
  load("1_0");
  const capture = session.capture()!;
  assert.deepEqual(capture.index!.types, [GRASS, TREE]);
  assert.deepEqual(capture.index!.cells, [{ key: "0_0", counts: [2, 1] }, { key: "1_0", counts: [1, 0] }]);
  assert.deepEqual([...capture.cells.keys()], ["0_0", "1_0"]);
  for (const cell of capture.index!.cells) decodeFoliageCell(capture.cells.get(cell.key)!, cell.counts);
});

test("a save: acknowledged cells are clean, an edit made meanwhile stays; erasing everything drops the index", () => {
  const { session, load } = opened();
  load("0_0", "1_0");
  session.apply(session.adding(GRASS, [at(1, 1)]), "after");
  const capture = session.capture()!;
  const late = session.adding(GRASS, [at(2, 2)]);
  session.apply(late, "after");
  session.acknowledge(capture);
  assert.deepEqual(session.dirtyCells(), ["0_0"]);
  session.apply(late, "before");
  assert.equal(session.dirty, false);

  const all = new Set([...grassIn(session, "0_0"), ...grassIn(session, "1_0")]);
  const erase = session.removing(GRASS, all);
  session.apply(erase, "after");
  const empty = session.capture()!;
  assert.deepEqual([empty.index, [...empty.cells], empty.deletes], [null, [], ["0_0", "1_0"]]);
  session.acknowledge(empty);
  assert.deepEqual([session.dirty, session.listed()], [false, []]);
  // Undone after the save: painted again, every cell new.
  session.apply(erase, "before");
  assert.deepEqual([...session.capture()!.cells.keys()], ["0_0", "1_0"]);
});

test("a stroke's patches merge per cell and type; what ends as it began is left out", () => {
  const session = new FoliagePaintSession({ level: LEVEL, cellSize: 100, index: null });
  const patches = [session.adding(GRASS, [at(1, 1)])].flat();
  session.apply(patches, "after");
  const second = session.adding(GRASS, [at(3, 3), at(150, 3)]);
  session.apply(second, "after");
  const undone = session.removing(GRASS, new Set(grassIn(session, "1_0")));
  session.apply(undone, "after");
  const merged = mergeFoliagePatches([...patches, ...second, ...undone]);
  assert.deepEqual(merged.map((patch) => [patch.cell, patch.before.length, patch.after.length]), [["0_0", 0, 2]]);
  session.apply(merged, "before");
  assert.equal(session.dirty, false);
});
