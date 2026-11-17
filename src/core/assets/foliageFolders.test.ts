import { expect, test } from "vitest";
import { partFolderOf } from "./levelFolders.ts";
import { asset, assetId, build, doc, levelFolder, levelId, TEX } from "./testKit.ts";

const TYPE = assetId("f");
const index = (extra = {}) => ({ schema: "forge.levelFoliage/1", level: levelId("1"), cellSize: 100,
  types: [TYPE], cells: [{ key: "0_0", counts: [4] }], ...extra });
const cell = { root: "content", path: "levels/main/foliage/0_0.bin" };
const base = () => levelFolder("levels/main", "1", []);

test("foliage indexes and cell files belong to their level, need no meta and do not become assets", () => {
  const result = build([...base(), doc("levels/main/foliage.json", index()), cell]);
  expect(result.issues.filter((issue) => issue.code !== "dangling-reference")).toEqual([]);
  expect(result.entries.size).toBe(1);
  expect(result.parts.has("content/levels/main/foliage.json")).toBe(true);
  expect(result.parts.has("content/levels/main/foliage/0_0.bin")).toBe(true);
  expect(partFolderOf("levels/main/foliage/0_0.bin")).toBe("levels/main");
  expect(partFolderOf("foliage.json")).toBe("");
});

test("the index's foliage types are asset references of the level", () => {
  const missing = build([...base(), doc("levels/main/foliage.json", index()), cell]);
  expect(missing.issues).toContainEqual(expect.objectContaining({ code: "dangling-reference", path: "types[0]" }));
  expect(missing.references).toContainEqual(expect.objectContaining({ target: TYPE, assetType: "forge.foliageType", file: "content/levels/main/foliage.json" }));
  const wrongType = build([...base(), ...asset("textures/t.png", TEX, "test.texture@1"), doc("levels/main/foliage.json", index({ types: [TEX] })), cell]);
  expect(wrongType.issues).toContainEqual(expect.objectContaining({ code: "asset-type-mismatch", path: "types[0]" }));
});

test("orphan cells, missing cells, wrong level ids and wrong cell sizes are errors", () => {
  const cases = [
    { files: [...base(), cell], code: "orphan-part", path: "" },
    { files: [...base(), doc("levels/main/foliage.json", index())], code: "dangling-reference", path: "cells" },
    { files: [...base(), doc("levels/main/foliage.json", index({ level: levelId("2") })), cell], code: "invalid-value", path: "level" },
    { files: [...base(), doc("levels/main/foliage.json", index({ cellSize: 128 })), cell], code: "invalid-value", path: "cellSize" },
  ];
  for (const { files, code, path } of cases) {
    const result = build(files);
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", code, path }));
    expect(result.issues.some((issue) => ["unrecognized-file", "missing-meta"].includes(issue.code))).toBe(false);
  }
});

test("a binary in a folder named foliage that is no cell file stays an asset that needs a meta", () => {
  const result = build([...base(), { root: "content", path: "props/foliage/grass.bin" }]);
  expect(result.issues).toContainEqual(expect.objectContaining({ code: "missing-meta" }));
});
