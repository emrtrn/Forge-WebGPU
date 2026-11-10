import { describe, expect, test } from "vitest";
import { validateJsonSchema } from "../schema/jsonSchemaTestValidator.ts";
import { createSchemaRegistry } from "../schema/registry.ts";
import { actorClassJsonSchema, levelJsonSchema } from "./jsonSchema.ts";
import { normalizeLevel } from "./normalizeLevel.ts";
import {
  actorId,
  CAR_CLASS_ID,
  CAR_CLASS_SOURCE,
  createCarClass,
  createOptions,
  createTestRegistry,
  levelId,
  MESH_ID,
} from "./testKit.ts";

const registry = createTestRegistry();
const schema = levelJsonSchema(registry);
const STRICT = createOptions(true);

function level(actors: unknown[], extra: Record<string, unknown> = {}): unknown {
  return { schema: "forge.level/1", id: levelId("1"), actors, ...extra };
}

const GOOD = level([
  { id: actorId("a"), name: "Fog", class: null, components: { fog: { type: "test.fog@2", density: 0.05 } } },
  {
    id: actorId("b"),
    parent: actorId("a"),
    transform: { p: [4, 0, -2] },
    components: {
      hull: { type: "test.collider@1", parent: null, size: [1, 1, 1] },
      visual: { type: "test.staticMesh@1", parent: "hull", local: { p: [0, 0.5, 0] }, mesh: MESH_ID },
    },
  },
  { id: actorId("c"), class: CAR_CLASS_ID, overrides: { driver: { targetSpeed: 18 } } },
]);

describe("level schema", () => {
  test("is draft-07 with one definition per registered component", () => {
    const root = schema as { $schema: string; definitions: Record<string, unknown> };
    expect(root.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(Object.keys(root.definitions)).toEqual([
      "actor",
      "test.fog",
      "test.collider",
      "test.staticMesh",
      "test.driver",
      "component",
    ]);
  });

  test("is plain JSON and the same on every call", () => {
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
    expect(JSON.stringify(levelJsonSchema(registry))).toBe(JSON.stringify(schema));
  });

  test("accepts a level that normalises cleanly, sparse or canonical", () => {
    expect(validateJsonSchema(schema, GOOD)).toEqual([]);
    const canonical = normalizeLevel(GOOD, STRICT);
    expect(canonical.issues).toEqual([]);
    expect(validateJsonSchema(schema, canonical.value)).toEqual([]);
  });

  test.each([
    ["another schema tag", { schema: "forge.level/2", id: levelId("1") }, ["schema: const"]],
    ["no id", { schema: "forge.level/1" }, ["id: required"]],
    ["an id of the wrong kind", { schema: "forge.level/1", id: actorId("1") }, ["id: pattern"]],
    ["an unknown level field", level([], { cells: [] }), ["cells: not allowed"]],
    ["an actor without an id", level([{ name: "A" }]), ["actors.0.id: required"]],
    ["an unknown actor field", level([{ id: actorId("a"), layer: 1 }]), ["actors.0.layer: not allowed"]],
    [
      "an unregistered component type",
      level([{ id: actorId("a"), components: { rain: { type: "game.rain@1" } } }]),
      ["actors.0.components.rain.type: enum"],
    ],
    [
      "an unknown component field",
      level([{ id: actorId("a"), components: { fog: { type: "test.fog@2", haze: 1 } } }]),
      ["actors.0.components.fog.haze: not allowed"],
    ],
    [
      "a component field out of range",
      level([{ id: actorId("a"), components: { fog: { type: "test.fog@2", density: 7 } } }]),
      ["actors.0.components.fog.density: maximum"],
    ],
    [
      "a component stored at an old version",
      level([{ id: actorId("a"), components: { fog: { type: "test.fog@1" } } }]),
      ["actors.0.components.fog.type: enum"],
    ],
    [
      "a bad local component id",
      level([{ id: actorId("a"), components: { "has-dash": { type: "test.driver@1" } } }]),
      ["actors.0.components.has-dash: pattern"],
    ],
    [
      "a malformed transform",
      level([{ id: actorId("a"), transform: { p: [0, 0], q: 1 } }]),
      ["actors.0.transform.p: minItems", "actors.0.transform.q: not allowed"],
    ],
    [
      "components on a class actor",
      level([{ id: actorId("a"), class: CAR_CLASS_ID, components: {} }]),
      ["actors.0.components: not allowed"],
    ],
    [
      "overrides on a plain actor",
      level([{ id: actorId("a"), class: null, overrides: {} }]),
      ["actors.0.overrides: not allowed"],
    ],
    [
      "parent and local on a non-spatial component",
      level([{ id: actorId("a"), components: { d: { type: "test.driver@1", parent: null } } }]),
      ["actors.0.components.d.parent: not allowed"],
    ],
  ])("rejects %s", (_name, value, errors) => {
    expect(validateJsonSchema(schema, value)).toEqual(errors);
  });

  test("rejects nothing that normalisation takes without a complaint", () => {
    const documents = [GOOD, level([]), { schema: "forge.level/1", id: levelId("2") }];
    for (const document of documents) {
      expect(normalizeLevel(document, STRICT).issues).toEqual([]);
      expect(validateJsonSchema(schema, document)).toEqual([]);
    }
  });

  test("an empty registry yields a schema that allows no component", () => {
    const empty = levelJsonSchema(createSchemaRegistry());
    expect(validateJsonSchema(empty, level([{ id: actorId("a") }]))).toEqual([]);
    expect(
      validateJsonSchema(empty, level([{ id: actorId("a"), components: { fog: { type: "test.fog@2" } } }])),
    ).toEqual(["actors.0.components.fog: not allowed"]);
  });
});

describe("actor class schema", () => {
  const classSchema = actorClassJsonSchema(registry);

  test("accepts the source and the normalised form of a class", () => {
    expect(validateJsonSchema(classSchema, CAR_CLASS_SOURCE)).toEqual([]);
    expect(validateJsonSchema(classSchema, createCarClass(registry))).toEqual([]);
  });

  test.each([
    ["a level document", level([]), ["schema: const", "id: pattern", "actors: not allowed"]],
    [
      "an unknown component field",
      { ...CAR_CLASS_SOURCE, components: { driver: { type: "test.driver@1", topSpeed: 1 } } },
      ["components.driver.topSpeed: not allowed"],
    ],
    ["an unknown field", { ...CAR_CLASS_SOURCE, tags: [] }, ["tags: not allowed"]],
  ])("rejects %s", (_name, value, errors) => {
    expect(validateJsonSchema(classSchema, value)).toEqual(errors);
  });
});
