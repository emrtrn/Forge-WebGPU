// Plan phase W5: a terrain paint layer's written weather response.
import { describe, expect, test } from "vitest";
import { normalizeTerrainLayerWeather } from "./terrainDefinition.ts";

describe("terrain layer weather (plan phase W5)", () => {
  test("keeps the written fields, drops an empty group and a cleared material", () => {
    expect(normalizeTerrainLayerWeather({ snowAccept: 0, porosity: 1 })).toEqual({ porosity: 1, snowAccept: 0 });
    expect(normalizeTerrainLayerWeather({ wetPhysicalMaterial: "mud" })).toEqual({ wetPhysicalMaterial: "mud" });
    expect(normalizeTerrainLayerWeather({})).toBeUndefined();
    expect(normalizeTerrainLayerWeather({ wetPhysicalMaterial: "", unknown: 3 })).toBeUndefined();
    expect(normalizeTerrainLayerWeather({ wetPhysicalMaterial: null })).toBeUndefined();
  });

  test("rejects what a save must not write", () => {
    for (const bad of [null, [], 3, { wetting: 1.5 }, { porosity: -0.1 }, { snowAccept: NaN }, { wetting: "1" }, { wetPhysicalMaterial: "lava" }]) {
      expect(() => normalizeTerrainLayerWeather(bad), JSON.stringify(bad)).toThrow();
    }
  });
});
