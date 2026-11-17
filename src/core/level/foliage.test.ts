import { expect, test } from "vitest";
import { assetId, levelId } from "./testKit.ts";
import { normalizeLevelFoliageIndex } from "./foliage.ts";

const A = assetId("a"), B = assetId("b");
const index = (extra: Record<string, unknown> = {}) => ({
  schema: "forge.levelFoliage/1", level: levelId("1"), cellSize: 128, types: [A, B],
  cells: [{ key: "1_0", counts: [3, 0] }, { key: "0_0", counts: [0, 2] }], ...extra,
});

test("a foliage index normalises with its cells in cell order", () => {
  const result = normalizeLevelFoliageIndex(index());
  expect(result.issues).toEqual([]);
  expect(result.value?.cells.map((cell) => cell.key)).toEqual(["0_0", "1_0"]);
  expect(result.value?.types).toEqual([A, B]);
});

test("bad cells are dropped with a loss; the rest stays", () => {
  const cases: [Record<string, unknown>, string, string][] = [
    [{ key: "x", counts: [1, 0] }, "invalid-value", "cells[2].key"],
    [{ key: "0_0", counts: [1, 0] }, "duplicate-id", "cells[2].key"],
    [{ key: "2_0", counts: [1] }, "invalid-value", "cells[2].counts"],
    [{ key: "2_0", counts: [1.5, 0] }, "invalid-value", "cells[2].counts"],
    [{ key: "2_0", counts: [0, 0] }, "invalid-value", "cells[2].counts"],
  ];
  for (const [cell, code, path] of cases) {
    const result = normalizeLevelFoliageIndex(index({ cells: [...index().cells, cell] }), { strict: false });
    expect(result.issues).toContainEqual(expect.objectContaining({ code, path }));
    expect(result.value?.cells.length).toBe(2);
  }
});

test("an index whose types cannot be trusted is unreadable", () => {
  for (const extra of [{ schema: "wrong" }, { types: [A, A] }, { types: [A, "nope"] }, { level: "x" }, { cellSize: 0 }]) {
    const result = normalizeLevelFoliageIndex(index(extra), { strict: false });
    expect(result.value).toBeNull();
  }
});

test("types out of ascending order are reported, the counts still line up", () => {
  const result = normalizeLevelFoliageIndex(index({ types: [B, A] }), { strict: false });
  expect(result.issues).toContainEqual(expect.objectContaining({ code: "invalid-value", path: "types" }));
  expect(result.value?.types).toEqual([B, A]);
});
