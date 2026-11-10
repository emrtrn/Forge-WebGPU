import { describe, expect, test } from "vitest";
import { bool, num } from "../schema/fields.ts";
import { validateJsonSchema } from "../schema/jsonSchemaTestValidator.ts";
import { createSchemaRegistry } from "../schema/registry.ts";
import { defineAssetType } from "./assetType.ts";
import { assetMetaJsonSchema } from "./jsonSchema.ts";
import {
  ASSET_META_SCHEMA,
  assetPathOfMeta,
  createAssetMeta,
  metaPathOf,
  metaTypeOf,
  normalizeAssetMeta,
} from "./meta.ts";

const ID = "ast_0123456789abcdef0123456789abcdef";

const Texture = defineAssetType(
  "test.texture",
  2,
  {
    extensions: ["png"],
    importFields: { srgb: bool({ default: true }), maxSize: num({ min: 1, max: 8192, default: 2048 }) },
  },
  { migrations: { 1: ({ linear, ...rest }) => (linear === undefined ? rest : { ...rest, srgb: !linear }) } },
);
const Mesh = defineAssetType("test.mesh", 1, { extensions: ["glb"] });

function createRegistry() {
  const registry = createSchemaRegistry();
  registry.registerAssetType(Texture);
  registry.registerAssetType(Mesh);
  return registry;
}

const SOURCE = { origin: "Kenney · City Kit", author: "Kenney", url: "https://kenney.nl/assets" };
const GOOD = {
  schema: ASSET_META_SCHEMA,
  id: ID,
  type: "test.texture@2",
  license: "CC0-1.0",
  source: SOURCE,
  import: { srgb: false, maxSize: 1024 },
};

function check(raw: unknown, strict = true) {
  return normalizeAssetMeta(raw, { strict, registry: createRegistry() });
}

function summary(raw: unknown, strict = true): string[] {
  return check(raw, strict).issues.map((issue) => `${issue.severity} ${issue.code} ${issue.path}`);
}

describe("meta file paths", () => {
  test("the meta file sits next to the asset, full name kept", () => {
    expect(metaPathOf("meshes/car.glb")).toBe("meshes/car.glb.meta.json");
    expect(assetPathOfMeta("meshes/car.glb.meta.json")).toBe("meshes/car.glb");
    expect(assetPathOfMeta("meshes/car.json")).toBeNull();
    expect(assetPathOfMeta(".meta.json")).toBeNull();
  });
});

