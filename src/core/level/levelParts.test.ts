import { describe, expect, test } from "vitest";
import { normalizeLevelCell } from "./cellDocs.ts";
import {
  mergeLevelParts,
  nextCellIndex,
  partsToWrite,
  planLevelFiles,
  splitLevel,
  stringifyDocument,
} from "./levelParts.ts";
import type { LevelCellDoc, LevelDoc } from "./model.ts";
import { normalizeLevel } from "./normalizeLevel.ts";
import { actorId, createOptions, levelId, summary } from "./testKit.ts";

const STRICT = createOptions(true);
const LENIENT = createOptions(false);
const REV = "0123456789abcdef";
const REV2 = "fedcba9876543210";

function actor(seed: string, x: number, z: number, extra: Record<string, unknown> = {}): unknown {
  return { id: actorId(seed), transform: { p: [x, 0, z] }, components: {}, ...extra };
}

function levelOf(actors: unknown[]): LevelDoc {
  const result = normalizeLevel(
    { schema: "forge.level/1", id: levelId("1"), settings: { cellSize: 100 }, actors },
    STRICT,
  );
  expect(result.issues).toEqual([]);
  return result.value!;
}

const ids = (actors: readonly { id: string }[]): string[] => actors.map((entry) => entry.id.slice(4, 5));

/** fog (singleton, persistent), a parked root + child, two cars in 0_0, a tree in 1_-1. */
const WORLD = levelOf([
  actor("a", 0, 0, { components: { fog: { type: "test.fog@2" } } }),
  actor("b", 50, 50),
  actor("c", 150, -20),
  actor("d", 999, 999, { parent: actorId("c") }),
  actor("e", 300, 300, { spatiallyLoaded: false }),
  actor("f", 60, 10),
]);

describe("split", () => {
  test("the persistent layer keeps settings; cells are the occupied ones, in cell order", () => {
    const split = splitLevel(WORLD, STRICT);
    expect(split.issues).toEqual([]);
    expect(split.persistent.settings).toEqual({ cellSize: 100 });
    expect(ids(split.persistent.actors)).toEqual(["a", "e"]);
    expect(split.cells.map((cell) => [cell.cell, ids(cell.actors)])).toEqual([
      ["1_-1", ["c", "d"]],
      ["0_0", ["b", "f"]],
    ]);
    expect(split.cells[0]).toMatchObject({ schema: "forge.levelCell/1", level: WORLD.id });
  });

  test("split -> merge gives the level back, with each actor's file", () => {
    const split = splitLevel(WORLD, STRICT);
    const merged = mergeLevelParts(split.persistent, split.cells, STRICT);
    expect(merged.issues).toEqual([]);
    expect(ids(merged.value.level.actors)).toEqual(["a", "e", "c", "d", "b", "f"]);
    expect(merged.value.level.settings).toEqual(WORLD.settings);
    expect(merged.value.cells).toEqual(["1_-1", "0_0"]);
    expect(Object.fromEntries(merged.value.fileOf)).toEqual(Object.fromEntries(split.assignment));
    const byId = new Map(WORLD.actors.map((entry) => [entry.id, entry]));
    for (const entry of merged.value.level.actors) expect(entry).toEqual(byId.get(entry.id));
  });

  test("merging shares nothing with the parts", () => {
    const split = splitLevel(WORLD, STRICT);
    const merged = mergeLevelParts(split.persistent, split.cells, STRICT);
    merged.value.level.actors[2]!.transform.p[0] = 1;
    merged.value.level.settings.cellSize = 1;
    expect(split.cells[1]!.actors[0]!.transform.p[0]).toBe(50);
    expect(split.persistent.settings.cellSize).toBe(100);
  });
});

