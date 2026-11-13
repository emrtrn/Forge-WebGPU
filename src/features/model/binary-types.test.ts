import { describe, expect, test } from "vitest";
import {
  claimsFile,
  createAssetMeta,
  createSchemaRegistry,
  normalizeAssetMeta,
  installFeatures,
  normalizeComponent,
} from "../../core/index.ts";
import soundFeature from "../sound/feature.ts";
import { SoundAssetType } from "../sound/schema.ts";
import { StaticMesh } from "../static-mesh/schema.ts";
import textureFeature from "../texture/feature.ts";
import { TextureAssetType } from "../texture/schema.ts";
import modelFeature from "./feature.ts";
import { ModelAssetType } from "./schema.ts";

const ID = "ast_0123456789abcdef0123456789abcdef";

// The three schema-only binary asset types of the importer (plan 2b, user decision 2026-11-12).
describe("binary asset types", () => {
  test("they install together and claim their extensions", () => {
    const registry = createSchemaRegistry();
    installFeatures([modelFeature, textureFeature, soundFeature], registry);
    expect(registry.assetTypes().filter((def) => def.storage === "binary").map((def) => def.name)).toEqual([
      "forge.model",
      "forge.texture",
      "forge.sound",
    ]);
    expect(claimsFile(ModelAssetType, "rock.glb")).toBe(true);
    expect(claimsFile(ModelAssetType, "rock.GLTF")).toBe(true);
    expect(claimsFile(TextureAssetType, "bark.ktx2")).toBe(true);
    expect(claimsFile(TextureAssetType, "bark.jpeg")).toBe(false);
    expect(claimsFile(SoundAssetType, "engine.ogg")).toBe(true);
  });

  test("a new meta file carries the type's import settings at their defaults", () => {
    const registry = createSchemaRegistry();
    installFeatures([modelFeature, textureFeature, soundFeature], registry);
    const expected = new Map<string, unknown>([
      ["forge.model", { type: "forge.model@2", import: { materials: [], uvw: { mapType: "none", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, vertexColors: [] } }],
      ["forge.texture", { type: "forge.texture@2", import: { anisotropy: 8, mipmaps: true } }],
      ["forge.sound", { type: "forge.sound@1", import: {} }],
    ]);
    for (const type of [ModelAssetType, TextureAssetType, SoundAssetType]) {
      const meta = createAssetMeta(
        type,
        { license: "LicenseRef-forge-unverified", source: { origin: "Forge WebGL starter content" } },
        { strict: true, registry },
        ID,
      );
      expect(meta.ok).toBe(true);
      expect(meta.value).toMatchObject(expected.get(type.name)!);
    }
  });

  test("version 1 meta files of models and textures migrate to version 2 (phase 3 step 4)", () => {
    const registry = createSchemaRegistry();
    installFeatures([modelFeature, textureFeature, soundFeature], registry);
    const old = (type: string) => ({ schema: "forge.assetMeta/1", id: ID, type, license: "CC0-1.0", source: { origin: "test" }, import: {} });
    const texture = normalizeAssetMeta(old("forge.texture@1"), { strict: true, registry });
    expect(texture.ok).toBe(true);
    expect(texture.value).toMatchObject({ type: "forge.texture@2", import: { anisotropy: 8, mipmaps: true } });
    expect(normalizeAssetMeta(old("forge.model@1"), { strict: true, registry }).value).toMatchObject({ type: "forge.model@2", import: { materials: [] } });
    const clamped = normalizeAssetMeta({ ...old("forge.texture@2"), import: { anisotropy: 64 } }, { strict: true, registry });
    expect(clamped.value?.import).toMatchObject({ anisotropy: 16 });
  });

  test("a static mesh shows a model", () => {
    expect(StaticMesh.fields.mesh).toMatchObject({ kind: "assetRef", assetType: "forge.model" });
    expect(normalizeComponent(StaticMesh, { type: "forge.staticMesh@2", mesh: ID }, { strict: true }).ok).toBe(true);
  });
});
