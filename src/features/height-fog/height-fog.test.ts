import { describe, expect, expectTypeOf, test } from "vitest";
import {
  createComponent,
  createSchemaRegistry,
  formOf,
  installFeatures,
  normalizeComponent,
} from "../../core/index.ts";
import heightFogFeature from "./feature.ts";
import { HeightFog, type HeightFogData } from "./schema.ts";

describe("height fog schema", () => {
  test("defaults are the ones Forge WebGL shipped", () => {
    expect(createComponent(HeightFog)).toEqual({
      type: "forge.heightFog@1",
      mode: "exp",
      color: "#bcc6d1",
      density: 0.03,
      heightFalloff: 0,
      baseHeight: 0,
      startDistance: 0,
      maxOpacity: 1,
      sunColor: "#ffe2bd",
      sunStrength: 0,
      start: 5,
      end: 60,
    });
  });

  test("the TypeScript type comes from the definition", () => {
    expectTypeOf<HeightFogData["mode"]>().toEqualTypeOf<"exp" | "linear">();
    expectTypeOf<HeightFogData["density"]>().toEqualTypeOf<number>();
    expectTypeOf<HeightFogData["sunColor"]>().toEqualTypeOf<string>();
  });

  test("is a singleton and not spatial", () => {
    expect(HeightFog.singleton).toBe(true);
    expect(HeightFog.spatial).toBe(false);
  });

  test("every field has a Turkish hint", () => {
    for (const [key, field] of Object.entries(HeightFog.fields)) {
      expect(field.hint, key).toBeTruthy();
    }
    expect(HeightFog.hint).toBeTruthy();
  });

  test("an authored value outside its range is clamped", () => {
    const result = normalizeComponent(
      HeightFog,
      { type: "forge.heightFog@1", density: 0.02, maxOpacity: 1.5, heightFalloff: 0.2 },
      { strict: true },
    );
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ density: 0.02, maxOpacity: 1, heightFalloff: 0.01 });
    expect(result.issues.map((issue) => `${issue.code} ${issue.path}`)).toEqual([
      "clamped heightFalloff",
      "clamped maxOpacity",
    ]);
  });
});

describe("height fog feature", () => {
  test("installs its component through the registration point", () => {
    const registry = createSchemaRegistry();
    installFeatures([heightFogFeature], registry);
    expect(registry.getComponent("forge.heightFog")).toBe(HeightFog);
  });
});

describe("height fog Details form", () => {
  const form = formOf(HeightFog);

  test("is generated from the schema: key, kind, range, default", () => {
    const rows = form.fields.map((field) => {
      const range = field.kind === "number" ? `${field.range.min}..${field.range.max}` : "-";
      const control = field.kind === "number" ? field.control : field.kind;
      return `${field.key} | ${control} | ${range} | ${JSON.stringify(field.default)}`;
    });
    expect(rows).toEqual([
      'mode | enum | - | "exp"',
      'color | color | - | "#bcc6d1"',
      "density | slider | 0..10 | 0.03",
      "heightFalloff | slider | 0..0.01 | 0",
      "baseHeight | slider | -100000..100000 | 0",
      "startDistance | slider | 0..100000 | 0",
      "maxOpacity | slider | 0..1 | 1",
      'sunColor | color | - | "#ffe2bd"',
      "sunStrength | slider | 0..1 | 0",
      "start | number | 0..null | 5",
      "end | number | 0..null | 60",
    ]);
  });

  test("every row has an English name and a hint", () => {
    expect(form.label).toBe("Exponential Height Fog");
    expect(form.fields.map((field) => field.label)).toEqual([
      "Mode",
      "Color",
      "Density",
      "Height Falloff",
      "Base Height (m)",
      "Clear Distance (m)",
      "Maximum Opacity",
      "Sun Tint",
      "Sun Tint Strength",
      "Start",
      "End",
    ]);
    for (const field of form.fields) {
      expect(field.hint, field.key).toBeTruthy();
    }
  });

  test("the density slider travels the span Forge used, inside the hard limits", () => {
    const density = form.fields.find((field) => field.key === "density");
    expect(density).toMatchObject({ slider: { min: 0, max: 0.002 }, range: { min: 0, max: 10 } });
  });
});
