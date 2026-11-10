import { describe, expect, test } from "vitest";
import type { ContentFile } from "./identity.ts";
import { levelFolderOf, partFolderOf } from "./levelFolders.ts";
import { actorId, build, doc, fileSummary, level, levelFolder, levelId, REV } from "./testKit.ts";

const at = (x: number, z: number, extra: Record<string, unknown> = {}) => ({ transform: { p: [x, 0, z] }, ...extra });
const A = { id: actorId("a"), ...at(10, 10) };
const B = { id: actorId("b"), ...at(150, 10) };
const PARKED = { id: actorId("c"), spatiallyLoaded: false };

function without(files: ContentFile[], path: string): ContentFile[] {
  return files.filter((file) => file.path !== path);
}

function replaced(files: ContentFile[], path: string, json: unknown): ContentFile[] {
  return files.map((file) => (file.path === path ? { ...file, json } : file));
}

describe("paths", () => {
  test("a level folder is where level.json is", () => {
    expect(levelFolderOf("levels/main/level.json")).toBe("levels/main");
    expect(levelFolderOf("level.json")).toBe("");
    expect(levelFolderOf("levels/main.json")).toBeNull();
    expect(levelFolderOf("levels/mylevel.json")).toBeNull();
  });

  test("a part belongs to the folder above cells/, or next to cells.json", () => {
    expect(partFolderOf("levels/main/cells.json")).toBe("levels/main");
    expect(partFolderOf("levels/main/cells/0_0.json")).toBe("levels/main");
    expect(partFolderOf("cells/0_0.json")).toBe("");
    expect(partFolderOf("cells.json")).toBe("");
    expect(partFolderOf("levels/main/stuff/0_0.json")).toBeNull();
  });
});

describe("a level folder", () => {
  test("merges cleanly and says where its files are", () => {
    const index = build(levelFolder("levels/main", "1", [PARKED], { "0_0": [A], "1_0": [B] }));
    expect(fileSummary(index.issues)).toEqual([]);
    expect(index.levels.get(levelId("1"))).toEqual({
      level: levelId("1"),
      root: "content",
      folder: "levels/main",
      index: expect.objectContaining({ cells: { "0_0": REV, "1_0": REV } }),
      cells: ["0_0", "1_0"],
    });
  });

  test("works at the root of a content root", () => {
    const index = build(levelFolder("x", "1", [], { "0_0": [A] }).map((file) => ({ ...file, path: file.path.slice(2) })));
    expect(fileSummary(index.issues)).toEqual([]);
    expect(index.levels.get(levelId("1"))?.folder).toBe("");
  });

  test("a level with no cells needs no index", () => {
    const index = build([level("levels/main/level.json", "1", [PARKED])]);
    expect(fileSummary(index.issues)).toEqual([]);
    expect(index.levels.get(levelId("1"))).toMatchObject({ index: null, cells: [] });
  });

  test("a level must be named level.json; its cells are then not read", () => {
    const files = [
      level("levels/main/main.json", "1", [PARKED]),
      ...without(levelFolder("levels/main", "2", [], { "0_0": [A] }), "levels/main/level.json"),
    ];
    expect(fileSummary(build(files).issues)).toEqual([
      "error invalid-document content/levels/main/main.json",
      "error orphan-part content/levels/main/cells.json",
      "error orphan-part content/levels/main/cells/0_0.json",
    ]);
  });
});

