import { describe, expect, test } from "vitest";
import {
  blendLayerWeather, defaultLayerWeather, LAYER_WEATHER_DEFAULTS, resolveLayerWeather, type LayerWeather,
} from "./layerWeather.ts";

describe("terrain layer weather defaults and overrides", () => {
  test("loads through a relative .ts import in the Node test environment", async () => {
    const module = await import("./layerWeather.ts");
    expect(module.defaultLayerWeather(null)).toBe(LAYER_WEATHER_DEFAULTS);
  });

  test("mud rejects snow and other physical materials share the standard defaults", () => {
    expect(LAYER_WEATHER_DEFAULTS).toEqual({ wetting: 1, porosity: 0.5, snowAccept: 1, wetPhysicalMaterial: null });
    expect(Object.isFrozen(LAYER_WEATHER_DEFAULTS)).toBe(true);
    for (const id of ["grass", "dirt", "sand", "snow", "stone", "custom", null]) {
      expect(defaultLayerWeather(id)).toBe(LAYER_WEATHER_DEFAULTS);
    }
    const mud = defaultLayerWeather("mud");
    expect(mud).toEqual({ ...LAYER_WEATHER_DEFAULTS, snowAccept: 0 });
    expect(Object.isFrozen(mud)).toBe(true);
    expect(defaultLayerWeather("mud")).toBe(mud);
  });

  test("absent and ineffective overrides reuse the physical material's default", () => {
    for (const physicalMaterial of ["mud", "grass", null]) {
      const defaults = defaultLayerWeather(physicalMaterial);
      expect(resolveLayerWeather({ physicalMaterial })).toBe(defaults);
      for (const weather of [null, {}, { porosity: undefined }, defaults]) {
        expect(resolveLayerWeather({ physicalMaterial, weather })).toBe(defaults);
      }
    }
  });

  test("resolves fields independently, trimming the wet material and freezing the result", () => {
    const weather = { porosity: 0, wetting: 0.25, wetPhysicalMaterial: "  mud\t" };
    const result = resolveLayerWeather({ physicalMaterial: "mud", weather });
    expect(result).toEqual({ porosity: 0, wetting: 0.25, snowAccept: 0, wetPhysicalMaterial: "mud" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("clamps numeric overrides to the unit interval", () => {
    const weather = { wetting: -2, porosity: 4, snowAccept: Infinity };
    expect(resolveLayerWeather({ physicalMaterial: "mud", weather })).toEqual({
      wetting: 0, porosity: 1, snowAccept: 1, wetPhysicalMaterial: null,
    });
  });

  test("NaN and wrong types fall back per field while valid overrides survive", () => {
    const weather = { wetting: NaN, porosity: "0", snowAccept: false, wetPhysicalMaterial: "silt" } as unknown as LayerWeather;
    expect(resolveLayerWeather({ physicalMaterial: "mud", weather })).toEqual({
      wetting: 1, porosity: 0.5, snowAccept: 0, wetPhysicalMaterial: "silt",
    });
  });

  test("blank, null, and non-string wet material IDs keep the layer's material", () => {
    for (const wetPhysicalMaterial of ["", "  \t", null, 17]) {
      const weather = { wetPhysicalMaterial } as Partial<LayerWeather>;
      expect(resolveLayerWeather({ physicalMaterial: "dirt", weather })).toBe(LAYER_WEATHER_DEFAULTS);
    }
  });
});

describe("terrain layer weather blending", () => {
  const dirt = { wetting: 0.5, porosity: 1, snowAccept: 0, wetPhysicalMaterial: "mud" };
  const sand = { wetting: 0, porosity: 0, snowAccept: 1, wetPhysicalMaterial: "silt" };
  const stone = LAYER_WEATHER_DEFAULTS;

  test("normalizes two layer weights for all three numeric fields and freezes the result", () => {
    const blend = blendLayerWeather(new Uint8Array([3, 1]), [dirt, sand]);
    expect(blend).toEqual({ wetting: 0.375, porosity: 0.75, snowAccept: 0.25, wetPhysicalMaterial: "mud" });
    expect(Object.isFrozen(blend)).toBe(true);
  });

  test("repeated materials combine their weights and tied totals use first appearance", () => {
    expect(blendLayerWeather([2, 3, 2], [dirt, sand, dirt]).wetPhysicalMaterial).toBe("mud");
    expect(blendLayerWeather([1, 3, 2], [dirt, sand, dirt]).wetPhysicalMaterial).toBe("mud");
    expect(blendLayerWeather([1, 3, 2], [sand, dirt, sand]).wetPhysicalMaterial).toBe("silt");
  });

  test("non-null materials qualify together at half of the total weight", () => {
    expect(blendLayerWeather([1, 3, 4], [dirt, sand, stone])).toEqual({
      wetting: 0.5625, porosity: 0.375, snowAccept: 0.875, wetPhysicalMaterial: "silt",
    });
    expect(blendLayerWeather([1, 3, 5], [dirt, sand, stone]).wetPhysicalMaterial).toBeNull();
  });

  test("negative and non-finite weights contribute nothing and zero total reuses the default", () => {
    expect(blendLayerWeather([-2, NaN, Infinity, 3], [sand, stone, sand, dirt])).toEqual(dirt);
    expect(blendLayerWeather([-2, NaN, Infinity, 0], [sand, stone, sand, dirt])).toBe(LAYER_WEATHER_DEFAULTS);
  });

  test("only paired weights and layers contribute", () => {
    expect(blendLayerWeather([1, 8], [dirt])).toEqual(dirt);
    expect(blendLayerWeather([1], [dirt, sand])).toEqual(dirt);
    expect(blendLayerWeather([], [dirt])).toBe(LAYER_WEATHER_DEFAULTS);
    expect(blendLayerWeather([1], [])).toBe(LAYER_WEATHER_DEFAULTS);
  });

  test("equal weights at either finite extreme still give an equal blend", () => {
    for (const weight of [Number.MIN_VALUE, Number.MAX_VALUE]) {
      expect(blendLayerWeather([weight, weight], [dirt, sand])).toEqual({
        wetting: 0.25, porosity: 0.5, snowAccept: 0.5, wetPhysicalMaterial: "mud",
      });
    }
  });
});
