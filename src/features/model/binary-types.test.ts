import { describe, expect, test } from "vitest";
import {
  claimsFile,
  createAssetMeta,
  createSchemaRegistry,
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

  test("version 1 has no import settings: a meta file carries an empty import", () => {
    const registry = createSchemaRegistry();
    installFeatures([modelFeature, textureFeature, soundFeature], registry);
    for (const type of [ModelAssetType, TextureAssetType, SoundAssetType]) {
      const meta = createAssetMeta(
        type,
        { license: "LicenseRef-forge-unverified", source: { origin: "Forge WebGL starter content" } },
        { strict: true, registry },
        ID,
      );
      expect(meta.ok).toBe(true);
      expect(meta.value).toMatchObject({ type: `${type.name}@1`, import: {} });
    }
  });

  test("a static mesh shows a model", () => {
    expect(StaticMesh.fields.mesh).toMatchObject({ kind: "assetRef", assetType: "forge.model" });
    expect(normalizeComponent(StaticMesh, { type: "forge.staticMesh@1", mesh: ID }, { strict: true }).ok).toBe(true);
  });
});
