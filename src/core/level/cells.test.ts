import { describe, expect, test } from "vitest";
import {
  assignCells,
  cellAt,
  cellBounds,
  cellKey,
  compareCellKeys,
  exceedsCell,
  isCellKey,
  parseCellKey,
} from "./cells.ts";
import type { ActorDoc } from "./model.ts";
import { normalizeLevel } from "./normalizeLevel.ts";
import { actorId, CAR_CLASS_ID, createOptions, levelId, summary } from "./testKit.ts";

const STRICT = createOptions(true);
const LENIENT = createOptions(false);
const SETTINGS = { cellSize: 100 };

describe("cell keys", () => {
  test("round trip, negatives included", () => {
    for (const coord of [{ x: 0, z: 0 }, { x: -3, z: 7 }, { x: 12, z: -1 }]) {
      expect(parseCellKey(cellKey(coord))).toEqual(coord);
    }
    expect(cellKey({ x: -0, z: -0 })).toBe("0_0");
  });

  test.each(["", "1", "1_", "_1", "1_2_3", "a_b", "01_2", "-0_0", "1.5_2", "+1_2", " 1_2"])(
    "%j is not a key",
    (key) => {
      expect(parseCellKey(key)).toBeNull();
      expect(isCellKey(key)).toBe(false);
    },
  );

  test("order is row by row: z, then x", () => {
    const keys = ["1_0", "0_1", "-1_0", "0_-1", "0_0"];
    expect([...keys].sort(compareCellKeys)).toEqual(["0_-1", "-1_0", "0_0", "1_0", "0_1"]);
  });
});

describe("grid", () => {
  test("a point on an edge belongs to the cell whose min edge it is", () => {
    expect(cellAt(100, 0, 0)).toEqual({ x: 0, z: 0 });
    expect(cellAt(100, 99.999, 100)).toEqual({ x: 0, z: 1 });
    expect(cellAt(100, -0.001, -100)).toEqual({ x: -1, z: -1 });
    expect(cellAt(100, -100.001, 250)).toEqual({ x: -2, z: 2 });
  });

  test("bounds of a cell", () => {
    expect(cellBounds(100, { x: -1, z: 2 })).toEqual({ minX: -100, minZ: 200, maxX: 0, maxZ: 300 });
  });

  test("an actor larger than a cell on either axis exceeds it", () => {
    expect(exceedsCell(100, { width: 100, depth: 100 })).toBe(false);
    expect(exceedsCell(100, { width: 100.5, depth: 10 })).toBe(true);
    expect(exceedsCell(100, { width: 10, depth: 101 })).toBe(true);
  });
});

const IDENTITY = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };

function actor(seed: string, x: number, z: number, extra: Record<string, unknown> = {}): unknown {
  return { id: actorId(seed), transform: { ...IDENTITY, p: [x, 5, z] }, components: {}, ...extra };
}

function actorsOf(raw: unknown[]): ActorDoc[] {
  const result = normalizeLevel({ schema: "forge.level/1", id: levelId("1"), actors: raw }, LENIENT);
  return result.value!.actors;
}

function cells(actors: ActorDoc[], options = STRICT): Record<string, string | null> {
  const result = assignCells(actors, SETTINGS, options);
  return Object.fromEntries([...result.value].map(([id, key]) => [id.slice(4, 5), key]));
}

describe("assignment", () => {
  test("a root actor goes to the cell of its X/Z position; Y does not matter", () => {
    const actors = actorsOf([actor("a", 10, 10), actor("b", 150, -20), actor("c", -1, 300)]);
    expect(cells(actors)).toEqual({ a: "0_0", b: "1_-1", c: "-1_3" });
  });

  test("a child stays with its root, wherever it stands and whatever its flag says", () => {
    const actors = actorsOf([
      actor("c", 900, 900, { parent: actorId("b"), spatiallyLoaded: false }),
      actor("b", 500, 500, { parent: actorId("a") }),
      actor("a", 10, 10),
    ]);
    expect(cells(actors)).toEqual({ a: "0_0", b: "0_0", c: "0_0" });
  });

  test("a root that is not spatially loaded keeps its whole tree persistent", () => {
    const actors = actorsOf([
      actor("a", 10, 10, { spatiallyLoaded: false }),
      actor("b", 500, 500, { parent: actorId("a") }),
      actor("c", 500, 500),
    ]);
    expect(cells(actors)).toEqual({ a: null, b: null, c: "5_5" });
  });

  test("a tree that holds a singleton component anywhere is persistent", () => {
    const actors = actorsOf([
      actor("a", 10, 10),
      actor("b", 10, 10, { parent: actorId("a"), components: { fog: { type: "test.fog@2" } } }),
      actor("c", 10, 10, { components: { fog: { type: "test.fog@2" } } }),
      actor("d", 10, 10),
    ]);
    const result = cells(actors, LENIENT);
    expect(result).toEqual({ a: null, b: null, c: null, d: "0_0" });
  });

  test("a class actor is placed like any other; its class components count for singletons", () => {
    const actors = actorsOf([actor("a", 250, 10, { class: CAR_CLASS_ID, components: undefined })]);
    expect(cells(actors)).toEqual({ a: "2_0" });
  });

  test("a missing parent or a loop keeps the actor persistent and is reported", () => {
    // Normalisation repairs these links; assignment must not rely on that.
    const actors = actorsOf([actor("a", 10, 10), actor("b", 10, 10), actor("c", 10, 10), actor("d", 10, 10), actor("e", 10, 10)]);
    const parents = [actorId("9"), actorId("a"), actorId("d"), actorId("c")];
    parents.forEach((parent, index) => {
      actors[index]!.parent = parent;
    });
    const strict = assignCells(actors, SETTINGS, STRICT);
    expect(summary(strict.issues)).toEqual([
      "error invalid-parent actors[0].parent",
      "error invalid-parent actors[1].parent",
      "error invalid-parent actors[2].parent",
      "error invalid-parent actors[3].parent",
    ]);
    expect(strict.ok).toBe(false);
    expect(cells(actors, LENIENT)).toEqual({ a: null, b: null, c: null, d: null, e: "0_0" });
    expect(strict.issues[0]?.message).toContain(actorId("9"));
  });

  test("the input is not changed and the order of actors does not matter", () => {
    const raw = [actor("b", 10, 10, { parent: actorId("a") }), actor("a", 150, 10)];
    const actors = actorsOf(raw);
    const copy = structuredClone(actors);
    const forward = cells(actors);
    expect(cells([...actors].reverse())).toEqual(forward);
    expect(actors).toEqual(copy);
  });
});
