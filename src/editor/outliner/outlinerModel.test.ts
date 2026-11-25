import { describe, expect, test } from "vitest";
import type { ActorId } from "../../core/index.ts";
import { OUTLINER_TYPES, type OutlinerType } from "../host/featureEditor.ts";
import { folderChain, freeFolder, outlinerRows as rowsOf, rangeIds, revealScrollTop, visibleWindow, type OutlinerQuery, type OutlinerSource } from "./outlinerModel.ts";

const ALL = new Set<OutlinerType>(OUTLINER_TYPES.map((entry) => entry.type));
const item = (id: string, parent: string | null = null, type: OutlinerType = "mesh", name = id, folder = ""): OutlinerSource => ({ id: id as ActorId, parent: parent as ActorId | null, name, type, folder });
const outlinerRows = (items: readonly OutlinerSource[], query: Omit<OutlinerQuery, "openFolders" | "folders"> & Partial<OutlinerQuery>) => rowsOf(items, { openFolders: new Set<string>(), folders: [], ...query });
const show = (rows: ReturnType<typeof outlinerRows>) => rows.map((row) => `${"  ".repeat(row.depth)}${row.kind === "folder" ? `[${row.name} ${row.ids.length}]` : row.id}${row.hasChildren ? (row.expanded ? " -" : " +") : ""}`);

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

describe("folders", () => {
  // Two fences and a house of a generated world, a child under a house, a lamp at the root.
  const WORLD = [
    item("f1", null, "mesh", "f1", "World/Fences"), item("lamp"), item("h", null, "mesh", "h", "World/Buildings"),
    item("door", "h", "mesh", "door", "Elsewhere"), item("f2", null, "mesh", "f2", "World/Fences"),
  ];
  const query = { filter: "", types: ALL, collapsed: new Set<ActorId>() };
  const open = (...paths: string[]) => ({ ...query, openFolders: new Set(paths) });

  test("folders come first, by name, and start closed; an open one shows its subfolders, then its actors", () => {
    expect(show(outlinerRows(WORLD, query))).toEqual(["[World 3] +", "lamp"]);
    expect(show(outlinerRows(WORLD, open("World")))).toEqual(["[World 3] -", "  [Buildings 1] +", "  [Fences 2] +", "lamp"]);
    expect(show(outlinerRows(WORLD, open("World", "World/Buildings", "World/Fences")))).toEqual(["[World 3] -", "  [Buildings 1] -", "    h -", "      door", "  [Fences 2] -", "    f1", "    f2", "lamp"]);
    // An open folder inside a closed one is not drawn.
    expect(show(outlinerRows(WORLD, open("World/Fences")))).toEqual(["[World 3] +", "lamp"]);
  });

  test("an empty folder of the page's is shown; a search is flat and the type filter empties a folder away", () => {
    expect(show(outlinerRows(WORLD, { ...query, folders: ["Props"] }))).toEqual(["[Props 0]", "[World 3] +", "lamp"]);
    expect(show(outlinerRows(WORLD, { ...query, filter: "f" }))).toEqual(["f1", "f2"]);
    expect(show(outlinerRows(WORLD, { ...query, types: new Set<OutlinerType>(["light"]) }))).toEqual([]);
  });

  test("a range skips folder rows; the chain opens outermost first; a taken name is numbered", () => {
    const rows = outlinerRows(WORLD, open("World", "World/Buildings", "World/Fences"));
    expect(rangeIds(rows, "door" as ActorId, "f1" as ActorId)).toEqual(["door", "f1"]);
    expect(folderChain("World/Fences/Old")).toEqual(["World", "World/Fences", "World/Fences/Old"]);
    expect(freeFolder("World", "New Folder", (path) => path === "World/New Folder")).toBe("World/New Folder 2");
    expect(freeFolder("", "New Folder", () => false)).toBe("New Folder");
  });

  test("50.000 actors in folders come out in linear time", () => {
    const many = Array.from({ length: 50_000 }, (_, index) => item(`n${index}`, null, "mesh", `n${index}`, `World/Part ${index % 50}`));
    const started = performance.now();
    expect(outlinerRows(many, open("World"))).toHaveLength(51);
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
