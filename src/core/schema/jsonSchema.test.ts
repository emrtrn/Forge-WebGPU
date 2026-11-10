import { describe, expect, test } from "vitest";
import { defineComponent } from "./component.ts";
import { actorRef, array, assetRef, bool, color, enumOf, num, object, transform, vec3 } from "./fields.ts";
import { componentJsonSchema, fieldJsonSchema } from "./jsonSchema.ts";
import { validateJsonSchema } from "./jsonSchemaTestValidator.ts";
import { createComponent, normalizeComponent } from "./normalizeComponent.ts";

const NUMBER_TRIPLE = { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 };
const TRANSFORM = {
  type: "object",
  properties: {
    p: NUMBER_TRIPLE,
    r: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
    s: NUMBER_TRIPLE,
  },
  additionalProperties: false,
};

describe("field schemas", () => {
  test("number: limits become minimum and maximum", () => {
    expect(fieldJsonSchema(num({ min: 0, max: 1, default: 0.02, hint: "Yoğunluk." }), "density")).toEqual({
      title: "Density",
      description: "Yoğunluk.",
      type: "number",
      minimum: 0,
      maximum: 1,
      default: 0.02,
    });
    expect(fieldJsonSchema(num({ default: 5 }))).toEqual({ type: "number", default: 5 });
  });

  test("bool, enum, color", () => {
    expect(fieldJsonSchema(bool({ default: true }))).toEqual({ type: "boolean", default: true });
    expect(fieldJsonSchema(enumOf(["exp", "linear"], { default: "exp" }))).toEqual({
      type: "string",
      enum: ["exp", "linear"],
      default: "exp",
    });
    expect(fieldJsonSchema(color({ default: "#b8c4d6" }))).toEqual({
      type: "string",
      pattern: "^#[0-9a-fA-F]{6}$",
      default: "#b8c4d6",
    });
  });

  test("vector: fixed length, limits on every element", () => {
    expect(fieldJsonSchema(vec3({ default: [1, 2, 3], min: 0 }))).toEqual({
      type: "array",
      items: { type: "number", minimum: 0 },
      minItems: 3,
      maxItems: 3,
      default: [1, 2, 3],
    });
  });

  test("transform: p, r, s and nothing else", () => {
    expect(fieldJsonSchema(transform())).toEqual({
      ...TRANSFORM,
      default: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    });
  });

  test("references: an id of the right kind, or null", () => {
    expect(fieldJsonSchema(assetRef())).toEqual({
      type: ["string", "null"],
      pattern: "^ast_[0-9a-f]{32}$",
      default: null,
    });
    expect(fieldJsonSchema(actorRef())).toEqual({
      type: ["string", "null"],
      pattern: "^act_[0-9a-f]{32}$",
      default: null,
    });
  });

  test("array and object nest", () => {
    expect(fieldJsonSchema(array(bool({ default: false })))).toEqual({
      type: "array",
      items: { type: "boolean", default: false },
      default: [],
    });
    expect(fieldJsonSchema(object({ radius: num({ min: 0, default: 0.35 }) }), "wheel")).toEqual({
      title: "Wheel",
      type: "object",
      properties: { radius: { title: "Radius", type: "number", minimum: 0, default: 0.35 } },
      additionalProperties: false,
      default: { radius: 0.35 },
    });
  });

  test("the label wins over the derived title", () => {
    expect(fieldJsonSchema(bool({ default: false, label: "Casts Shadow" }), "shadow")).toMatchObject({
      title: "Casts Shadow",
    });
  });
});

const Fog = defineComponent(
  "test.fog",
  1,
  {
    density: num({ min: 0, max: 1, default: 0.02 }),
    mode: enumOf(["exp", "linear"], { default: "exp" }),
    tint: color({ default: "#b8c4d6" }),
  },
  { hint: "Sis." },
);

const Box = defineComponent("test.box", 3, { size: vec3({ default: [1, 1, 1], min: 0 }) }, {
  spatial: true,
  migrations: { 1: (data) => data, 2: (data) => data },
});

describe("component schema", () => {
  test("is the envelope plus the fields, closed to unknown keys", () => {
    expect(componentJsonSchema(Fog)).toEqual({
      title: "Fog",
      description: "Sis.",
      type: "object",
      properties: {
        type: { const: "test.fog@1" },
        density: { title: "Density", type: "number", minimum: 0, maximum: 1, default: 0.02 },
        mode: { title: "Mode", type: "string", enum: ["exp", "linear"], default: "exp" },
        tint: { title: "Tint", type: "string", pattern: "^#[0-9a-fA-F]{6}$", default: "#b8c4d6" },
      },
      required: ["type"],
      additionalProperties: false,
    });
  });

  test("a spatial component also has parent and local; the tag is the current version", () => {
    const schema = componentJsonSchema(Box) as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(["type", "parent", "local", "size"]);
    expect(schema.properties.type).toEqual({ const: "test.box@3" });
    expect(schema.properties.local).toEqual(TRANSFORM);
  });

  test("is plain JSON and the same on every call", () => {
    const schema = componentJsonSchema(Fog);
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
    expect(JSON.stringify(componentJsonSchema(Fog))).toBe(JSON.stringify(schema));
  });
});

describe("what the component schema accepts", () => {
  const schema = componentJsonSchema(Fog);

  test("a new component and a sparse one", () => {
    expect(validateJsonSchema(schema, createComponent(Fog))).toEqual([]);
    expect(validateJsonSchema(schema, { type: "test.fog@1" })).toEqual([]);
  });

  test.each([
    ["an unknown field", { type: "test.fog@1", haze: 1 }, ["haze: not allowed"]],
    ["a wrong type", { type: "test.fog@1", density: "thick" }, ["density: type"]],
    ["a number out of range", { type: "test.fog@1", density: 2 }, ["density: maximum"]],
    ["an enum value that does not exist", { type: "test.fog@1", mode: "cubic" }, ["mode: enum"]],
    ["a malformed color", { type: "test.fog@1", tint: "blue" }, ["tint: pattern"]],
    ["no type tag", { density: 0.5 }, ["type: required"]],
    ["an old version tag", { type: "test.fog@0" }, ["type: const"]],
  ])("rejects %s", (_name, value, errors) => {
    expect(validateJsonSchema(schema, value)).toEqual(errors);
  });

  test("agrees with normalisation on which inputs are clean", () => {
    const inputs: unknown[] = [
      { type: "test.fog@1" },
      { type: "test.fog@1", density: 0.5, mode: "linear", tint: "#FFFFFF" },
      { type: "test.fog@1", density: -1 },
      { type: "test.fog@1", density: null },
      { type: "test.fog@1", extra: true },
      { type: "test.fog@1", mode: 3 },
      { type: "test.fog@1", tint: "#fff" },
    ];
    for (const input of inputs) {
      const clean = normalizeComponent(Fog, input, { strict: true }).issues.length === 0;
      expect(validateJsonSchema(schema, input).length === 0, JSON.stringify(input)).toBe(clean);
    }
  });
});
