import { describe, expect, test } from "vitest";
import { createJsonAsset, createSchemaRegistry, installFeatures, normalizeComponent } from "../../core/index.ts";
import { foliageRuleParamsOf, foliageTypeParamsOf } from "../../engine/foliage/foliageAsset.ts";
import { normalizeFoliageTypeParams } from "../../engine/foliage/foliageTypeParams.ts";
import { landscapeFoliageRuleIsUnbanded } from "../../engine/foliage/proceduralFoliage.ts";
import foliageFeature from "./feature.ts";
import { FoliageTypeAssetType, LandscapeFoliage } from "./schema.ts";

const STRICT = { strict: true } as const;

function rule(values: Record<string, unknown>) {
  const result = normalizeComponent(LandscapeFoliage, { type: "forge.landscapeFoliage@1", rules: [values] }, STRICT);
  expect(result.issues).toEqual([]);
  return result.value!.rules[0]!;
}

describe("foliage feature", () => {
  test("installs the Foliage Type asset and the Landscape Foliage component", () => {
    const registry = createSchemaRegistry();
    installFeatures([foliageFeature], registry);
    expect(registry.documentTypeForSchema("forge.foliageType/1")?.name).toBe("forge.foliageType");
    expect(registry.getComponent("forge.landscapeFoliage")).toBe(LandscapeFoliage);
  });

  test("a new Foliage Type generates like Forge's default type", () => {
    const created = createJsonAsset(FoliageTypeAssetType);
    expect(created.issues).toEqual([]);
    expect(foliageTypeParamsOf(created.value!)).toEqual(normalizeFoliageTypeParams({}));
  });

  test("Forge's optional limits come back only when their group is on", () => {
    const type = createJsonAsset(FoliageTypeAssetType, {
      scaleMin: 0.8, scaleMax: 1.2, heightLimit: { enabled: true, min: 10, max: 400 }, far: { distance: 3000, tint: 0.4 },
    }).value!;
    expect(foliageTypeParamsOf(type)).toEqual(normalizeFoliageTypeParams({
      scaleMin: [0.8, 0.8, 0.8], scaleMax: [1.2, 1.2, 1.2], heightMin: 10, heightMax: 400, farTint: 0.4,
    }));
  });

  test("a default rule is Forge's unbanded rule with its defaults", () => {
    const params = foliageRuleParamsOf(rule({ layer: "forest" }));
    expect(params).toEqual({ layerId: "forest", density: 0.25, minWeight: 0.5, seed: 1 });
    expect(landscapeFoliageRuleIsUnbanded(params)).toBe(true);
  });

  test("rule bands map to Forge's band fields", () => {
    const params = foliageRuleParamsOf(rule({
      layer: "forest", density: 0.0025, minWeight: 0.6, seed: 101,
      height: { enabled: true, min: 50, max: 900, falloff: 30 }, slope: { min: 5, max: 40, falloff: 4 },
      noise: { amount: 0.5, scale: 60 }, edgeScale: 0.6,
    }));
    expect(params).toEqual({
      layerId: "forest", density: 0.0025, minWeight: 0.6, seed: 101,
      heightMin: 50, heightMax: 900, heightFalloff: 30, slopeMin: 5, slopeMax: 40, slopeFalloff: 4,
      noiseAmount: 0.5, noiseScale: 60, edgeScale: 0.6,
    });
    expect(landscapeFoliageRuleIsUnbanded(params)).toBe(false);
  });
});
