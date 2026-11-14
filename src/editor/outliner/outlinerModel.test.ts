import { describe, expect, test } from "vitest";
import type { ActorId } from "../../core/index.ts";
import { OUTLINER_TYPES, type OutlinerType } from "../host/featureEditor.ts";
import { outlinerRows, rangeIds, revealScrollTop, visibleWindow, type OutlinerSource } from "./outlinerModel.ts";

const ALL = new Set<OutlinerType>(OUTLINER_TYPES.map((entry) => entry.type));
const item = (id: string, parent: string | null = null, type: OutlinerType = "mesh", name = id): OutlinerSource => ({ id: id as ActorId, parent: parent as ActorId | null, name, type });
const show = (rows: ReturnType<typeof outlinerRows>) => rows.map((row) => `${"  ".repeat(row.depth)}${row.id}${row.hasChildren ? (row.expanded ? " -" : " +") : ""}`);

// g groups a and b; b holds c. l is a light; d is a root after them.
const LEVEL = [item("a", "g"), item("g", null, "gameplay", "Group"), item("b", "g"), item("l", null, "light", "Sun"), item("c", "b"), item("d")];

describe("the Outliner's rows", () => {
  test("the tree is depth first, children under their parent in the level's order", () => {
    expect(show(outlinerRows(LEVEL, { filter: "", types: ALL, collapsed: new Set() }))).toEqual(["g -", "  a", "  b -", "    c", "l", "d"]);
  });

  test("a collapsed row hides its descendants", () => {
    expect(show(outlinerRows(LEVEL, { filter: "", types: ALL, collapsed: new Set(["b" as ActorId]) }))).toEqual(["g -", "  a", "  b +", "l", "d"]);
    expect(show(outlinerRows(LEVEL, { filter: "", types: ALL, collapsed: new Set(["g" as ActorId]) }))).toEqual(["g +", "l", "d"]);
  });

  test("an actor whose parent the type filter hides shows at the root", () => {
    const types = new Set<OutlinerType>(["mesh", "light"]);
    expect(show(outlinerRows(LEVEL, { filter: "", types, collapsed: new Set() }))).toEqual(["a", "b -", "  c", "l", "d"]);
  });

  test("a search lists the names that start with it, any case, flat (Forge)", () => {
    const named = [item("x", null, "mesh", "Crate"), item("y", "x", "mesh", "crate lid"), item("z", null, "mesh", "Old crate")];
    expect(show(outlinerRows(named, { filter: " CRA", types: ALL, collapsed: new Set() }))).toEqual(["x", "y"]);
  });

  test("50.000 actors in a deep chain and wide groups come out in linear time without a stack overflow", () => {
    const many: OutlinerSource[] = [];
    for (let index = 0; index < 50_000; index += 1) many.push(item(`n${index}`, index % 2 === 1 ? `n${index - 1}` : index > 0 && index < 20_000 ? "n0" : null));
    const chain: OutlinerSource[] = [];
    for (let index = 0; index < 20_000; index += 1) chain.push(item(`c${index}`, index === 0 ? null : `c${index - 1}`));
    const started = performance.now();
    const rows = outlinerRows(many, { filter: "", types: ALL, collapsed: new Set() });
    const deep = outlinerRows(chain, { filter: "", types: ALL, collapsed: new Set() });
    expect(rows).toHaveLength(50_000);
    expect(deep.at(-1)?.depth).toBe(19_999);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe("selecting a range and the drawn window", () => {
  const rows = outlinerRows(LEVEL, { filter: "", types: ALL, collapsed: new Set() });

  test("Shift + click takes the rows between the anchor and the target, either way", () => {
    expect(rangeIds(rows, "a" as ActorId, "l" as ActorId)).toEqual(["a", "b", "c", "l"]);
    expect(rangeIds(rows, "l" as ActorId, "a" as ActorId)).toEqual(["a", "b", "c", "l"]);
    expect(rangeIds(rows, null, "c" as ActorId)).toEqual(["c"]);
    expect(rangeIds(rows, "gone" as ActorId, "c" as ActorId)).toEqual(["c"]);
  });

  test("the window covers the view and the overscan, clamped to the list", () => {
    expect(visibleWindow(0, 400, 40, 50_000, 8)).toEqual({ start: 0, end: 18 });
    expect(visibleWindow(40_000, 400, 40, 50_000, 8)).toEqual({ start: 992, end: 1018 });
    expect(visibleWindow(1_999_600, 400, 40, 50_000, 8)).toEqual({ start: 49_982, end: 50_000 });
    expect(visibleWindow(0, 400, 40, 3, 8)).toEqual({ start: 0, end: 3 });
  });

  test("revealing a row scrolls only when it is out of view", () => {
    expect(revealScrollTop(5, 0, 400, 40)).toBeNull();
    expect(revealScrollTop(20, 0, 400, 40)).toBe(440);
    expect(revealScrollTop(2, 400, 400, 40)).toBe(80);
  });
});
