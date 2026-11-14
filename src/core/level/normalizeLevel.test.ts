import { describe, expect, test } from "vitest";
import { normalizeLevel } from "./normalizeLevel.ts";
import { actorId, assetId, CAR_CLASS_ID, createOptions, levelId, MESH_ID, summary } from "./testKit.ts";

const IDENTITY = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
const STRICT = createOptions(true);
const LENIENT = createOptions(false);

/** A level already in normal form: what a save writes. */
const CANONICAL = {
  schema: "forge.level/1",
  id: levelId("1"),
  settings: { cellSize: 128 },
  actors: [
    {
      id: actorId("a"),
      name: "Exponential Height Fog",
      class: null,
      parent: null,
      spatiallyLoaded: true,
      transform: IDENTITY,
      components: {
        fog: { type: "test.fog@2", density: 0.05, heightFalloff: 0.2, color: "#b8c4d6" },
      },
    },
    {
      id: actorId("b"),
      name: "Crate",
      class: null,
      parent: actorId("a"),
      spatiallyLoaded: true,
      transform: { p: [4, 0, -2], r: [0, 0.7071, 0, 0.7071], s: [1, 1, 1] },
      components: {
        hull: { type: "test.collider@1", parent: null, local: IDENTITY, size: [1, 1, 1] },
        visual: {
          type: "test.staticMesh@1",
          parent: "hull",
          local: { p: [0, 0.5, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
          mesh: MESH_ID,
        },
      },
    },
    {
      id: actorId("c"),
      name: "Reference Car",
      class: CAR_CLASS_ID,
      parent: null,
      spatiallyLoaded: true,
      transform: { p: [12, 0, 4], r: [0, 0, 0, 1], s: [1, 1, 1] },
      pivot: [0, 0.5, -1.25],
      overrides: {
        chassis: { type: "test.collider@1", local: { p: [0, 1.2, 0], r: [0, 0, 0, 1], s: [1, 1, 1] } },
        driver: { type: "test.driver@1", targetSpeed: 18 },
      },
    },
  ],
};

function level(actors: unknown[], extra: Record<string, unknown> = {}): unknown {
  return { schema: "forge.level/1", id: levelId("1"), actors, ...extra };
}

function plain(seed: string, components: Record<string, unknown>, extra: Record<string, unknown> = {}): unknown {
  return { id: actorId(seed), name: "A", class: null, parent: null, spatiallyLoaded: true, transform: IDENTITY, components, ...extra };
}

function car(seed: string, overrides: unknown, extra: Record<string, unknown> = {}): unknown {
  return { id: actorId(seed), name: "Car", class: CAR_CLASS_ID, parent: null, transform: IDENTITY, overrides, ...extra };
}

describe("serialisation round trip", () => {
  test("load -> save writes back exactly what was read", () => {
    const text = JSON.stringify(CANONICAL, null, 2);
    const loaded = normalizeLevel(JSON.parse(text), STRICT);
    expect(loaded.issues).toEqual([]);
    expect(loaded.ok).toBe(true);
    const saved = normalizeLevel(loaded.value, STRICT);
    expect(saved.issues).toEqual([]);
    expect(JSON.stringify(saved.value, null, 2)).toBe(text);
  });

  test("a sparse or messy document settles in one pass and then stays put", () => {
    const messy = {
      actors: [
        { components: { fog: { density: 0.05, type: "test.fog@1", falloff: 0.2 } }, id: actorId("a"), name: "Exponential Height Fog" },
        {
          transform: { r: [0, 0.7071, 0, 0.7071], p: [4, 0, -2] },
          parent: actorId("a"),
          name: "Crate",
          id: actorId("b"),
          components: {
            hull: { type: "test.collider@1" },
            visual: { mesh: MESH_ID, local: { p: [0, 0.5, 0] }, parent: "hull", type: "test.staticMesh@1" },
          },
        },
        {
          id: actorId("c"),
          name: "Reference Car",
          class: CAR_CLASS_ID,
          transform: { p: [12, 0, 4] },
          // driver before chassis, a partial local, and an override equal to the class value
          pivot: [0, 0.5, -1.25],
          overrides: { driver: { targetSpeed: 18, target: null }, chassis: { local: { p: [0, 1.2, 0] } } },
        },
      ],
      id: levelId("1"),
      schema: "forge.level/1",
    };
    const first = normalizeLevel(messy, STRICT);
    expect(first.issues).toEqual([]);
    expect(JSON.stringify(first.value)).toBe(JSON.stringify(CANONICAL));
    const second = normalizeLevel(first.value, STRICT);
    expect(JSON.stringify(second.value)).toBe(JSON.stringify(first.value));
  });

  test("a component stored at an old version is migrated and saved at the current one", () => {
    const result = normalizeLevel(level([plain("a", { fog: { type: "test.fog@1", falloff: 1.5 } })]), STRICT);
    expect(result.issues).toEqual([]);
    expect(result.value?.actors[0]).toMatchObject({
      components: { fog: { type: "test.fog@2", heightFalloff: 1.5 } },
    });
  });

  test("the output shares nothing with the input", () => {
    const input = structuredClone(CANONICAL);
    const { value } = normalizeLevel(input, STRICT);
    value!.actors[1]!.transform.p[0] = 99;
    (value!.actors[2] as { overrides: Record<string, Record<string, unknown>> }).overrides.driver!.targetSpeed = 1;
    expect(input).toEqual(CANONICAL);
  });
});

describe("documents that cannot be read", () => {
  test.each([
    ["not an object", [], ""],
    ["another schema", { schema: "forge.level/2", id: levelId("1"), actors: [] }, "schema"],
    ["no schema", { id: levelId("1"), actors: [] }, "schema"],
    ["an id of the wrong kind", { schema: "forge.level/1", id: actorId("1"), actors: [] }, "id"],
  ])("%s is fatal in every mode", (_name, raw, path) => {
    for (const options of [STRICT, LENIENT]) {
      const result = normalizeLevel(raw, options);
      expect(result.value).toBeNull();
      expect(result.ok).toBe(false);
      expect(summary(result.issues)).toEqual([`error invalid-document ${path}`]);
    }
  });
});

describe("unknown fields", () => {
  const raw = level([plain("a", { fog: { type: "test.fog@2", haze: 1 } }, { layer: "sky" })], { cells: [] });
  const expected = ["unknown-field actors[0].layer", "unknown-field actors[0].components.fog.haze", "unknown-field cells"];

  test("are an error in development: the load or save is refused", () => {
    const result = normalizeLevel(raw, STRICT);
    expect(summary(result.issues)).toEqual(expected.map((entry) => `error ${entry}`));
    expect(result.ok).toBe(false);
  });

  test("are a report in production: the level still loads, without them", () => {
    const result = normalizeLevel(raw, LENIENT);
    expect(summary(result.issues)).toEqual(expected.map((entry) => `warning ${entry}`));
    expect(result.ok).toBe(true);
    expect(result.value?.actors[0]).toEqual(plain("a", { fog: { type: "test.fog@2", density: 0.02, heightFalloff: 0.2, color: "#b8c4d6" } }));
  });
});

describe("actors", () => {
  test("missing parts take defaults", () => {
    const result = normalizeLevel(level([{ id: actorId("a") }]), STRICT);
    expect(result.issues).toEqual([]);
    expect(result.value?.actors).toEqual([
      { id: actorId("a"), name: "Actor", class: null, parent: null, spatiallyLoaded: true, transform: IDENTITY, components: {} },
    ]);
  });

  test("an actor without a usable id or class is dropped", () => {
    const result = normalizeLevel(
      level(["actor", { name: "No id" }, { id: assetId("a") }, { id: actorId("a"), class: "car" }, { id: actorId("b") }]),
      LENIENT,
    );
    expect(summary(result.issues)).toEqual([
      "warning invalid-value actors[0]",
      "warning invalid-value actors[1].id",
      "warning invalid-value actors[2].id",
      "warning invalid-value actors[3].class",
    ]);
    expect(result.value?.actors.map((actor) => actor.id)).toEqual([actorId("b")]);
  });

  test("an id is used once; the later actor is dropped", () => {
    const raw = level([plain("a", {}, { name: "First" }), plain("a", {}, { name: "Second" })]);
    const result = normalizeLevel(raw, STRICT);
    expect(summary(result.issues)).toEqual(["error duplicate-id actors[1].id"]);
    expect(result.value?.actors.map((actor) => actor.name)).toEqual(["First"]);
  });

  test("a parent is another actor of the same file, without a loop", () => {
    const raw = level([
      plain("a", {}, { parent: actorId("c") }),
      plain("b", {}, { parent: actorId("f") }),
      plain("c", {}, { parent: actorId("d") }),
      plain("d", {}, { parent: actorId("a") }),
      plain("e", {}, { parent: actorId("d") }),
    ]);
    const result = normalizeLevel(raw, STRICT);
    expect(summary(result.issues)).toEqual(["error invalid-parent actors[0].parent", "error invalid-parent actors[1].parent"]);
    expect(result.issues[1]?.message).toContain("not in this file");
    // Only the link that closes the loop is cut.
    expect(result.value?.actors.map((actor) => actor.parent)).toEqual([
      null,
      null,
      actorId("d"),
      actorId("a"),
      actorId("d"),
    ]);
  });

  test("an actor cannot be its own parent", () => {
    const raw = level([plain("a", {}, { parent: actorId("a") }), plain("b", {}, { parent: actorId("a") })]);
    const result = normalizeLevel(raw, STRICT);
    expect(summary(result.issues)).toEqual(["error invalid-value actors[0].parent"]);
    expect(result.value?.actors.map((actor) => actor.parent)).toEqual([null, actorId("a")]);
  });

  test("components and overrides do not mix", () => {
    const raw = level([
      plain("a", {}, { overrides: { driver: { targetSpeed: 1 } } }),
      car("b", {}, { components: { extra: { type: "test.driver@1" } } }),
    ]);
    const result = normalizeLevel(raw, STRICT);
    expect(summary(result.issues)).toEqual([
      "error unknown-field actors[0].overrides",
      "error unknown-field actors[1].components",
    ]);
    expect(result.value?.actors[0]).not.toHaveProperty("overrides");
    expect(result.value?.actors[1]).not.toHaveProperty("components");
  });
});

describe("components of an actor", () => {
  test("a component of an unregistered type or with a bad local id is dropped", () => {
    const raw = level([
      plain("a", {
        fog: { type: "test.fog@2" },
        rain: { type: "game.rain@1" },
        "0bad": { type: "test.driver@1" },
        "has-dash": { type: "test.driver@1" },
        raw: 5,
      }),
    ]);
    const result = normalizeLevel(raw, LENIENT);
    expect(summary(result.issues).sort()).toEqual([
      "warning invalid-value actors[0].components.0bad",
      "warning invalid-value actors[0].components.has-dash",
      "warning invalid-value actors[0].components.raw",
      "warning unknown-component-type actors[0].components.rain.type",
    ]);
    expect(Object.keys((result.value?.actors[0] as { components: object }).components)).toEqual(["fog"]);
  });

  test.each([
    ["a parent that is not in the actor", { a: { type: "test.collider@1", parent: "ghost" } }, ["a"]],
    [
      "a parent that is not spatial",
      { a: { type: "test.collider@1", parent: "d" }, d: { type: "test.driver@1" } },
      ["a"],
    ],
    ["itself as parent", { a: { type: "test.collider@1", parent: "a" } }, ["a"]],
    [
      "a loop",
      {
        a: { type: "test.collider@1", parent: "c" },
        b: { type: "test.collider@1", parent: "a" },
        c: { type: "test.collider@1", parent: "b" },
        leaf: { type: "test.collider@1", parent: "c" },
      },
      ["a"],
    ],
  ])("a spatial component with %s is attached to the actor root", (_name, components, reset) => {
    const result = normalizeLevel(level([plain("a", components)]), STRICT);
    expect(summary(result.issues)).toEqual(
      reset.map((key) => `error invalid-parent actors[0].components.${key}.parent`),
    );
    const kept = (result.value?.actors[0] as { components: Record<string, { parent: unknown }> }).components;
    for (const key of reset) {
      expect(kept[key]?.parent).toBeNull();
    }
  });

  test("only the link that closes a loop is cut", () => {
    const components = {
      a: { type: "test.collider@1", parent: "c" },
      b: { type: "test.collider@1", parent: "a" },
      c: { type: "test.collider@1", parent: "b" },
    };
    const result = normalizeLevel(level([plain("a", components)]), LENIENT);
    const kept = (result.value?.actors[0] as { components: Record<string, { parent: unknown }> }).components;
    expect([kept.a?.parent, kept.b?.parent, kept.c?.parent]).toEqual([null, "a", "b"]);
  });
});

describe("singleton components", () => {
  test("a second one in the level is reported and nothing is dropped", () => {
    const raw = level([plain("a", { fog: { type: "test.fog@2" } }), plain("b", { mist: { type: "test.fog@2" } })]);
    const strict = normalizeLevel(raw, STRICT);
    expect(summary(strict.issues)).toEqual(["error singleton-conflict actors[1].components.mist"]);
    expect(strict.ok).toBe(false);
    const lenient = normalizeLevel(raw, LENIENT);
    expect(summary(lenient.issues)).toEqual(["warning singleton-conflict actors[1].components.mist"]);
    expect(lenient.value?.actors).toHaveLength(2);
  });

  test("components that are not singletons repeat freely", () => {
    const raw = level([plain("a", { one: { type: "test.driver@1" }, two: { type: "test.driver@1" } })]);
    expect(normalizeLevel(raw, STRICT).issues).toEqual([]);
  });
});

describe("level settings and the streaming flag (A11)", () => {
  test("a level without settings takes the default grid", () => {
    const result = normalizeLevel(level([]), STRICT);
    expect(result.issues).toEqual([]);
    expect(result.value?.settings).toEqual({ cellSize: 128 });
  });

  test("a cell size out of range is pulled to the limit with a warning", () => {
    const small = normalizeLevel(level([], { settings: { cellSize: 2 } }), STRICT);
    expect(summary(small.issues)).toEqual(["warning clamped settings.cellSize"]);
    expect(small.value?.settings.cellSize).toBe(16);
    const large = normalizeLevel(level([], { settings: { cellSize: 1e6 } }), STRICT);
    expect(large.value?.settings.cellSize).toBe(4096);
  });

  test("settings of the wrong shape or with unknown keys are a loss", () => {
    expect(summary(normalizeLevel(level([], { settings: 64 }), STRICT).issues)).toEqual([
      "error invalid-value settings",
    ]);
    const unknown = normalizeLevel(level([], { settings: { cellSize: 64, loadRange: 300 } }), LENIENT);
    expect(summary(unknown.issues)).toEqual(["warning unknown-field settings.loadRange"]);
    expect(unknown.value?.settings).toEqual({ cellSize: 64 });
  });

  test("an actor is spatially loaded unless it says otherwise", () => {
    const raw = level([plain("a", {}), plain("b", {}, { spatiallyLoaded: false })]);
    const result = normalizeLevel(raw, STRICT);
    expect(result.issues).toEqual([]);
    expect(result.value?.actors.map((actor) => actor.spatiallyLoaded)).toEqual([true, false]);
  });

  test("a flag that is not a boolean is a loss and reads as the default", () => {
    const result = normalizeLevel(level([plain("a", {}, { spatiallyLoaded: "no" })]), LENIENT);
    expect(summary(result.issues)).toEqual(["warning invalid-value actors[0].spatiallyLoaded"]);
    expect(result.value?.actors[0]?.spatiallyLoaded).toBe(true);
  });
});

describe("the authoring pivot (editor data)", () => {
  test("an origin pivot is left out of the canonical document", () => {
    const result = normalizeLevel(level([plain("a", {}, { pivot: [0, 0, 0] }), plain("b", {})]), STRICT);
    expect(result.issues).toEqual([]);
    expect(result.value?.actors.map((actor) => "pivot" in actor)).toEqual([false, false]);
  });

  test("a pivot that is not a vector is a loss and reads as the origin", () => {
    const result = normalizeLevel(level([plain("a", {}, { pivot: "centre" })]), LENIENT);
    expect(summary(result.issues)).toEqual(["warning invalid-value actors[0].pivot"]);
    expect(result.value?.actors[0]).not.toHaveProperty("pivot");
  });
});
