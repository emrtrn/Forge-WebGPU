import { describe, expect, test } from "vitest";
import { defineComponent } from "./component.ts";
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
  vec3,
} from "./fields.ts";
import type { Issue } from "./issues.ts";
import { normalizeFields } from "./normalize.ts";
import { createComponent, normalizeComponent } from "./normalizeComponent.ts";

const ASSET = "ast_0123456789abcdef0123456789abcdef";
const ACTOR = "act_0123456789abcdef0123456789abcdef";

const Rig = defineComponent("test.rig", 1, {
  density: num({ min: 0, max: 1, default: 0.02 }),
  open: num({ default: 5 }),
  enabled: bool({ default: true }),
  mode: enumOf(["exp", "linear"], { default: "exp" }),
  tint: color({ default: "#b8c4d6" }),
  size: vec3({ default: [1, 1, 1], min: 0, max: 10 }),
  offset: transform({ default: { p: [0, 1, 0] } }),
  mesh: assetRef(),
  target: actorRef(),
  waypoints: array(vec3({ default: [0, 0, 0] })),
  wheel: object({
    radius: num({ min: 0.05, max: 2, default: 0.35 }),
    steering: bool({ default: false }),
  }),
});

const Collider = defineComponent(
  "test.collider",
  1,
  { size: vec3({ default: [1, 1, 1], min: 0 }) },
  { spatial: true },
);

