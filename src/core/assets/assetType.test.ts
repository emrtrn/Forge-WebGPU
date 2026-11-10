import { describe, expect, test } from "vitest";
import { defineFeature, installFeatures } from "../feature.ts";
import { ACTOR_CLASS_SCHEMA, LEVEL_SCHEMA } from "../level/model.ts";
import { bool, num, SchemaDefinitionError, text } from "../schema/fields.ts";
import { createSchemaRegistry } from "../schema/registry.ts";
import {
  ActorClassAssetType,
  assetTypeTag,
  claimsFile,
  defineAssetType,
  LevelAssetType,
} from "./assetType.ts";

const Texture = defineAssetType(
  "test.texture",
  2,
  {
    extensions: ["png", "jpg", "ktx2"],
    importFields: { srgb: bool({ default: true }), maxSize: num({ min: 1, max: 8192, default: 2048 }) },
  },
  { migrations: { 1: (data) => data } },
);

const Mesh = defineAssetType("test.mesh", 1, { extensions: ["glb", "gltf"] });
const Sprite = defineAssetType("test.sprite", 1, { extensions: ["png"] });

describe("defineAssetType", () => {
  test("is frozen data with a label derived from the name", () => {
    expect(Texture).toMatchObject({
      kind: "assetType",
      storage: "binary",
      name: "test.texture",
      version: 2,
      label: "Texture",
      hint: null,
      extensions: ["png", "jpg", "ktx2"],
    });
    expect(Object.isFrozen(Texture.importFields)).toBe(true);
    expect(Mesh.importFields).toEqual({});
    expect(assetTypeTag(Texture)).toBe("test.texture@2");
  });

  test("rejects bad names, versions, extensions and defaults", () => {
    const bad: (() => unknown)[] = [
      () => defineAssetType("texture", 1, { extensions: ["png"] }),
      () => defineAssetType("test.t", 0, { extensions: ["png"] }),
      () => defineAssetType("test.t", 1, { extensions: [] }),
      () => defineAssetType("test.t", 1, { extensions: [".png"] }),
      () => defineAssetType("test.t", 1, { extensions: ["PNG"] }),
      () => defineAssetType("test.t", 1, { extensions: ["png", "png"] }),
      () => defineAssetType("test.t", 1, { extensions: ["json"] }),
      () => defineAssetType("test.t", 1, { extensions: ["layout.json"] }),
      () => defineAssetType("test.t", 2, { extensions: ["png"] }),
      () => defineAssetType("test.t", 1, { extensions: ["png"], importFields: { note: text({ required: true }) } }),
    ];
    for (const define of bad) {
      expect(define).toThrow(SchemaDefinitionError);
    }
  });

  test("claims files by suffix, case-insensitively", () => {
    const Tile = defineAssetType("test.tile", 1, { extensions: ["r16.bin"] });
    expect(claimsFile(Texture, "a/B.PNG")).toBe(true);
    expect(claimsFile(Texture, "a/png")).toBe(false);
    expect(claimsFile(Tile, "tile_0_0.r16.bin")).toBe(true);
    expect(claimsFile(Tile, "tile.bin")).toBe(false);
  });
});

describe("registry", () => {
  test("a new registry holds the built-in document types", () => {
    const registry = createSchemaRegistry();
    expect(registry.assetTypes()).toEqual([LevelAssetType, ActorClassAssetType]);
    expect(registry.documentTypeForSchema(LEVEL_SCHEMA)).toBe(LevelAssetType);
    expect(registry.documentTypeForSchema(ACTOR_CLASS_SCHEMA)).toBe(ActorClassAssetType);
    expect(registry.documentTypeForSchema("forge.level/2")).toBeUndefined();
    expect(registry.documentTypeForSchema(7)).toBeUndefined();
    expect(LevelAssetType.idKind).toBe("level");
    expect(ActorClassAssetType.idKind).toBe("asset");
  });

  test("registers binary types and finds them by file name", () => {
    const registry = createSchemaRegistry();
    registry.registerAssetType(Texture);
    registry.registerAssetType(Sprite);
    registry.registerAssetType(Mesh);
    expect(registry.getAssetType("test.texture")).toBe(Texture);
    expect(registry.binaryTypesForFile("ui/icon.png")).toEqual([Texture, Sprite]);
    expect(registry.binaryTypesForFile("car.glb")).toEqual([Mesh]);
    expect(registry.binaryTypesForFile("notes.txt")).toEqual([]);
    expect(() => registry.registerAssetType(Texture)).toThrow(/already registered/);
    expect(() => registry.registerAssetType(LevelAssetType)).toThrow(/already registered/);
    expect(() => registry.registerAssetType({ kind: "component" } as never)).toThrow(/not an asset type/);
  });

  test("two registries do not share asset types", () => {
    const first = createSchemaRegistry();
    first.registerAssetType(Mesh);
    expect(createSchemaRegistry().getAssetType("test.mesh")).toBeUndefined();
  });
});

describe("features", () => {
  test("a feature lists asset types and installFeatures registers them", () => {
    const feature = defineFeature({ id: "test.media", assetTypes: [Texture, Mesh] });
    expect(feature.assetTypes).toEqual([Texture, Mesh]);
    expect(() => defineFeature({ id: "test.media", assetTypes: [Mesh, Mesh] })).toThrow(SchemaDefinitionError);
    const registry = createSchemaRegistry();
    installFeatures([feature], registry);
    expect(registry.getAssetType("test.mesh")).toBe(Mesh);
  });
});
