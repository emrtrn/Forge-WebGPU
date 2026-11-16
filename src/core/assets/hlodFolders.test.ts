import { expect, test } from "vitest";
import { partFolderOf } from "./levelFolders.ts";
import { build, doc, levelFolder, levelId } from "./testKit.ts";

const index = (extra = {}) => ({ schema: "forge.levelHlod/1", level: levelId("1"), cellSize: 100,
  cells: [{ key: "0_0", triangles: 12, sourceHash: "01234567" }], ...extra });
const proxy = { root: "content", path: "levels/main/hlod/0_0.glb" };
const base = () => levelFolder("levels/main", "1", []);

test("HLOD indexes and GLBs belong to their level, need no meta and do not become assets", () => {
  const files = [...base(), doc("levels/main/hlod.json", index()), proxy];
  const result = build(files);
  expect(result.issues).toEqual([]);
  expect(result.entries.size).toBe(1);
  expect(result.parts.has("content/levels/main/hlod.json")).toBe(true);
  expect(result.parts.has("content/levels/main/hlod/0_0.glb")).toBe(true);
  expect(partFolderOf("levels/main/hlod.json")).toBe("levels/main");
  expect(partFolderOf("levels/main/hlod/0_0.glb")).toBe("levels/main");
  expect(partFolderOf("hlod/0_0.glb")).toBe("");
  expect(partFolderOf("hlod.json")).toBe("");
});

test("orphan proxies, missing proxies, wrong level ids and wrong cell sizes are errors", () => {
  const cases = [
    { files: [...base(), proxy], code: "orphan-part", path: "" },
    { files: [...base(), doc("levels/main/hlod.json", index())], code: "dangling-reference", path: "cells" },
    { files: [...base(), doc("levels/main/hlod.json", index({ level: levelId("2") })), proxy], code: "invalid-value", path: "level" },
    { files: [...base(), doc("levels/main/hlod.json", index({ cellSize: 128 })), proxy], code: "invalid-value", path: "cellSize" },
    { files: [proxy], code: "orphan-part", path: "" },
  ];
  for (const { files, code, path } of cases) {
    const result = build(files);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", code, path }));
    expect(result.issues.some((issue) => ["unrecognized-file", "missing-meta"].includes(issue.code))).toBe(false);
  }
});

test("HLOD index schema and entries are normalized with file-labelled errors", () => {
  for (const json of [{ ...index(), cells: [{ key: "bad", triangles: 12, sourceHash: "01234567" }] }, { schema: "wrong" }]) {
    const result = build([...base(), doc("levels/main/hlod.json", json)]);
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ severity: "error", file: "content/levels/main/hlod.json" }));
  }
  const malformed = build([...base(), { root: "content", path: "levels/main/hlod.json", parseError: "unexpected end" }]);
  expect(malformed.ok).toBe(false);
});
