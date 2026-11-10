import { describe, expect, expectTypeOf, test } from "vitest";
import {
  componentTypeTag,
  defineComponent,
  parseComponentTypeTag,
  type ComponentData,
  type ComponentDef,
} from "./component.ts";
import { bool, color, enumOf, num, SchemaDefinitionError } from "./fields.ts";
import { labelFromComponentName, labelFromKey } from "./label.ts";

const Fog = defineComponent(
  "test.fog",
  1,
  {
    density: num({ min: 0, max: 1, default: 0.02 }),
    mode: enumOf(["exp", "linear"], { default: "exp" }),
    tint: color({ default: "#b8c4d6" }),
  },
  { singleton: true, hint: "Sis." },
);

describe("defineComponent", () => {
  test("returns a frozen, JSON-serialisable definition", () => {
    expect(Object.isFrozen(Fog)).toBe(true);
    expect(Object.isFrozen(Fog.fields)).toBe(true);
    expect(JSON.parse(JSON.stringify(Fog))).toEqual(Fog);
  });

  test("fills the options it was not given", () => {
    const Plain = defineComponent("test.plainThing", 3, { on: bool({ default: false }) });
    expect(Plain).toMatchObject({
      kind: "component",
      name: "test.plainThing",
      version: 3,
      label: "Plain Thing",
      hint: null,
      spatial: false,
      singleton: false,
    });
    expect(Fog).toMatchObject({ label: "Fog", hint: "Sis.", singleton: true });
  });

  test("derives the TypeScript type from the definition", () => {
    type FogData = ComponentData<typeof Fog>;
    expectTypeOf<FogData>().toEqualTypeOf<{
      density: number;
      mode: "exp" | "linear";
      tint: string;
    }>();
    expectTypeOf(Fog).toExtend<ComponentDef>();
  });

  test.each([
    ["no namespace", () => defineComponent("fog", 1, {})],
    ["version tag in the name", () => defineComponent("test.fog@1", 1, {})],
    ["version zero", () => defineComponent("test.fog", 0, {})],
    ["fractional version", () => defineComponent("test.fog", 1.5, {})],
    ["field named type", () => defineComponent("test.fog", 1, { type: bool({ default: false }) })],
    ["field named parent", () => defineComponent("test.fog", 1, { parent: bool({ default: false }) })],
    ["field named local", () => defineComponent("test.fog", 1, { local: bool({ default: false }) })],
    ["field key not camelCase", () => defineComponent("test.fog", 1, { Density: num({ default: 0 }) })],
  ])("rejects %s", (_name, define) => {
    expect(define).toThrow(SchemaDefinitionError);
  });
});

describe("component type tag", () => {
  test("is name@version", () => {
    expect(componentTypeTag(Fog)).toBe("test.fog@1");
  });

  test("parses back", () => {
    expect(parseComponentTypeTag("forge.heightFog@12")).toEqual({ name: "forge.heightFog", version: 12 });
  });

  test.each(["forge.heightFog", "forge.heightFog@", "forge.heightFog@0", "forge.heightFog@1.5", "@1", "fog@1", 7, null])(
    "rejects %j",
    (tag) => {
      expect(parseComponentTypeTag(tag)).toBeNull();
    },
  );
});

describe("labels", () => {
  test("derive an English name from an identifier", () => {
    expect(labelFromKey("density")).toBe("Density");
    expect(labelFromKey("heightFalloff")).toBe("Height Falloff");
    expect(labelFromKey("lod2Distance")).toBe("Lod2 Distance");
    expect(labelFromComponentName("forge.heightFog")).toBe("Height Fog");
  });
});
