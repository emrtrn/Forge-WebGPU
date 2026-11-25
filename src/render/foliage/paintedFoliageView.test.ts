// Painted foliage on screen (plan 5c F4): the level part's FFOL cells, read
// through the level's source, reach the per-type batches as one owner per
// cell, with Matrix4.compose matrices; a missing cell draws nothing.

import assert from "node:assert/strict";
import { test } from "vitest";
import { buildLevelFoliage, foliageCellFileOf, type AssetId, type LevelId } from "../../core/index.ts";
import { composeMat4 } from "../../engine/math/affine.ts";
import type { LevelFoliageSource } from "../../engine/foliage/levelFoliageSource.ts";
import type { FoliageBatches, FoliageTypeDraw } from "./foliageBatches.ts";
import { paintedMatrices, PaintedFoliageView } from "./paintedFoliageView.ts";

const LEVEL = `lvl_${"1".repeat(32)}` as LevelId;
const GRASS = `ast_${"a".repeat(32)}` as AssetId;
const TREE = `ast_${"b".repeat(32)}` as AssetId;
const draw = (id: string): FoliageTypeDraw => ({ id, mesh: `ast_${"c".repeat(32)}`, lods: [], castShadow: false, cullStart: 0, cullEnd: 0 });

function fakeBatches() {
  const owners = new Map<string, Map<string, { matrices: Float32Array; seeds: Uint32Array | null }>>();
  const batches: FoliageBatches = {
    set(type, owner, matrices, seeds) {
      const byType = owners.get(owner) ?? new Map();
      byType.set(type.id, { matrices: Float32Array.from(matrices), seeds: seeds ? Uint32Array.from(seeds) : null });
      owners.set(owner, byType);
    },
    remove(owner) { owners.delete(owner); },
    setQuality() {},
    batches: [],
    ready: async () => {},
    dispose() {},
  };
  return { batches, owners };
}

const settle = async (view: PaintedFoliageView, position: readonly [number, number]): Promise<void> => {
  for (let i = 0; i < 20 && (view.busy() || i < 2); i += 1) {
    view.update(position);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

test("paintedMatrices composes position, rotation and uniform scale as Matrix4.compose", () => {
  const q = [0.1, 0.7, -0.2, 0.67];
  const length = Math.hypot(...q);
  const rotation = q.map((v) => v / length) as [number, number, number, number];
  const matrices = paintedMatrices({
    positions: Float32Array.from([3, 4, 5]), rotations: Float32Array.from(rotation), scales: Float32Array.from([1.5]), seeds: Uint32Array.from([7]),
  });
  const expected = composeMat4([3, 4, 5], rotation, [1.5, 1.5, 1.5]);
  expected.forEach((value, index) => assert.ok(Math.abs(matrices[index]! - value) < 1e-5, `element ${index}`));
});

test("a level's painted cells stream into the batches, one owner per cell, and a missing cell draws nothing", async () => {
  const { index, cells } = buildLevelFoliage({
    level: LEVEL, cellSize: 64,
    groups: [
      { type: GRASS, instances: [{ position: [10, 0, 10], rotation: [0, 0, 0, 1], scale: 1, seed: 1 }, { position: [20, 1, 5], rotation: [0, 0, 0, 1], scale: 2, seed: 2 }] },
      { type: TREE, instances: [{ position: [-30, 0, 40], rotation: [0, 0, 0, 1], scale: 3, seed: 3 }, { position: [5000, 0, 5000], rotation: [0, 0, 0, 1], scale: 1, seed: 4 }] },
    ],
  });
  const files = new Map([...cells].map(([key, bytes]) => [foliageCellFileOf(key), bytes]));
  files.delete(foliageCellFileOf("-1_0"));
  const source: LevelFoliageSource = { index, load: async (file) => { const bytes = files.get(file); return bytes ? bytes.slice().buffer : null; } };
  const { batches, owners } = fakeBatches();
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (message: string) => { warnings.push(message); };
  try {
    const view = new PaintedFoliageView({ source, batches, loadRange: 128, loadTypes: async (guids) => new Map(guids.map((guid) => [guid, draw(guid)])) });
    await settle(view, [0, 0]);
    assert.equal(view.busy(), false);
    // The near cell 0_0 draws both grass instances; -1_0 (the tree near the origin) is missing; the far tree is out of range.
    assert.deepEqual([...owners.keys()].sort(), ["painted:0_0"]);
    const grass = owners.get("painted:0_0")!.get(GRASS)!;
    assert.equal(grass.matrices.length, 32);
    assert.deepEqual([...grass.matrices.slice(12, 15)], [10, 0, 10]);
    assert.deepEqual([...grass.seeds!], [1, 2]);
    assert.ok(warnings.some((message) => message.includes("-1_0")), "the missing cell warns");
    assert.equal(view.snapshot()?.instances, 2);
    view.dispose();
    assert.equal(owners.size, 0, "dispose removes every cell");
  } finally {
    console.warn = warn;
  }
});

test("an edited cell is drawn from the edits at once, with types the index does not know, and the stream leaves it alone", async () => {
  const { index, cells } = buildLevelFoliage({
    level: LEVEL, cellSize: 64, groups: [{ type: GRASS, instances: [{ position: [10, 0, 10], rotation: [0, 0, 0, 1], scale: 1, seed: 1 }] }],
  });
  const one = (x: number) => ({ positions: Float32Array.from([x, 0, 5]), rotations: Float32Array.from([0, 0, 0, 1]), scales: Float32Array.from([1]), seeds: Uint32Array.from([9]) });
  const edited = new Map<string, { type: string; instances: ReturnType<typeof one> }[]>();
  let changed = (_key: string): void => {};
  const source: LevelFoliageSource = {
    index, load: async (file) => cells.get(file.slice("foliage/".length, -".bin".length))?.slice().buffer ?? null,
    edits: { keys: () => edited.keys(), cell: (key) => edited.get(key) ?? null, onChange: (listener) => { changed = listener; return () => { changed = () => {}; }; } },
  };
  const { batches, owners } = fakeBatches();
  const view = new PaintedFoliageView({ source, batches, loadRange: 128, loadTypes: async (guids) => new Map(guids.map((guid) => [guid, draw(guid)])) });
  await settle(view, [0, 0]);
  assert.deepEqual([...owners.get("painted:0_0")!.keys()], [GRASS]);
  const change = async (key: string, list: { type: string; instances: ReturnType<typeof one> }[]): Promise<void> => {
    edited.set(key, list);
    changed(key);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  await change("0_0", [{ type: GRASS, instances: one(11) }, { type: TREE, instances: one(12) }]);
  assert.deepEqual([...owners.get("painted:0_0")!].map(([type, entry]) => [type, entry.matrices[12]]), [[GRASS, 11], [TREE, 12]]);
  // A cell the files do not have, far away.
  await change("40_40", [{ type: TREE, instances: one(2565) }]);
  assert.equal(owners.get("painted:40_40")!.get(TREE)!.matrices.length, 16);
  // Its last instance of a type goes: the type's share empties.
  await change("0_0", [{ type: GRASS, instances: one(13) }]);
  assert.equal(owners.get("painted:0_0")!.get(TREE)!.matrices.length, 0);
  // Out of range the stream unloads; the edited cell stays drawn.
  for (let i = 0; i < 4; i += 1) { view.update([9000, 9000]); await new Promise((resolve) => setTimeout(resolve, 0)); }
  assert.equal(owners.get("painted:0_0")!.get(GRASS)!.matrices[12], 13);
  view.dispose();
  assert.deepEqual([...owners.keys()], []);
});
