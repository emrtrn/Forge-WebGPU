import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createJsonAsset, createSchemaRegistry, formFields, installFeatures, normalizeJsonAsset } from "../../core/index.ts";
import { convertForgeMaterial } from "../../engine/forgeImport/forgeMaterial.ts";
import materialFeature from "./feature.ts";
import { MATERIAL_PRESET_VALUES, MATERIAL_PRESETS, MaterialAssetType } from "./schema.ts";

const check = test;
const ID = "ast_0123456789abcdef0123456789abcdef";
const TEX = (n: number) => `ast_${n.toString(16).padStart(32, "0")}` as const;
const STRICT = { strict: true } as const;

// Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23), adapted (phase 3 decision 5,
// docs/PORT_LOG.md §2): the starter pack's materials are the converted ones and are read with the
// new type's normaliser. The same assertions, each on its new form: `schema: 1` is the type's
// schema tag, `type: "material"` is the asset type the tag names, the name is the file name (the
// asset no longer stores one), `uvTiling` is `[x, y]`, a layer blend is on when `enabled`.
check("starter material assets normalize to the canonical material shape", () => {
  const registry = createSchemaRegistry();
  installFeatures([materialFeature], registry);
  const materialDir = "content/packs/starter/starter-content/Materials";
  const files = readdirSync(materialDir).filter((fileName) => fileName.endsWith(".material.json"));
  assert.equal(files.length, 12);
  for (const fileName of files) {
    const data = JSON.parse(readFileSync(`${materialDir}/${fileName}`, "utf8")) as unknown;
    const result = normalizeJsonAsset(MaterialAssetType, data, STRICT);
    const material = result.value;
    assert.ok(result.ok && material, `${fileName}: ${JSON.stringify(result.issues)}`);
    assert.equal(material.schema, "forge.material/1");
    assert.equal(registry.documentTypeForSchema(material.schema)?.name, "forge.material");
    assert.ok(fileName.replace(/\.material\.json$/, "").length > 0);
    assert.ok(material.roughness >= 0 && material.roughness <= 1);
    assert.ok(material.metalness >= 0 && material.metalness <= 1);
    assert.ok(material.aoIntensity >= 0 && material.aoIntensity <= 1);
    assert.ok(material.opacity >= 0 && material.opacity <= 1);
    assert.ok(material.uvTiling[0] > 0 && material.uvTiling[1] > 0);
    assert.ok(!material.layerBlend.enabled || material.layerBlend.layer1.baseColor.length === 7);
  }
});

describe("forge.material", () => {
  test("defaults are Forge's standard preset; every preset normalises without issues", () => {
    const created = createJsonAsset(MaterialAssetType, {}, ID);
    expect(created.ok).toBe(true);
    expect(created.value).toMatchObject({
      schema: "forge.material/1", materialType: "standard", baseColor: "#ffffff", roughness: 0.8, metalness: 0, flipY: true,
      alphaMode: "opaque", alphaTest: 0.5, side: "front", uvTiling: [1, 1], layerBlend: { enabled: false }, sway: { enabled: false },
    });
    for (const preset of MATERIAL_PRESETS) {
      const value = createJsonAsset(MaterialAssetType, MATERIAL_PRESET_VALUES[preset], ID);
      expect(value.issues, preset).toEqual([]);
    }
    expect(createJsonAsset(MaterialAssetType, MATERIAL_PRESET_VALUES.glass, ID).value).toMatchObject({ alphaMode: "blend", opacity: 0.35, side: "double" });
  });

  test("texture slots point at textures; the form comes from the fields", () => {
    expect(MaterialAssetType.json.fields.baseColorTexture).toMatchObject({ kind: "assetRef", assetType: "forge.texture" });
    const keys = formFields(MaterialAssetType.json.fields).map((field) => field.key);
    expect(keys.slice(0, 3)).toEqual(["materialType", "baseColor", "baseColorTexture"]);
    expect(keys).not.toContain("name");
  });

  test("a converted Forge material normalises without issues and keeps what Forge drew", () => {
    const textures = new Map([["t-a", TEX(1)], ["t-n", TEX(2)], ["t-mask", TEX(3)], ["t-l", TEX(4)]]);
    const resolve = (id: string) => textures.get(id) ?? null;
    // A legacy mask without a layer blend is also read as ORM (Forge's rule); opacity below 1 without a mode blends.
    const legacy = convertForgeMaterial(
      { schema: 1, type: "material", name: "Old", baseColorTexture: "t-a", maskTexture: "t-mask", opacity: 0.5, uvTiling: { x: 2, y: 3 } },
      ID,
      resolve,
    );
    const normal = normalizeJsonAsset(MaterialAssetType, legacy.document, STRICT);
    expect(normal.issues).toEqual([]);
    expect(normal.value).toMatchObject({ ormTexture: TEX(3), maskTexture: TEX(3), alphaMode: "blend", opacity: 0.5, uvTiling: [2, 3], baseColorTexture: TEX(1) });
    // A mask-texture layer blend takes the legacy mask; motion, sway and terrain detail carry over.
    const layered = convertForgeMaterial(
      {
        schema: 1, type: "material", normalTexture: "t-n", maskTexture: "t-mask",
        layerBlend: { driver: "maskTexture", layer1: { baseColorTexture: "t-l", uvTiling: { x: 4, y: 4 } } },
        normalMotion: { strength: 9 }, sway: { amplitude: 0.3 }, terrainDetail: { normalTexture: "t-n", atlasSize: 2 },
        terrainMetersPerRepeat: 0.01,
      },
      ID,
      resolve,
    );
    const value = normalizeJsonAsset(MaterialAssetType, layered.document, STRICT);
    expect(value.issues).toEqual([]);
    expect(value.value).toMatchObject({
      maskTexture: null, ormTexture: null, terrainMetersPerRepeat: 0.05,
      layerBlend: { enabled: true, driver: "maskTexture", maskTexture: TEX(3), layer1: { baseColorTexture: TEX(4), uvTiling: [4, 4] } },
      normalMotion: { enabled: true, strength: 4 },
      sway: { enabled: true, amplitude: 0.3, height: 1, frequency: 0.6 },
      terrainDetail: { normalTexture: TEX(2), atlasSize: "2x2", patchSize: 6 },
    });
  });

  test("a texture the target lacks leaves its slot empty and is reported", () => {
    const converted = convertForgeMaterial({ baseColorTexture: "gone", layerBlend: { layer1: { aoTexture: "gone-too" } } }, ID, () => null);
    expect(converted.missingTextures).toEqual([
      { slot: "baseColorTexture", textureId: "gone" },
      { slot: "layerBlend.layer1.aoTexture", textureId: "gone-too" },
    ]);
    expect(normalizeJsonAsset(MaterialAssetType, converted.document, STRICT).value?.baseColorTexture).toBeNull();
  });
});