describe("merge checks what one file cannot see", () => {
  const split = splitLevel(WORLD, STRICT);
  const persistent = split.persistent;
  const cell00 = split.cells.find((cell) => cell.cell === "0_0")!;

  test("a partly loaded level merges cleanly", () => {
    const merged = mergeLevelParts(persistent, [cell00], STRICT);
    expect(merged.issues).toEqual([]);
    expect(ids(merged.value.level.actors)).toEqual(["a", "e", "b", "f"]);
  });

  test("an actor in the wrong cell is a warning, also in development", () => {
    const moved = structuredClone(cell00);
    moved.actors[0]!.transform.p = [250, 0, 50];
    const merged = mergeLevelParts(persistent, [moved], STRICT);
    expect(merged.issues.map((issue) => `${issue.file} ${issue.severity} ${issue.code} ${issue.path}`)).toEqual([
      "cells/0_0.json warning misplaced-actor actors[0]",
    ]);
    expect(merged.ok).toBe(true);
    expect(merged.issues[0]?.message).toContain("cells/2_0.json");
  });

  test("a streamed actor in level.json is misplaced too", () => {
    const stray = structuredClone(persistent);
    stray.actors.push(structuredClone(cell00.actors[0]!));
    const merged = mergeLevelParts(stray, [], STRICT);
    expect(merged.issues.map((issue) => `${issue.file} ${issue.code} ${issue.path}`)).toEqual([
      "level.json misplaced-actor actors[2]",
    ]);
  });

  test("an id in two files: the later copy is dropped", () => {
    const copy: LevelCellDoc = { ...structuredClone(cell00), cell: "5_5" };
    copy.actors[0]!.transform.p = [550, 0, 550];
    const merged = mergeLevelParts(persistent, [cell00, copy], STRICT);
    expect(merged.issues.map((issue) => `${issue.file} ${issue.severity} ${issue.code} ${issue.path}`)).toEqual([
      "cells/5_5.json error duplicate-id actors[0].id",
      "cells/5_5.json error duplicate-id actors[1].id",
    ]);
    expect(ids(merged.value.level.actors)).toEqual(["a", "e", "b", "f"]);
  });

  test("a cell of another level, or the same cell twice, is left out", () => {
    const foreign: LevelCellDoc = { ...structuredClone(cell00), level: levelId("2") };
    const merged = mergeLevelParts(persistent, [foreign, cell00, structuredClone(cell00)], LENIENT);
    expect(merged.issues.map((issue) => `${issue.file} ${issue.code} ${issue.path}`)).toEqual([
      "cells/0_0.json invalid-value level",
      "cells/0_0.json duplicate-id cell",
    ]);
    expect(merged.value.cells).toEqual(["0_0"]);
  });

  test("a singleton in two files is a conflict", () => {
    const second = structuredClone(cell00);
    second.actors.push(
      normalizeLevelCell(
        { schema: "forge.levelCell/1", level: WORLD.id, cell: "0_0", actors: [actor("9", 10, 10, { components: { mist: { type: "test.fog@2" } } })] },
        STRICT,
      ).value!.actors[0]!,
    );
    const merged = mergeLevelParts(persistent, [second], STRICT);
    expect(summary(merged.issues)).toContain("error singleton-conflict actors[2]");
    expect(merged.issues.find((issue) => issue.code === "singleton-conflict")?.message).toContain("level.json");
  });
});

