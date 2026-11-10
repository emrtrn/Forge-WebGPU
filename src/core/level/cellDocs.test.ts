import { describe, expect, test } from "vitest";
import { validateJsonSchema } from "../schema/jsonSchemaTestValidator.ts";
import {
  cellFileOf,
  cellKeyOfFile,
  isRevision,
  normalizeLevelCell,
  normalizeLevelCellIndex,
} from "./cellDocs.ts";
import { levelCellIndexJsonSchema, levelCellJsonSchema } from "./jsonSchema.ts";
import { actorId, CAR_CLASS_ID, createOptions, createTestRegistry, levelId, summary } from "./testKit.ts";

const STRICT = createOptions(true);
const LENIENT = createOptions(false);
const REV = "0123456789abcdef";
const REV2 = "fedcba9876543210";

const CANONICAL_CELL = {
  schema: "forge.levelCell/1",
  level: levelId("1"),
  cell: "-1_2",
  actors: [
    {
      id: actorId("a"),
      name: "Car",
      class: CAR_CLASS_ID,
      parent: null,
      spatiallyLoaded: true,
      transform: { p: [-10, 0, 250], r: [0, 0, 0, 1], s: [1, 1, 1] },
      overrides: { driver: { type: "test.driver@1", targetSpeed: 18 } },
    },
  ],
};

const CANONICAL_INDEX = {
  schema: "forge.levelCells/1",
  level: levelId("1"),
  persistent: REV,
  cells: { "0_-1": REV2, "-1_0": REV, "0_0": REV2 },
};

describe("file names", () => {
  test("a cell file is cells/<key>.json", () => {
    expect(cellFileOf("-1_2")).toBe("cells/-1_2.json");
    expect(cellKeyOfFile("cells/-1_2.json")).toBe("-1_2");
  });

  test.each(["level.json", "cells.json", "cells/x.json", "cells/1_2.txt", "cells/a/1_2.json", "1_2.json"])(
    "%s is not a cell file",
    (path) => {
      expect(cellKeyOfFile(path)).toBeNull();
    },
  );

  test("a revision is 16 lowercase hex digits", () => {
    expect(isRevision(REV)).toBe(true);
    expect(isRevision(REV.toUpperCase())).toBe(false);
    expect(isRevision(REV.slice(1))).toBe(false);
    expect(isRevision(1)).toBe(false);
  });
});

describe("level cell", () => {
  test("load -> save writes back exactly what was read", () => {
    const text = JSON.stringify(CANONICAL_CELL, null, 2);
    const loaded = normalizeLevelCell(JSON.parse(text), STRICT);
    expect(loaded.issues).toEqual([]);
    expect(JSON.stringify(loaded.value, null, 2)).toBe(text);
  });

  test("actors are normalised like the actors of a level", () => {
    const raw = {
      schema: "forge.levelCell/1",
      level: levelId("1"),
      cell: "0_0",
      actors: [{ id: actorId("a") }, { id: actorId("a") }, { id: actorId("b"), components: { f: { type: "test.fog@1" } } }],
    };
    const result = normalizeLevelCell(raw, STRICT);
    expect(summary(result.issues)).toEqual(["error duplicate-id actors[1].id"]);
    expect(result.value?.actors.map((actor) => actor.id)).toEqual([actorId("a"), actorId("b")]);
    expect(result.value?.actors[1]).toMatchObject({ components: { f: { type: "test.fog@2" } } });
  });

  test.each([
    ["not an object", [], ""],
    ["another schema", { ...CANONICAL_CELL, schema: "forge.level/1" }, "schema"],
    ["no level id", { ...CANONICAL_CELL, level: actorId("1") }, "level"],
    ["a bad cell key", { ...CANONICAL_CELL, cell: "1-2" }, "cell"],
    ["no cell key", { ...CANONICAL_CELL, cell: undefined }, "cell"],
  ])("%s is fatal", (_name, raw, path) => {
    for (const options of [STRICT, LENIENT]) {
      const result = normalizeLevelCell(raw, options);
      expect(result.value).toBeNull();
      expect(summary(result.issues)).toEqual([`error invalid-document ${path}`]);
    }
  });

  test("unknown fields are a loss", () => {
    const result = normalizeLevelCell({ ...CANONICAL_CELL, settings: {} }, LENIENT);
    expect(summary(result.issues)).toEqual(["warning unknown-field settings"]);
    expect(result.ok).toBe(true);
  });
});