describe("normalizeAssetMeta", () => {
  test("a canonical meta file comes back unchanged and without issues", () => {
    const result = check(GOOD);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.value).toEqual(GOOD);
    expect(Object.keys(result.value ?? {})).toEqual(["schema", "id", "type", "license", "source", "import"]);
    expect(check(result.value).value).toEqual(result.value);
  });

  test("missing import settings and optional source fields take defaults", () => {
    const { import: _, ...rest } = GOOD;
    const result = check({ ...rest, source: { origin: "authored" } });
    expect(result.ok).toBe(true);
    expect(result.value?.import).toEqual({ srgb: true, maxSize: 2048 });
    expect(result.value?.source).toEqual({ origin: "authored", author: "", url: "" });
  });

  test("type, licence and source are required (D16)", () => {
    const { type: _t, license: _l, source: _s, ...bare } = GOOD;
    expect(summary(bare)).toEqual([
      "error missing-required type",
      "error missing-required license",
      "error missing-required source.origin",
    ]);
    expect(summary(bare, false).every((line) => line.startsWith("warning"))).toBe(true);
    expect(summary({ ...GOOD, source: { origin: "  " } })).toEqual(["error missing-required source.origin"]);
  });

  test("an unknown licence is refused; SPDX ids and LicenseRef pass", () => {
    for (const license of ["Unknown", "unknown", "UNKNOWN", "NOASSERTION", "CC0 1.0", "", "-x"]) {
      expect(check({ ...GOOD, license }).ok, license).toBe(false);
    }
    for (const license of ["CC0-1.0", "CC-BY-4.0", "MIT", "LicenseRef-ProjectPlaceholder", "GPL-3.0+"]) {
      expect(check({ ...GOOD, license }).ok, license).toBe(true);
    }
  });

  test("an unregistered or document type keeps the import settings unchecked", () => {
    const unknown = check({ ...GOOD, type: "test.sound@1", import: { volume: 2 } });
    expect(unknown.ok).toBe(false);
    expect(unknown.value).toMatchObject({ type: "test.sound@1", import: { volume: 2 } });
    expect(summary({ ...GOOD, type: "test.sound@1" })).toEqual(["error unknown-asset-type type"]);
    expect(summary({ ...GOOD, type: "forge.level@1" })).toEqual(["error unknown-asset-type type"]);
    expect(summary({ ...GOOD, type: "texture" })).toEqual(["error invalid-value type"]);
    expect(summary({ ...GOOD, type: "test.texture@3" })).toEqual(["error unsupported-version type"]);
  });

  test("an older import settings version runs the migration chain", () => {
    const result = check({ ...GOOD, type: "test.texture@1", import: { linear: true } });
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ type: "test.texture@2", import: { srgb: false, maxSize: 2048 } });
  });

  test("import settings follow the field rules", () => {
    expect(summary({ ...GOOD, import: { maxSize: 99999, gamma: 2 } })).toEqual([
      "warning clamped import.maxSize",
      "error unknown-field import.gamma",
    ]);
    expect(summary({ ...GOOD, import: 3 })).toEqual(["error invalid-value import"]);
  });

  test("unknown top-level keys are a loss; a document that is not a meta file is fatal", () => {
    expect(summary({ ...GOOD, tags: [] })).toEqual(["error unknown-field tags"]);
    expect(check([]).value).toBeNull();
    expect(check({ ...GOOD, schema: "forge.assetMeta/2" }).value).toBeNull();
    expect(summary({ ...GOOD, id: "act_0123456789abcdef0123456789abcdef" }, false)).toEqual([
      "error invalid-document id",
    ]);
  });

  test("createAssetMeta builds a canonical meta file and reports missing provenance", () => {
    const registry = createRegistry();
    const made = createAssetMeta(Mesh, { license: "CC0-1.0", source: { origin: "authored" } }, { strict: true, registry });
    expect(made.ok).toBe(true);
    expect(made.value?.id).toMatch(/^ast_[0-9a-f]{32}$/);
    expect(made.value).toMatchObject({ type: "test.mesh@1", import: {} });
    expect(made.value && metaTypeOf(registry, made.value)).toBe(Mesh);
    const missing = createAssetMeta(Mesh, { license: "", source: {} }, { strict: true, registry }, ID);
    expect(missing.issues.map((issue) => issue.code)).toEqual(["missing-required", "missing-required"]);
  });
});

describe("assetMetaJsonSchema", () => {
  test("accepts what normalisation accepts and rejects what it refuses", () => {
    const registry = createRegistry();
    const schema = assetMetaJsonSchema(registry);
    expect(validateJsonSchema(schema, GOOD)).toEqual([]);
    expect(validateJsonSchema(schema, { ...GOOD, type: "test.mesh@1", import: {} })).toEqual([]);
    for (const bad of [
      { ...GOOD, license: "Unknown" },
      { ...GOOD, source: { origin: "" } },
      { ...GOOD, import: { gamma: 2 } },
      { ...GOOD, import: { maxSize: 99999 } },
      { ...GOOD, type: "test.mesh@1" },
    ]) {
      expect(validateJsonSchema(schema, bad)).not.toEqual([]);
      expect(check(bad).issues).not.toEqual([]);
    }
    // Like a component's `type`, the file on disk is written by a save: an older
    // version migrates on load but is not what the schema describes.
    expect(validateJsonSchema(schema, { ...GOOD, type: "test.texture@1" })).not.toEqual([]);
    const { license: _, ...unlicensed } = GOOD;
    expect(validateJsonSchema(schema, unlicensed)).toEqual(["license: required"]);
  });
});