describe("saving an edit", () => {
  const split = splitLevel(WORLD, STRICT);
  const loaded = mergeLevelParts(split.persistent, split.cells, STRICT).value;

  test("moving an actor across a cell edge touches both cells", () => {
    const level = structuredClone(loaded.level);
    level.actors.find((entry) => entry.id === actorId("b"))!.transform.p = [150, 0, -50];
    const assignment = splitLevel(level, STRICT).assignment;
    expect(partsToWrite(loaded.fileOf, assignment, [actorId("b")])).toEqual(new Set(["0_0", "1_-1"]));
  });

  test("a new actor touches its cell; a deleted one the file it was in", () => {
    const level = structuredClone(loaded.level);
    level.actors = level.actors.filter((entry) => entry.id !== actorId("e"));
    level.actors.push(levelOf([actor("7", -10, 10)]).actors[0]!);
    const assignment = splitLevel(level, STRICT).assignment;
    expect(partsToWrite(loaded.fileOf, assignment, [actorId("e"), actorId("7")])).toEqual(new Set([null, "-1_0"]));
  });

  test("the plan writes canonical text, removes a cell left empty, and reads back the same", () => {
    const level = structuredClone(loaded.level);
    for (const entry of level.actors) if (entry.id === actorId("c")) entry.transform.p = [50, 0, 50];
    const assignment = splitLevel(level, STRICT).assignment;
    const parts = partsToWrite(loaded.fileOf, assignment, [actorId("c")]);
    const plan = planLevelFiles(level, assignment, parts, new Set(loaded.cells));
    expect(plan.notLoaded).toEqual([]);
    expect(plan.write.map((file) => file.path)).toEqual(["cells/0_0.json"]);
    expect(plan.remove).toEqual([{ key: "1_-1", path: "cells/1_-1.json" }]);

    const text = plan.write[0]!.text;
    const reread = normalizeLevelCell(JSON.parse(text), STRICT);
    expect(reread.issues).toEqual([]);
    // Level order; the child follows its root into the cell.
    expect(ids(reread.value!.actors)).toEqual(["c", "d", "b", "f"]);
    expect(stringifyDocument(reread.value)).toBe(text);
  });

  test("the persistent layer is written first, even when it has no actors left", () => {
    const level = { ...structuredClone(loaded.level), actors: [] };
    const plan = planLevelFiles(level, new Map(), ["0_0", null], new Set(["0_0"]));
    expect(plan.write.map((file) => file.path)).toEqual(["level.json"]);
    expect(plan.remove.map((file) => file.path)).toEqual(["cells/0_0.json"]);
  });

  test("a cell that is not loaded is reported, not overwritten", () => {
    const plan = planLevelFiles(loaded.level, splitLevel(loaded.level, STRICT).assignment, ["0_0", "1_-1"], new Set(["0_0"]));
    expect(plan.notLoaded).toEqual(["1_-1"]);
  });
});

describe("cell index", () => {
  test("the next index keeps unchanged cells, sets new revisions, drops removed cells", () => {
    const previous = { schema: "forge.levelCells/1" as const, level: levelId("1"), persistent: REV, cells: { "0_0": REV, "1_-1": REV } };
    const next = nextCellIndex(levelId("1"), previous, new Map([["-1_0", REV2], ["0_0", REV2]]), ["1_-1"]);
    expect(next).toEqual({ schema: "forge.levelCells/1", level: levelId("1"), persistent: REV, cells: { "-1_0": REV2, "0_0": REV2 } });
  });

  test("a first save needs the persistent revision", () => {
    expect(nextCellIndex(levelId("1"), null, new Map([["0_0", REV]]))).toBeNull();
    expect(nextCellIndex(levelId("1"), null, new Map([[null, REV2]]))?.persistent).toBe(REV2);
  });
});

describe("canonical text", () => {
  test("objects indent, arrays of plain values stay on one line", () => {
    const text = stringifyDocument({ a: [0, -0, 1.5], b: { c: [], d: {}, e: null, f: undefined }, g: [{ h: "x" }] });
    expect(text).toBe(
      [
        "{",
        '  "a": [0, 0, 1.5],',
        '  "b": {',
        '    "c": [],',
        '    "d": {},',
        '    "e": null',
        "  },",
        '  "g": [',
        "    {",
        '      "h": "x"',
        "    }",
        "  ]",
        "}",
        "",
      ].join("\n"),
    );
    expect(JSON.parse(text)).toEqual({ a: [0, 0, 1.5], b: { c: [], d: {}, e: null }, g: [{ h: "x" }] });
  });
});
