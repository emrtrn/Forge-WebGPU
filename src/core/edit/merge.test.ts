import { describe, expect, test } from "vitest";
import type { ActorId } from "../id.ts";
import type { ActorDoc, LevelDoc } from "../level/model.ts";
import { normalizeLevel } from "../level/normalizeLevel.ts";
import { actorId, createOptions, levelId } from "../level/testKit.ts";
import { jsonEqual, mergeJson, planLevelMerge } from "./merge.ts";

describe("mergeJson", () => {
  test("each side's change to a different key survives, at any depth", () => {
    const base = { transform: { p: [0, 0, 0], s: [1, 1, 1] }, components: { shape: { color: "#fff", size: 1 } } };
    const mine = { transform: { p: [5, 0, 0], s: [1, 1, 1] }, components: { shape: { color: "#fff", size: 1 } } };
    const theirs = { transform: { p: [0, 0, 0], s: [1, 1, 1] }, components: { shape: { color: "#f00", size: 1 } } };
    expect(mergeJson(base, mine, theirs)).toEqual({
      value: { transform: { p: [5, 0, 0], s: [1, 1, 1] }, components: { shape: { color: "#f00", size: 1 } } },
      conflicts: [],
    });
  });

  test("the same place changed differently is a conflict; arrays are whole values", () => {
    const base = { p: [0, 0, 0] };
    const result = mergeJson(base, { p: [5, 0, 0] }, { p: [0, 0, 7] });
    expect(result.conflicts).toEqual([{ path: ["p"], base: [0, 0, 0], mine: [5, 0, 0], theirs: [0, 0, 7] }]);
    expect(result.value).toEqual({ p: [5, 0, 0] });
    expect(mergeJson(base, { p: [5, 0, 0] }, { p: [0, 0, 7] }, () => "theirs").value).toEqual({ p: [0, 0, 7] });
  });

  test("the same change on both sides is no conflict", () => {
    expect(mergeJson({ a: 1 }, { a: 2 }, { a: 2 })).toEqual({ value: { a: 2 }, conflicts: [] });
  });

  test("added and removed keys: one side's addition stays, one side's removal of an unchanged key goes", () => {
    expect(mergeJson({ a: 1, b: 2 }, { a: 1, b: 2, c: 3 }, { a: 1 }).value).toEqual({ a: 1, c: 3 });
  });

  test("a removal on one side and a change on the other conflict at the removed place", () => {
    const base = { components: { light: { intensity: 1 } } };
    const result = mergeJson(base, { components: { light: { intensity: 2 } } }, { components: {} });
    expect(result.conflicts.map((conflict) => conflict.path)).toEqual([["components", "light"]]);
    expect(mergeJson(base, { components: { light: { intensity: 2 } } }, { components: {} }, () => "theirs").value).toEqual({ components: {} });
  });

  test("whole values: a deleted document against an unchanged one goes, against a changed one conflicts", () => {
    expect(mergeJson({ a: 1 }, undefined, { a: 1 }).value).toBeUndefined();
    expect(mergeJson({ a: 1 }, undefined, { a: 2 }).conflicts).toEqual([{ path: [], base: { a: 1 }, mine: undefined, theirs: { a: 2 } }]);
  });

  test("jsonEqual ignores key order and absent keys", () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
  });
});

const OPTIONS = createOptions(true);
const actor = (seed: string, x: number, extra: Record<string, unknown> = {}): unknown => ({ id: actorId(seed), name: seed, transform: { p: [x, 0, 0] }, components: {}, ...extra });
const level = (actors: unknown[], settings: Record<string, unknown> = { cellSize: 100 }): LevelDoc =>
  normalizeLevel({ schema: "forge.level/1", id: levelId("1"), settings, actors }, OPTIONS).value as LevelDoc;
const byId = (doc: LevelDoc): Map<ActorId, ActorDoc> => new Map(doc.actors.map((one) => [one.id, one]));

describe("planLevelMerge", () => {
  test("names what merges by itself and what conflicts; the merged order is the disk's, then the session's new actors", () => {
    const base = level([actor("a", 0), actor("b", 0), actor("c", 0), actor("d", 0)]);
    const mine = level([actor("a", 5), actor("b", 0), actor("c", 3), actor("d", 0), actor("e", 1)]);
    const theirs = level([actor("d", 0, { name: "renamed" }), actor("b", 9), actor("c", 4), actor("f", 2)]);
    const merge = planLevelMerge({ base: { settings: base.settings, actors: byId(base) }, mine, theirs });
    // a: only mine moved it, but the disk removed it: a conflict (removed against changed).
    expect(merge.conflicts.map((conflict) => conflict.label).sort()).toEqual(["a", "c"]);
    expect(merge.fromMine.map((id) => id.slice(4, 5)).sort()).toEqual(["e"]);
    expect(merge.fromTheirs.map((id) => id.slice(4, 5)).sort()).toEqual(["b", "d", "f"]);
    const resolved = merge.resolve((key) => (key === actorId("a") ? "theirs" : "mine"));
    expect((resolved.actors as ActorDoc[]).map((one) => [one.name, one.transform.p[0]])).toEqual([
      ["renamed", 0],
      ["b", 9],
      ["c", 3],
      ["f", 2],
      ["e", 1],
    ]);
  });

  test("settings changed on the disk alone come along; both sides changing them conflict", () => {
    const base = level([]);
    const theirs = level([], { cellSize: 256 });
    const alone = planLevelMerge({ base: { settings: base.settings, actors: byId(base) }, mine: level([]), theirs });
    expect(alone.settingsFromTheirs).toBe(true);
    expect(alone.resolve().settings).toMatchObject({ cellSize: 256 });
    const both = planLevelMerge({ base: { settings: base.settings, actors: byId(base) }, mine: level([], { cellSize: 64 }), theirs });
    expect(both.conflicts.map((conflict) => conflict.key)).toEqual(["settings"]);
  });
});
