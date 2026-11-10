import { describe, expect, test } from "vitest";
import { defineComponent } from "./component.ts";
import { actorRef, array, assetRef, bool, color, enumOf, num, object, transform, vec3 } from "./fields.ts";
import { formOf, type FormField, type NumberFormField } from "./form.ts";

const Rig = defineComponent(
  "test.rig",
  1,
  {
    density: num({ min: 0, max: 1, default: 0.02, step: 0.001, hint: "Sisin yoğunluğu." }),
    wide: num({ min: 0, max: 10000, default: 5, slider: [0, 50], label: "Wide (m)" }),
    open: num({ default: 5 }),
    floor: num({ min: 0, default: 1 }),
    softOpen: num({ default: 1, slider: [0, 10] }),
    enabled: bool({ default: true, hint: "Açık mı." }),
    mode: enumOf(["exp", "linearRamp"], { default: "exp", labels: { exp: "Exponential" } }),
    tint: color({ default: "#b8c4d6" }),
    size: vec3({ default: [1, 2, 3], min: 0, step: 0.1 }),
    offset: transform({ default: { p: [0, 1, 0] } }),
    mesh: assetRef({ assetType: "mesh" }),
    anyAsset: assetRef(),
    target: actorRef(),
    waypoints: array(vec3({ default: [0, 0, 0] }), { hint: "Yol noktaları." }),
    wheel: object(
      {
        radius: num({ min: 0.05, max: 2, default: 0.35 }),
        steering: bool({ default: false }),
      },
      { label: "Front Wheel" },
    ),
  },
  { spatial: true, hint: "Deneme bileşeni." },
);

const form = formOf(Rig);

function field(key: string): FormField {
  const found = form.fields.find((entry) => entry.key === key);
  if (!found) throw new Error(`no form field "${key}"`);
  return found;
}

function numberField(key: string): NumberFormField {
  const found = field(key);
  if (found.kind !== "number") throw new Error(`"${key}" is not a number field`);
  return found;
}

describe("form definition", () => {
  test("describes the component", () => {
    expect(form).toMatchObject({
      component: "test.rig",
      version: 1,
      label: "Rig",
      hint: "Deneme bileşeni.",
      spatial: true,
    });
  });

  test("lists the fields in definition order", () => {
    expect(form.fields.map((entry) => `${entry.key}:${entry.kind}`)).toEqual([
      "density:number",
      "wide:number",
      "open:number",
      "floor:number",
      "softOpen:number",
      "enabled:bool",
      "mode:enum",
      "tint:color",
      "size:vector",
      "offset:transform",
      "mesh:assetRef",
      "anyAsset:assetRef",
      "target:actorRef",
      "waypoints:array",
      "wheel:object",
    ]);
  });

  test("is plain data with no DOM in it", () => {
    expect(JSON.parse(JSON.stringify(form))).toEqual(form);
  });

  test("does not hand out the schema's frozen defaults", () => {
    const offset = field("offset");
    expect(offset.kind === "transform" && Object.isFrozen(offset.default)).toBe(false);
  });
});

describe("parameter rules", () => {
  test("names are English: the schema label, or one derived from the key", () => {
    expect(field("wide").label).toBe("Wide (m)");
    expect(field("softOpen").label).toBe("Soft Open");
    expect(field("wheel").label).toBe("Front Wheel");
  });

  test("hints are the Turkish tooltip, null when the schema has none", () => {
    expect(field("density").hint).toBe("Sisin yoğunluğu.");
    expect(field("enabled").hint).toBe("Açık mı.");
    expect(field("open").hint).toBeNull();
  });

  test("a bounded number is a slider plus a number box over its range", () => {
    expect(numberField("density")).toEqual({
      key: "density",
      path: "density",
      label: "Density",
      hint: "Sisin yoğunluğu.",
      kind: "number",
      control: "slider",
      default: 0.02,
      range: { min: 0, max: 1 },
      slider: { min: 0, max: 1 },
      step: 0.001,
    });
  });

  test("a slider can travel a narrower span than the hard limits", () => {
    expect(numberField("wide")).toMatchObject({
      control: "slider",
      range: { min: 0, max: 10000 },
      slider: { min: 0, max: 50 },
    });
  });

  test("an open-ended number is a number box; a slider span still gives it a slider", () => {
    expect(numberField("open")).toMatchObject({ control: "number", range: { min: null, max: null }, slider: null, step: null });
    expect(numberField("floor")).toMatchObject({ control: "number", range: { min: 0, max: null }, slider: null });
    expect(numberField("softOpen")).toMatchObject({ control: "slider", range: { min: null, max: null }, slider: { min: 0, max: 10 } });
  });

  test("every field carries its default", () => {
    expect(form.fields.map((entry) => entry.default)).toEqual([
      0.02,
      5,
      5,
      1,
      1,
      true,
      "exp",
      "#b8c4d6",
      [1, 2, 3],
      { p: [0, 1, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
      null,
      null,
      null,
      [],
      { radius: 0.35, steering: false },
    ]);
  });
});

describe("field kinds", () => {
  test("enum options have English labels", () => {
    expect(field("mode")).toMatchObject({
      options: [
        { value: "exp", label: "Exponential" },
        { value: "linearRamp", label: "Linear Ramp" },
      ],
    });
  });

  test("a vector carries its size, range and step", () => {
    expect(field("size")).toMatchObject({ size: 3, range: { min: 0, max: null }, step: 0.1 });
  });

  test("an asset reference says which asset type it takes", () => {
    expect(field("mesh")).toMatchObject({ assetType: "mesh" });
    expect(field("anyAsset")).toMatchObject({ assetType: null });
  });

  test("an array describes the form of one element", () => {
    expect(field("waypoints")).toMatchObject({
      hint: "Yol noktaları.",
      item: { kind: "vector", key: "waypoints", path: "waypoints[]", label: "Item", size: 3 },
    });
  });

  test("an object nests its fields with full paths", () => {
    const wheel = field("wheel");
    expect(wheel.kind === "object" && wheel.fields.map((entry) => `${entry.path}:${entry.kind}`)).toEqual([
      "wheel.radius:number",
      "wheel.steering:bool",
    ]);
  });
});