describe("level cell index", () => {
  test("cells are kept in row order: z, then x", () => {
    const result = normalizeLevelCellIndex(CANONICAL_INDEX, STRICT);
    expect(result.issues).toEqual([]);
    expect(Object.keys(result.value!.cells)).toEqual(["0_-1", "-1_0", "0_0"]);
    const again = normalizeLevelCellIndex(result.value, STRICT);
    expect(JSON.stringify(again.value)).toBe(JSON.stringify(result.value));
  });

  test("an empty level has an index with no cells", () => {
    const result = normalizeLevelCellIndex({ ...CANONICAL_INDEX, cells: undefined }, STRICT);
    expect(result.issues).toEqual([]);
    expect(result.value?.cells).toEqual({});
  });

  test("a bad entry is dropped and reported", () => {
    const raw = { ...CANONICAL_INDEX, cells: { "0_0": REV, "a_b": REV, "1_0": "nope" }, extra: 1 };
    const result = normalizeLevelCellIndex(raw, LENIENT);
    expect(summary(result.issues)).toEqual([
      "warning invalid-value cells.a_b",
      "warning invalid-value cells.1_0",
      "warning unknown-field extra",
    ]);
    expect(result.value?.cells).toEqual({ "0_0": REV });
  });

  test.each([
    ["another schema", { ...CANONICAL_INDEX, schema: "forge.levelCell/1" }, "schema"],
    ["no level id", { ...CANONICAL_INDEX, level: undefined }, "level"],
    ["no persistent revision", { ...CANONICAL_INDEX, persistent: "x" }, "persistent"],
  ])("%s is fatal", (_name, raw, path) => {
    const result = normalizeLevelCellIndex(raw, LENIENT);
    expect(result.value).toBeNull();
    expect(summary(result.issues)).toEqual([`error invalid-document ${path}`]);
  });
});

describe("JSON Schema", () => {
  const registry = createTestRegistry();

  test("accepts the canonical cell and index", () => {
    expect(validateJsonSchema(levelCellJsonSchema(registry), CANONICAL_CELL)).toEqual([]);
    expect(validateJsonSchema(levelCellIndexJsonSchema(), CANONICAL_INDEX)).toEqual([]);
  });

  test.each([
    ["a bad cell key", { ...CANONICAL_CELL, cell: "01_2" }, ["cell: pattern"]],
    ["a level field", { ...CANONICAL_CELL, settings: {} }, ["settings: not allowed"]],
    ["an actor field it does not know", { ...CANONICAL_CELL, actors: [{ id: actorId("a"), layer: 1 }] }, ["actors.0.layer: not allowed"]],
  ])("cell: rejects %s", (_name, value, errors) => {
    expect(validateJsonSchema(levelCellJsonSchema(registry), value)).toEqual(errors);
  });

  test.each([
    ["a bad revision", { ...CANONICAL_INDEX, persistent: "abc" }, ["persistent: pattern"]],
    ["a bad cell key", { ...CANONICAL_INDEX, cells: { x: REV } }, ["cells.x: pattern"]],
    ["a bad cell revision", { ...CANONICAL_INDEX, cells: { "0_0": 1 } }, ["cells.0_0: type"]],
  ])("index: rejects %s", (_name, value, errors) => {
    expect(validateJsonSchema(levelCellIndexJsonSchema(), value)).toEqual(errors);
  });
});