describe("the index names the files that belong together", () => {
  const files = levelFolder("levels/main", "1", [], { "0_0": [A], "1_0": [B] });

  test("a cell file the index does not list is left out", () => {
    const extra = [...files, doc("levels/main/cells/5_5.json", { schema: "forge.levelCell/1", level: levelId("1"), cell: "5_5", actors: [{ id: actorId("d"), ...at(550, 550) }] })];
    const index = build(extra);
    expect(fileSummary(index.issues)).toEqual(["error orphan-part content/levels/main/cells/5_5.json"]);
    expect(index.levels.get(levelId("1"))?.cells).toEqual(["0_0", "1_0"]);
  });

  test("a cell the index lists must exist", () => {
    expect(fileSummary(build(without(files, "levels/main/cells/1_0.json")).issues)).toEqual([
      "error dangling-reference content/levels/main/cells.json cells.1_0",
    ]);
  });

  test("without an index, no cell is part of the level", () => {
    expect(fileSummary(build(without(files, "levels/main/cells.json")).issues)).toEqual([
      "error orphan-part content/levels/main/cells/0_0.json",
      "error orphan-part content/levels/main/cells/1_0.json",
    ]);
  });

  test("an index of another level is ignored", () => {
    const json = { schema: "forge.levelCells/1", level: levelId("2"), persistent: REV, cells: { "0_0": REV, "1_0": REV } };
    expect(fileSummary(build(replaced(files, "levels/main/cells.json", json)).issues)).toEqual([
      "error invalid-value content/levels/main/cells.json level",
      "error orphan-part content/levels/main/cells/0_0.json",
      "error orphan-part content/levels/main/cells/1_0.json",
    ]);
  });

  test("a cell whose file name and key disagree is left out", () => {
    const json = { schema: "forge.levelCell/1", level: levelId("1"), cell: "7_7", actors: [B] };
    const index = build(replaced(files, "levels/main/cells/1_0.json", json));
    expect(fileSummary(index.issues)).toEqual(["error invalid-value content/levels/main/cells/1_0.json cell"]);
    expect(index.levels.get(levelId("1"))?.cells).toEqual(["0_0"]);
  });

  test("a file under cells/ with another name, or parts with no level, are orphans", () => {
    const strays = [
      ...files,
      doc("levels/main/cells/big.json", { schema: "forge.levelCell/1", level: levelId("1"), cell: "0_0", actors: [] }),
      doc("elsewhere/cells.json", { schema: "forge.levelCells/1", level: levelId("1"), persistent: REV }),
      doc("elsewhere/x/0_0.json", { schema: "forge.levelCell/1", level: levelId("1"), cell: "0_0", actors: [] }),
    ];
    expect(fileSummary(build(strays).issues)).toEqual([
      "error orphan-part content/levels/main/cells/big.json",
      "error orphan-part content/elsewhere/cells.json",
      "error orphan-part content/elsewhere/x/0_0.json",
    ]);
  });
});

describe("checks across the files of a level", () => {
  test("an actor id in two files", () => {
    const files = levelFolder("levels/main", "1", [], { "0_0": [A], "1_0": [B, { ...A, ...at(160, 10) }] });
    expect(fileSummary(build(files).issues)).toEqual(["error duplicate-id content/levels/main/cells/1_0.json actors[1].id"]);
  });

  test("an actor in the wrong cell is a warning with its file", () => {
    const files = levelFolder("levels/main", "1", [], { "0_0": [A, B] });
    const index = build(files);
    expect(fileSummary(index.issues)).toEqual(["warning misplaced-actor content/levels/main/cells/0_0.json actors[1]"]);
    expect(index.ok).toBe(true);
  });

  test("an actor reference may point into another cell, not at an actor in no file", () => {
    const driver = (target: string) => ({ d: { type: "test.driver@1", target } });
    const files = levelFolder("levels/main", "1", [], {
      "0_0": [{ ...A, components: driver(actorId("b")) }],
      "1_0": [{ ...B, components: driver(actorId("9")) }],
    });
    const index = build(files);
    expect(fileSummary(index.issues)).toEqual([
      "error dangling-reference content/levels/main/cells/1_0.json actors[0].components.d.target",
    ]);
    expect(index.issues[0]?.message).toContain(actorId("9"));
  });

  test("asset references in cells are attributed to the level and the cell file", () => {
    const mesh = { m: { type: "test.staticMesh@1", parent: null, mesh: "ast_99999999999999999999999999999999" } };
    const index = build(levelFolder("levels/main", "1", [], { "1_0": [{ ...B, components: mesh }] }));
    expect(index.references.map((reference) => `${reference.from} ${reference.file} ${reference.path}`)).toEqual([
      `${levelId("1")} content/levels/main/cells/1_0.json actors[0].components.m.mesh`,
    ]);
  });
});

describe("revisions", () => {
  const OTHER = "fedcba9876543210";
  const withRevisions = (files: ContentFile[], revisions: Record<string, string>): ContentFile[] =>
    files.map((file) => (Object.hasOwn(revisions, file.path) ? { ...file, revision: revisions[file.path]! } : file));
  const files = levelFolder("levels/main", "1", [], { "0_0": [A], "1_0": [B] });

  test("files that match the index pass; without revisions nothing is compared", () => {
    const matching = withRevisions(files, {
      "levels/main/level.json": REV,
      "levels/main/cells/0_0.json": REV,
      "levels/main/cells/1_0.json": REV,
    });
    expect(fileSummary(build(matching).issues)).toEqual([]);
    expect(fileSummary(build(files).issues)).toEqual([]);
  });

  test("a file written after the index, or edited by hand, is read and reported", () => {
    const index = build(withRevisions(files, { "levels/main/level.json": OTHER, "levels/main/cells/1_0.json": OTHER }));
    expect(fileSummary(index.issues)).toEqual([
      "error revision-mismatch content/levels/main/cells.json persistent",
      "error revision-mismatch content/levels/main/cells.json cells.1_0",
    ]);
    expect(index.issues[1]?.message).toContain("cells/1_0.json");
    expect(index.levels.get(levelId("1"))?.cells).toEqual(["0_0", "1_0"]);
  });
});
