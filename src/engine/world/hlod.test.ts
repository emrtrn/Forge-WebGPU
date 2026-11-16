import assert from "node:assert/strict";
import { test } from "vitest";
import type { ActorClassDoc, ActorDoc, ComponentMap, PlainActor } from "../../core/level/model.ts";
import { actorId, assetId, levelId, summary } from "../../core/level/testKit.ts";
import { IDENTITY_TRANSFORM } from "../../core/schema/fields.ts";
import { composeMat4, IDENTITY_MAT4, quatFromAxisAngle, type Mat4 } from "../math/affine.ts";
import {
  HLOD_DIR, HLOD_INDEX_FILE, HLOD_SCHEMA, averageLinearColor, hlodCellFileOf,
  hlodCellSourceHash, hlodIncludesPlacement, hlodPlacementsOf, maxAxisScale,
  normalizeHlodIndex, type HlodPlacement,
} from "./hlod.ts";

const MODEL = assetId("1");
const MATERIAL = assetId("2");
const LEVEL = levelId("3");
const cell = (key: string) => ({ key, triangles: 12, sourceHash: "0123abcd" });
const indexDoc = () => ({ schema: HLOD_SCHEMA, level: LEVEL, cellSize: 128, cells: [cell("0_0")] });
const mesh = () => ({ type: "forge.staticMesh@2" as const, mesh: MODEL, materials: [MATERIAL, null], color: "#808080" });
const actor = (seed: string, components: ComponentMap = {}): PlainActor => ({
  id: actorId(seed), name: "HLOD fixture", parent: null, class: null, spatiallyLoaded: true,
  transform: structuredClone(IDENTITY_TRANSFORM), components,
});
const lookupOf = (actors: readonly ActorDoc[]) => {
  const byId = new Map(actors.map((doc) => [doc.id, doc]));
  return (id: ActorDoc["id"]) => byId.get(id);
};
const noClass = () => undefined;
const placement = (matrix: Mat4 = IDENTITY_MAT4): HlodPlacement => ({
  model: MODEL, materials: [MATERIAL, null], color: "#808080", matrix,
});
const closeMatrix = (actual: Mat4, expected: Mat4) => {
  assert.equal(actual.length, 16);
  expected.forEach((value, i) => assert.ok(Math.abs(actual[i]! - value) < 1e-10, `matrix[${i}]: ${actual[i]} != ${value}`));
};

test("HLOD parts live inside the level folder", () => {
  assert.equal(HLOD_INDEX_FILE, "hlod.json");
  assert.equal(HLOD_DIR, "hlod");
  assert.equal(hlodCellFileOf("-2_7"), "hlod/-2_7.glb");
  assert.equal(hlodCellFileOf("0_0"), "hlod/0_0.glb");
});

test("HLOD index normalisation detaches valid data and orders cells by z then x", () => {
  const input = { ...indexDoc(), cells: [cell("-1_2"), cell("10_0"), cell("2_0"), { ...cell("3_-1"), triangles: 0 }] };
  const original = structuredClone(input);
  const result = normalizeHlodIndex(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.value, { ...indexDoc(), cells: [input.cells[3], input.cells[2], input.cells[1], input.cells[0]] });
  assert.deepEqual(input, original);
  assert.notEqual(result.value!.cells[0], input.cells[3]);
  input.cells[3]!.triangles = 99;
  assert.equal(result.value!.cells[0]!.triangles, 0);
  assert.deepEqual(normalizeHlodIndex({ ...indexDoc(), cells: [] }).value!.cells, []);
});

test("HLOD index unreadable document fields are fatal even outside strict mode", () => {
  const invalid: Array<[unknown, string]> = [
    [null, ""], [[], ""], [42, ""],
    [{ ...indexDoc(), schema: 1 }, "schema"], [{ ...indexDoc(), schema: "forge.levelHlod/2" }, "schema"],
    [{ ...indexDoc(), level: MODEL }, "level"], [{ ...indexDoc(), level: "bad" }, "level"],
    [{ ...indexDoc(), level: null }, "level"],
    ...[0, -1, Infinity, -Infinity, NaN, "128", null, undefined].map((cellSize): [unknown, string] => [{ ...indexDoc(), cellSize }, "cellSize"]),
    ...[{}, null, "cells", undefined].map((cells): [unknown, string] => [{ ...indexDoc(), cells }, "cells"]),
  ];
  for (const [value, path] of invalid) {
    const result = normalizeHlodIndex(value, { strict: false });
    assert.equal(result.value, null);
    assert.equal(result.ok, false);
    assert.deepEqual(summary(result.issues), [`error invalid-document ${path}`]);
  }
});