const DEFAULTS = {
  type: "test.rig@1",
  density: 0.02,
  open: 5,
  enabled: true,
  mode: "exp",
  tint: "#b8c4d6",
  size: [1, 1, 1],
  offset: { p: [0, 1, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
  mesh: null,
  target: null,
  waypoints: [],
  wheel: { radius: 0.35, steering: false },
};

const STRICT = { strict: true };
const LENIENT = { strict: false };

function summary(issues: readonly Issue[]): string[] {
  return issues.map((issue) => `${issue.severity} ${issue.code} ${issue.path}`);
}

describe("missing fields", () => {
  test("take their defaults, silently", () => {
    const result = normalizeComponent(Rig, { type: "test.rig@1" }, STRICT);
    expect(result.value).toEqual(DEFAULTS);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("a partial nested object and a partial transform are completed", () => {
    const result = normalizeComponent(
      Rig,
      { type: "test.rig@1", wheel: { steering: true }, offset: { s: [2, 2, 2] } },
      STRICT,
    );
    expect(result.value).toMatchObject({
      wheel: { radius: 0.35, steering: true },
      offset: { p: [0, 1, 0], r: [0, 0, 0, 1], s: [2, 2, 2] },
    });
    expect(result.issues).toEqual([]);
  });

  test("createComponent is the all-defaults component", () => {
    expect(createComponent(Rig)).toEqual(DEFAULTS);
  });
});

describe("numbers out of range", () => {
  test.each([STRICT, LENIENT])("are clamped with a warning (strict: $strict)", (options) => {
    const result = normalizeComponent(
      Rig,
      { type: "test.rig@1", density: 4, size: [-1, 5, 11], wheel: { radius: 0 }, open: 1e9 },
      options,
    );
    expect(result.value).toMatchObject({
      density: 1,
      size: [0, 5, 10],
      wheel: { radius: 0.05 },
      open: 1e9,
    });
    expect(summary(result.issues)).toEqual([
      "warning clamped density",
      "warning clamped size[0]",
      "warning clamped size[2]",
      "warning clamped wheel.radius",
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("unknown fields", () => {
  const raw = { type: "test.rig@1", densty: 0.5, wheel: { radius: 1, camber: 2 }, offset: { q: 1 } };

  test("are an error in development", () => {
    const result = normalizeComponent(Rig, raw, STRICT);
    expect(summary(result.issues)).toEqual([
      "error unknown-field offset.q",
      "error unknown-field wheel.camber",
      "error unknown-field densty",
    ]);
    expect(result.ok).toBe(false);
  });

  test("are a report in production, and the document still loads", () => {
    const result = normalizeComponent(Rig, raw, LENIENT);
    expect(summary(result.issues)).toEqual([
      "warning unknown-field offset.q",
      "warning unknown-field wheel.camber",
      "warning unknown-field densty",
    ]);
    expect(result.ok).toBe(true);
  });

  test("are dropped either way", () => {
    for (const options of [STRICT, LENIENT]) {
      const { value } = normalizeComponent(Rig, raw, options);
      expect(value).toEqual({ ...DEFAULTS, wheel: { radius: 1, steering: false } });
    }
  });
});

describe("values of the wrong type", () => {
  const raw = {
    type: "test.rig@1",
    density: "0.5",
    open: null,
    enabled: 1,
    mode: "cubic",
    tint: "blue",
    size: [1, 2],
    offset: { p: [0, "1", 0], r: 5 },
    mesh: ACTOR,
    target: "someone",
    waypoints: [[1, 2, 3], "here", [4, 5, 6]],
    wheel: [],
  };

  test("fall back to the default: error in development, report in production", () => {
    const strict = normalizeComponent(Rig, raw, STRICT);
    const lenient = normalizeComponent(Rig, raw, LENIENT);
    const expected = [
      "invalid-value density",
      "invalid-value open",
      "invalid-value enabled",
      "invalid-value mode",
      "invalid-value tint",
      "invalid-value size",
      "invalid-value offset.p",
      "invalid-value offset.r",
      "invalid-value mesh",
      "invalid-value target",
      "invalid-value waypoints[1]",
      "invalid-value wheel",
    ];
    expect(summary(strict.issues)).toEqual(expected.map((entry) => `error ${entry}`));
    expect(summary(lenient.issues)).toEqual(expected.map((entry) => `warning ${entry}`));
    expect(strict.ok).toBe(false);
    expect(lenient.ok).toBe(true);
    expect(strict.value).toEqual({ ...DEFAULTS, waypoints: [[1, 2, 3], [0, 0, 0], [4, 5, 6]] });
    expect(lenient.value).toEqual(strict.value);
  });

  test("non-finite numbers are not numbers", () => {
    const result = normalizeComponent(
      Rig,
      { type: "test.rig@1", density: Number.NaN, size: [1, Number.POSITIVE_INFINITY, 1] },
      STRICT,
    );
    expect(summary(result.issues)).toEqual(["error invalid-value density", "error invalid-value size"]);
    expect(result.value).toMatchObject({ density: 0.02, size: [1, 1, 1] });
  });
});

describe("canonical output", () => {
  const messy = {
    wheel: { steering: true, radius: 1 },
    target: ACTOR,
    tint: "#B8C4D6",
    mesh: ASSET,
    type: "test.rig@1",
    density: 0.5,
  };

  test("keys come out in definition order, colors in lower case", () => {
    const { value, issues } = normalizeComponent(Rig, messy, STRICT);
    expect(issues).toEqual([]);
    expect(JSON.stringify(value)).toBe(
      JSON.stringify({
        ...DEFAULTS,
        density: 0.5,
        mesh: ASSET,
        target: ACTOR,
        wheel: { radius: 1, steering: true },
      }),
    );
  });

  test("normalising a normal value changes nothing and reports nothing", () => {
    const first = normalizeComponent(Rig, messy, STRICT);
    const second = normalizeComponent(Rig, first.value, STRICT);
    expect(JSON.stringify(second.value)).toBe(JSON.stringify(first.value));
    expect(second.issues).toEqual([]);
  });

  test("the output shares nothing with the input or with the defaults", () => {
    const input = { type: "test.rig@1", size: [2, 2, 2], waypoints: [[1, 2, 3]], wheel: { radius: 1 } };
    const { value } = normalizeComponent(Rig, input, STRICT);
    const output = value!;
    output.size[0] = 9;
    output.waypoints[0]![0] = 9;
    output.wheel.radius = 2;
    output.offset.p[1] = 9; // would throw if this were the frozen default
    expect(input).toEqual({ type: "test.rig@1", size: [2, 2, 2], waypoints: [[1, 2, 3]], wheel: { radius: 1 } });
    expect(createComponent(Rig).offset.p).toEqual([0, 1, 0]);
  });
});

describe("component envelope", () => {
  test("a spatial component carries parent and local, before its fields", () => {
    const result = normalizeComponent(Collider, { size: [2, 2, 2], type: "test.collider@1" }, STRICT);
    expect(JSON.stringify(result.value)).toBe(
      JSON.stringify({
        type: "test.collider@1",
        parent: null,
        local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
        size: [2, 2, 2],
      }),
    );
    expect(result.issues).toEqual([]);
  });

  test("a spatial component keeps its parent id and completes a partial local", () => {
    const result = normalizeComponent(
      Collider,
      { type: "test.collider@1", parent: "chassis", local: { p: [0, 1, -0.04] } },
      STRICT,
    );
    expect(result.value).toMatchObject({
      parent: "chassis",
      local: { p: [0, 1, -0.04], r: [0, 0, 0, 1], s: [1, 1, 1] },
    });
  });

  test("parent and local on a non-spatial component are unknown fields", () => {
    const result = normalizeComponent(Rig, { type: "test.rig@1", parent: null, local: {} }, STRICT);
    expect(summary(result.issues)).toEqual(["error unknown-field parent", "error unknown-field local"]);
  });

  test.each([
    ["not an object", 5, "invalid-value "],
    ["no type tag", { density: 1 }, "invalid-value type"],
    ["another component's tag", { type: "test.collider@1" }, "invalid-value type"],
    ["a version this build does not know", { type: "test.rig@2" }, "unsupported-version type"],
  ])("a component with %s cannot be kept", (_name, raw, issue) => {
    const strict = normalizeComponent(Rig, raw, STRICT);
    expect(strict.value).toBeNull();
    expect(summary(strict.issues)).toEqual([`error ${issue}`]);
    expect(strict.ok).toBe(false);
    const lenient = normalizeComponent(Rig, raw, LENIENT);
    expect(lenient.value).toBeNull();
    expect(lenient.ok).toBe(true);
  });
});

describe("bare field maps", () => {
  test("normalizeFields applies the same rules without an envelope", () => {
    const result = normalizeFields(Rig.fields, { density: 7, extra: 1 }, LENIENT);
    expect(result.value.density).toBe(1);
    expect(summary(result.issues)).toEqual(["warning clamped density", "warning unknown-field extra"]);
  });

  test("a non-object input yields the defaults and a loss issue", () => {
    const result = normalizeFields(Rig.fields, null, STRICT);
    expect(result.value.mode).toBe("exp");
    expect(result.ok).toBe(false);
  });
});

describe("defaults are checked at definition time", () => {
  test("an array default that does not fit its item is rejected", () => {
    const define = () =>
      defineComponent("test.bad", 1, {
        points: array(vec3({ default: [0, 0, 0], min: 0 }), { default: [[0, -5, 0]] }),
      });
    expect(define).toThrow(SchemaDefinitionError);
  });

  test("nested array defaults are checked too", () => {
    const define = () =>
      defineComponent("test.bad", 1, {
        group: object({ modes: array(enumOf(["a", "b"], { default: "a" }), { default: ["c" as "a"] }) }),
      });
    expect(define).toThrow(SchemaDefinitionError);
  });
});
