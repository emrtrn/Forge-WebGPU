import { describe, expect, test } from "vitest";
import { createComponent, createSchemaRegistry, formOf, installFeatures, normalizeComponent } from "../../core/index.ts";
import skyFeature from "./feature.ts";
import { SKY_LIGHT_ABSENT, SkyAtmosphere, SkyLight, skyToneMappingExposure } from "./schema.ts";

describe("sky atmosphere schema", () => {
  test("defaults are Forge WebGL's SKY_ATMOSPHERE_DEFAULTS", () => {
    expect(createComponent(SkyAtmosphere)).toEqual({
      type: "forge.skyAtmosphere@1", rayleigh: 2, turbidity: 10, mie: 0.005, mieDirectionalG: 0.8, exposure: 1,
    });
  });

  test("ranges are the ones of Forge's Details panel; out of range is clamped", () => {
    const rows = formOf(SkyAtmosphere).fields.map((field) =>
      field.kind === "number" ? `${field.label} ${field.range.min}..${field.range.max}` : field.label);
    expect(rows).toEqual(["Rayleigh 0..6", "Turbidity 1..20", "Mie 0..0.1", "Mie Anisotropy 0..0.999", "Exposure 0..4"]);
    const result = normalizeComponent(SkyAtmosphere, { type: "forge.skyAtmosphere@1", turbidity: 0, exposure: 9 }, { strict: true });
    expect(result.value).toMatchObject({ turbidity: 1, exposure: 4 });
  });

  test("the authored exposure 1 is Forge's tone mapping exposure 0.2", () => {
    expect(skyToneMappingExposure(1)).toBeCloseTo(0.2);
    expect(skyToneMappingExposure(0.45)).toBeCloseTo(0.09);
    expect(skyToneMappingExposure(-1)).toBe(0);
  });
});

describe("sky light schema", () => {
  test("defaults: Forge's capture intensity and world settings defaults", () => {
    expect(createComponent(SkyLight)).toEqual({
      type: "forge.skyLight@1", intensity: 1, ambientColor: "#ffffff", ambientIntensity: 0, backgroundColor: "#d7d7c7",
    });
    // A level without one draws the same background and ambient.
    const { type: _type, intensity: _intensity, ...rest } = createComponent(SkyLight);
    expect(rest).toEqual(SKY_LIGHT_ABSENT);
  });

  test("the ambient slider travels the common span inside Forge's World Settings limit", () => {
    const ambient = formOf(SkyLight).fields.find((field) => field.key === "ambientIntensity");
    expect(ambient).toMatchObject({ range: { min: 0, max: 20 }, slider: { min: 0, max: 4 } });
  });
});

describe("sky feature", () => {
  test("installs both singletons; every field has a Turkish hint and an English name", () => {
    const registry = createSchemaRegistry();
    installFeatures([skyFeature], registry);
    for (const def of [SkyAtmosphere, SkyLight]) {
      expect(registry.getComponent(def.name)).toBe(def);
      expect(def.singleton).toBe(true);
      expect(def.spatial).toBe(false);
      expect(def.hint).toBeTruthy();
      for (const field of formOf(def).fields) {
        expect(field.hint, field.key).toBeTruthy();
        expect(field.label, field.key).toMatch(/^[A-Z][A-Za-z ()°]*$/);
      }
    }
  });
});