test("HLOD index drops invalid and duplicate entries with precise loss issues", () => {
  const badKeys = ["01_0", "-0_0", "0_00", "0_0/../1", "9007199254740992_0", 7, null];
  const badTriangles = [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "12", null];
  const badHashes = ["0123ABCD", "0123abc", "0123abcde", "g123abcd", "0123abcd\n", 123, null];
  const cells = [cell("0_0"), cell("0_0"), null, [],
    ...badKeys.map((key) => ({ ...cell("1_0"), key })),
    ...badTriangles.map((triangles) => ({ ...cell("1_0"), triangles })),
    ...badHashes.map((sourceHash) => ({ ...cell("1_0"), sourceHash })),
    { ...cell("1_0"), triangles: Number.MAX_SAFE_INTEGER },
  ];
  for (const strict of [true, false]) {
    const result = normalizeHlodIndex({ ...indexDoc(), cells }, { strict });
    assert.equal(result.ok, !strict);
    assert.deepEqual(result.value!.cells, [cell("0_0"), { ...cell("1_0"), triangles: Number.MAX_SAFE_INTEGER }]);
    assert.equal(result.issues.length, cells.length - 2);
    assert.deepEqual(result.issues[0], {
      code: "duplicate-id", severity: strict ? "error" : "warning", path: "cells[1].key",
      message: "Duplicate HLOD cell key; entry dropped.",
    });
    assert.equal(result.issues[1]!.path, "cells[2]");
    assert.equal(result.issues[3]!.path, "cells[4].key");
    assert.equal(result.issues[10]!.path, "cells[11].triangles");
    assert.equal(result.issues[17]!.path, "cells[18].sourceHash");
    assert.ok(result.issues.every((issue) => issue.severity === (strict ? "error" : "warning")));
  }
});

test("HLOD index reports unknown fields instead of silently losing them", () => {
  const result = normalizeHlodIndex({ ...indexDoc(), extra: true, cells: [{ ...cell("0_0"), extra: 42 }] });
  assert.deepEqual(summary(result.issues), ["error unknown-field cells[0].extra", "error unknown-field extra"]);
  assert.deepEqual(result.value, indexDoc());
});

test("HLOD resolves class components with model, material, colour and local overrides", () => {
  const cls: ActorClassDoc = {
    schema: "forge.actorClass/1", id: assetId("c"), name: "Model class",
    components: { model: { ...mesh(), local: { ...IDENTITY_TRANSFORM, p: [1, 0, 0] } } },
  };
  const instance: ActorDoc = {
    ...actor("a"), class: cls.id,
    overrides: { model: { type: "forge.staticMesh@2", mesh: assetId("4"), materials: [null, assetId("5")], color: "#ff0000",
      local: { p: [2, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] } } },
  };
  const before = structuredClone({ cls, instance });
  assert.deepEqual(hlodPlacementsOf([instance], lookupOf([instance]), (id) => id === cls.id ? cls : undefined), [{
    model: assetId("4"), materials: [null, assetId("5")], color: "#ff0000",
    matrix: composeMat4([2, 0, 0], [0, 0, 0, 1], [1, 1, 1]),
  }]);
  assert.deepEqual({ cls, instance }, before);
  assert.deepEqual(hlodPlacementsOf([instance], lookupOf([instance]), noClass), []);
});

test("HLOD child actor inherits rotated and non-uniformly scaled ancestors outside the input list", () => {
  const parent = actor("a");
  parent.transform = { p: [10, 20, 30], r: quatFromAxisAngle([0, 1, 0], Math.PI / 2), s: [2, 3, 4] };
  const child = actor("b", { model: mesh() });
  child.parent = parent.id;
  child.transform.p = [1, 2, 3];
  const grandchild = actor("c", { model: mesh() });
  grandchild.parent = child.id;
  grandchild.transform.p = [0, 1, 0];
  const lookup = lookupOf([parent, child, grandchild]);
  const placements = hlodPlacementsOf([child, grandchild], lookup, noClass);
  closeMatrix(placements[0]!.matrix, [0, 0, -2, 0, 0, 3, 0, 0, 4, 0, 0, 0, 22, 26, 28, 1]);
  closeMatrix(placements[1]!.matrix, [0, 0, -2, 0, 0, 3, 0, 0, 4, 0, 0, 0, 22, 29, 28, 1]);
});

test("HLOD applies component local transforms from root down and emits every mesh", () => {
  const doc = actor("a", {
    pivot: { type: "forge.shape@1", local: { p: [1, 0, 0], r: quatFromAxisAngle([0, 1, 0], Math.PI / 2), s: [2, 1, 3] } },
    model: { ...mesh(), parent: "pivot", local: { ...IDENTITY_TRANSFORM, p: [0, 0, 2] } },
    other: { ...mesh(), parent: null, mesh: assetId("6"), materials: [], color: null },
  });
  doc.transform.p = [10, 0, 0];
  const placements = hlodPlacementsOf([doc], lookupOf([doc]), noClass);
  assert.equal(placements.length, 2);
  closeMatrix(placements[0]!.matrix, [0, 0, -2, 0, 0, 1, 0, 0, 3, 0, 0, 0, 17, 0, 0, 1]);
  assert.deepEqual(placements[1], { model: assetId("6"), materials: [], color: null,
    matrix: composeMat4([10, 0, 0], [0, 0, 0, 1], [1, 1, 1]) });
});

