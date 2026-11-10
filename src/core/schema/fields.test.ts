import { describe, expect, expectTypeOf, test } from "vitest";
import type { ActorId, AssetId } from "../id.ts";
import {
  actorRef,
  array,
  assetRef,
  bool,
  color,
  enumOf,
  num,
  object,
  SchemaDefinitionError,
  transform,
  vec2,
  vec3,
  vec4,
  type FieldValue,
  type FieldValues,
  type Transform,
  type Vec2,
  type Vec3,
  type Vec4,
} from "./fields.ts";

const everyKind = {
  density: num({ min: 0, max: 1, default: 0.02, step: 0.001, slider: [0, 0.2], hint: "Yoğunluk." }),
  enabled: bool({ default: true }),
  mode: enumOf(["exp", "linear"], { default: "exp", labels: { exp: "Exponential" } }),
  tint: color({ default: "#b8c4d6" }),
  uv: vec2({ default: [0, 1] }),
  size: vec3({ default: [1, 2, 3], min: 0 }),
  plane: vec4({ default: [0, 1, 0, 0] }),
  offset: transform({ default: { p: [0, 1, 0] } }),
  mesh: assetRef({ assetType: "mesh" }),
  target: actorRef(),
  waypoints: array(vec3({ default: [0, 0, 0] })),
  wheel: object({
    radius: num({ min: 0.05, default: 0.35 }),
    steering: bool({ default: false }),
  }),
};

describe("field builders", () => {
  test("produce plain data that survives a JSON round trip", () => {
    expect(JSON.parse(JSON.stringify(everyKind))).toEqual(everyKind);
  });

  test("tag every definition with its kind", () => {
    expect(Object.values(everyKind).map((field) => field.kind)).toEqual([
      "number",
      "bool",
      "enum",
      "color",
      "vector",
      "vector",
      "vector",
      "transform",
      "assetRef",
      "actorRef",
      "array",
      "object",
    ]);
  });

  test("definitions are walkable: nested fields and items are definitions too", () => {
    expect(everyKind.waypoints.item).toEqual({ kind: "vector", size: 3, default: [0, 0, 0] });
    expect(everyKind.wheel.fields.radius).toEqual({ kind: "number", min: 0.05, default: 0.35 });
  });

  test("freeze definitions deeply", () => {
    expect(Object.isFrozen(everyKind.density)).toBe(true);
    expect(Object.isFrozen(everyKind.size.default)).toBe(true);
    expect(Object.isFrozen(everyKind.wheel.fields)).toBe(true);
    expect(Object.isFrozen(everyKind.offset.default.p)).toBe(true);
  });

  test("transform fills the parts its default leaves out with identity", () => {
    expect(everyKind.offset.default).toEqual({ p: [0, 1, 0], r: [0, 0, 0, 1], s: [1, 1, 1] });
    expect(transform().default).toEqual({ p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] });
  });

  test("references default to null", () => {
    expect(everyKind.mesh).toEqual({ kind: "assetRef", assetType: "mesh", default: null });
    expect(everyKind.target).toEqual({ kind: "actorRef", default: null });
  });

  test("do not keep a reference to the caller's default array", () => {
    const given: Vec3[] = [[1, 2, 3]];
    const field = array(vec3({ default: [0, 0, 0] }), { default: given });
    given[0]![0] = 99;
    expect(field.default).toEqual([[1, 2, 3]]);
  });
});

describe("definition errors", () => {
  const cases: [string, () => unknown][] = [
    ["number default below min", () => num({ min: 0, default: -1 })],
    ["number default above max", () => num({ max: 1, default: 2 })],
    ["number min above max", () => num({ min: 2, max: 1, default: 2 })],
    ["number default not finite", () => num({ default: Number.NaN })],
    ["number step not positive", () => num({ default: 0, step: 0 })],
    ["slider reversed", () => num({ default: 0, slider: [1, 0] })],
    ["slider outside the limits", () => num({ min: 0, max: 1, default: 0, slider: [0, 2] })],
    ["enum without values", () => enumOf([], { default: "a" as never })],
    ["enum with duplicate values", () => enumOf(["a", "a"], { default: "a" })],
    ["enum default not a value", () => enumOf(["a", "b"], { default: "c" as "a" })],
    ["enum label for unknown value", () => enumOf(["a"], { default: "a", labels: { z: "Z" } as never })],
    ["color upper case", () => color({ default: "#B8C4D6" })],
    ["color short form", () => color({ default: "#fff" })],
    ["vector default wrong length", () => vec3({ default: [0, 0] as unknown as Vec3 })],
    ["vector default outside limits", () => vec3({ default: [0, -1, 0], min: 0 })],
    ["transform default not finite", () => transform({ default: { p: [0, Number.POSITIVE_INFINITY, 0] } })],
    ["object key not camelCase", () => object({ "bad-key": bool({ default: false }) })],
  ];

  test.each(cases)("%s", (_name, build) => {
    expect(build).toThrow(SchemaDefinitionError);
  });
});

describe("derived types", () => {
  test("each kind maps to its value type", () => {
    expectTypeOf<FieldValue<typeof everyKind.density>>().toEqualTypeOf<number>();
    expectTypeOf<FieldValue<typeof everyKind.enabled>>().toEqualTypeOf<boolean>();
    expectTypeOf<FieldValue<typeof everyKind.mode>>().toEqualTypeOf<"exp" | "linear">();
    expectTypeOf<FieldValue<typeof everyKind.tint>>().toEqualTypeOf<string>();
    expectTypeOf<FieldValue<typeof everyKind.uv>>().toEqualTypeOf<Vec2>();
    expectTypeOf<FieldValue<typeof everyKind.size>>().toEqualTypeOf<Vec3>();
    expectTypeOf<FieldValue<typeof everyKind.plane>>().toEqualTypeOf<Vec4>();
    expectTypeOf<FieldValue<typeof everyKind.offset>>().toEqualTypeOf<Transform>();
    expectTypeOf<FieldValue<typeof everyKind.mesh>>().toEqualTypeOf<AssetId | null>();
    expectTypeOf<FieldValue<typeof everyKind.target>>().toEqualTypeOf<ActorId | null>();
    expectTypeOf<FieldValue<typeof everyKind.waypoints>>().toEqualTypeOf<Vec3[]>();
    expectTypeOf<FieldValue<typeof everyKind.wheel>>().toEqualTypeOf<{
      radius: number;
      steering: boolean;
    }>();
  });

  test("a field map maps to an object of values", () => {
    type Values = FieldValues<typeof everyKind>;
    expectTypeOf<Values["mode"]>().toEqualTypeOf<"exp" | "linear">();
    expectTypeOf<Values["wheel"]["radius"]>().toEqualTypeOf<number>();
    expectTypeOf<Values["waypoints"]>().toEqualTypeOf<Vec3[]>();
  });
});