test("HLOD ignores shapes, null meshes, unrelated tags and actors without meshes", () => {
  const docs = [actor("a"), actor("b", {
    shape: { ...mesh(), type: "forge.shape@1" }, empty: { ...mesh(), mesh: null },
    unrelated: { ...mesh(), type: "game.staticMesh@2" },
  })];
  assert.deepEqual(hlodPlacementsOf(docs, lookupOf(docs), noClass), []);
});

test("HLOD component parent cycles and missing parents terminate with each reachable local applied once", () => {
  for (const parent of ["pivot", "missing"]) {
    const doc = actor("a", {
      model: { ...mesh(), parent, local: { ...IDENTITY_TRANSFORM, p: [1, 0, 0] } },
      pivot: { type: "forge.shape@1", parent: "model", local: { ...IDENTITY_TRANSFORM, p: [0, 2, 0] } },
    });
    closeMatrix(hlodPlacementsOf([doc], lookupOf([doc]), noClass)[0]!.matrix,
      composeMat4([1, parent === "pivot" ? 2 : 0, 0], [0, 0, 0, 1], [1, 1, 1]));
  }
});

test("HLOD hash ignores placement order and float noise below the 1e-4 rounding threshold", () => {
  const a = placement();
  const b = { ...placement(), model: assetId("4") };
  const expected = hlodCellSourceHash([a, b]);
  assert.match(expected, /^[0-9a-f]{8}$/);
  assert.equal(expected, hlodCellSourceHash([b, a]));
  assert.equal(expected, hlodCellSourceHash([{ ...a, matrix: a.matrix.map((n) => n + 1e-5) }, b]));
  assert.equal(hlodCellSourceHash([]), "741638a5");
});

test("HLOD hash changes with model, material slots, colour, matrix and placement multiplicity", () => {
  const base = placement();
  const expected = hlodCellSourceHash([base]);
  for (const changed of [
    { ...base, model: assetId("4") }, { ...base, materials: [assetId("5"), null] },
    { ...base, materials: [null, MATERIAL] }, { ...base, materials: [] },
    { ...base, color: null }, { ...base, color: "#ffffff" },
    ...[composeMat4([0.001, 0, 0], [0, 0, 0, 1], [1, 1, 1]),
      composeMat4([0, 0, 0], quatFromAxisAngle([0, 1, 0], 0.1), [1, 1, 1]),
      composeMat4([0, 0, 0], [0, 0, 0, 1], [1, 2, 1])].map((matrix) => ({ ...base, matrix })),
  ]) assert.notEqual(expected, hlodCellSourceHash([changed]));
  assert.notEqual(expected, hlodCellSourceHash([base, base]));
});

test("HLOD inclusion preserves the scaled detail culling threshold and never-culled assets", () => {
  assert.equal(hlodIncludesPlacement(0.5, 1, 128), false);
  assert.equal(hlodIncludesPlacement(0.5, 2, 128), true);
  assert.equal(hlodIncludesPlacement(0.5, -2, 128), true);
  assert.equal(hlodIncludesPlacement(0.5, 1, 100), false);
  assert.equal(hlodIncludesPlacement(0.5, 1, 99), true);
  assert.equal(hlodIncludesPlacement(5, 1, 1000), false);
  assert.equal(hlodIncludesPlacement(5.01, 1, Infinity), true);
  assert.equal(hlodIncludesPlacement(1, 6, Infinity), true);
});

test("HLOD maxAxisScale handles rotation, mirrored axes, zero scale and translation", () => {
  assert.equal(maxAxisScale(IDENTITY_MAT4), 1);
  assert.equal(maxAxisScale(composeMat4([100, 200, 300], [0, 0, 0, 1], [-2, 3, -4])), 4);
  assert.equal(maxAxisScale(composeMat4([0, 0, 0], [0, 0, 0, 1], [0, 0, 0])), 0);
  const matrix = composeMat4([0, 0, 0], quatFromAxisAngle([0, 1, 0], 0.7), [-5, 2, 3]);
  assert.ok(Math.abs(maxAxisScale(matrix) - 5) < 1e-10);
});

// Forge tests/engine/hlod.test.ts pixel check body, unchanged (not an A check).
test("hlod: pixel averages decode sRGB and ignore nearly transparent pixels", () => {
  const grey = averageLinearColor(new Uint8Array([128, 128, 128]), 3);
  assert.ok(grey.every((channel) => Math.abs(channel - 0.2158) < 1e-3));
  assert.deepEqual(averageLinearColor(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 7]), 4), [1, 0, 0]);
  assert.deepEqual(averageLinearColor(new Uint8Array(), 4), [1, 1, 1]);
  assert.deepEqual(averageLinearColor(new Uint8Array([0, 0, 0, 0]), 4), [1, 1, 1]);
  assert.deepEqual(averageLinearColor(new Uint8Array([0, 0, 0, 255, 255, 255]), 3), [0.5, 0.5, 0.5]);
});
