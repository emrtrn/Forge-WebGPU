import { describe, expect, test } from "vitest";
import { defineFeature, installFeatures } from "../feature.ts";
import { assetRef, color, num, object, SchemaDefinitionError } from "../schema/fields.ts";
import { formFields } from "../schema/form.ts";
import { createSchemaRegistry } from "../schema/registry.ts";
import { buildAssetIndex } from "./assetIndex.ts";
import { identifyAssets, type ContentFile } from "./identity.ts";
import {
  createJsonAsset,
  defineJsonAssetType,
  isJsonAssetType,
  jsonAssetJsonSchema,
  normalizeJsonAsset,
  parseDocumentSchemaTag,
} from "./jsonAsset.ts";
import { asset, assetId, createAssetTestRegistry, fileSummary, ROOT, TEX, Texture } from "./testKit.ts";

// Version 2 renamed `tint` to `baseColor` and grouped the texture.
const Paint = defineJsonAssetType(
  "test.paint",
  2,
  {
    suffix: ".paint.json",
    fields: {
      baseColor: color({ default: "#ffffff", hint: "Temel renk." }),
      roughness: num({ min: 0, max: 1, default: 0.8 }),
      maps: object({ albedo: assetRef({ assetType: "test.texture" }) }),
    },
  },
  {
    hint: "Test boyası.",
    migrations: {
      1: ({ tint, albedo, ...rest }) => ({
        ...rest,
        ...(tint === undefined ? {} : { baseColor: tint }),
        ...(albedo === undefined ? {} : { maps: { albedo } }),
      }),
    },
  },
);

const PAINT = assetId("e1");
const STRICT = { strict: true } as const;

function registry() {
  const out = createAssetTestRegistry();
  installFeatures([defineFeature({ id: "test.paint", assetTypes: [Paint] })], out);
  return out;
}

const paintFile = (path: string, json: unknown): ContentFile => ({ root: ROOT, path, json });

describe("schema-defined JSON asset types", () => {
  test("a definition carries its suffix, fields and version; the schema tag is the current one", () => {
    expect(Paint).toMatchObject({ kind: "assetType", storage: "document", name: "test.paint", schema: "test.paint/2", idKind: "asset" });
    expect(Paint.json.suffix).toBe(".paint.json");
    expect(isJsonAssetType(Paint)).toBe(true);
    expect(isJsonAssetType(Texture)).toBe(false);
    expect(parseDocumentSchemaTag("forge.material/12")).toEqual({ name: "forge.material", version: 12 });
    expect(parseDocumentSchemaTag("forge.material@1")).toBeNull();
  });

  test("bad definitions are refused", () => {
    const fields = { a: num({ default: 0 }) };
    expect(() => defineJsonAssetType("paint", 1, { suffix: ".paint.json", fields })).toThrow(SchemaDefinitionError);
    expect(() => defineJsonAssetType("test.a", 1, { suffix: "paint.json", fields })).toThrow(SchemaDefinitionError);
    expect(() => defineJsonAssetType("test.a", 1, { suffix: ".meta.json", fields })).toThrow(SchemaDefinitionError);
    expect(() => defineJsonAssetType("test.a", 1, { suffix: ".a.json", fields: { id: num({ default: 0 }) } })).toThrow(SchemaDefinitionError);
    expect(() => defineJsonAssetType("test.a", 2, { suffix: ".a.json", fields })).toThrow(/migration from version 1/);
  });

  test("the registry recognises every version's tag, and the tag stays unique", () => {
    const reg = registry();
    expect(reg.documentTypeForSchema("test.paint/1")).toBe(Paint);
    expect(reg.documentTypeForSchema("test.paint/2")).toBe(Paint);
    expect(reg.documentTypeForSchema("test.paint/3")).toBeUndefined();
    expect(() => reg.registerAssetType(Paint)).toThrow(SchemaDefinitionError);
  });

  test("an older file migrates; the output is canonical and in the current version", () => {
    const old = { schema: "test.paint/1", id: PAINT, tint: "#FF0000", albedo: TEX };
    const result = normalizeJsonAsset(Paint, old, STRICT);
    expect(result.issues).toEqual([]);
    expect(JSON.stringify(result.value)).toBe(
      JSON.stringify({ schema: "test.paint/2", id: PAINT, baseColor: "#ff0000", roughness: 0.8, maps: { albedo: TEX } }),
    );
    const again = normalizeJsonAsset(Paint, result.value, STRICT);
    expect(again.value).toEqual(result.value);
  });

  test("losses and refusals follow the normalisation rules", () => {
    const clamped = normalizeJsonAsset(Paint, { schema: "test.paint/2", id: PAINT, roughness: 4 }, STRICT);
    expect(clamped.ok).toBe(true);
    expect(clamped.value?.roughness).toBe(1);
    const unknown = normalizeJsonAsset(Paint, { schema: "test.paint/2", id: PAINT, shiny: true }, STRICT);
    expect(unknown.ok).toBe(false);
    expect(unknown.issues.map((issue) => issue.code)).toEqual(["unknown-field"]);
    expect(normalizeJsonAsset(Paint, { schema: "test.paint/3", id: PAINT }, STRICT).value).toBeNull();
    expect(normalizeJsonAsset(Paint, { schema: "test.other/2", id: PAINT }, STRICT).value).toBeNull();
    expect(normalizeJsonAsset(Paint, { schema: "test.paint/2", id: "lvl_x" }, STRICT).value).toBeNull();
  });

  test("createJsonAsset fills defaults; the form and JSON Schema come from the same fields", () => {
    const created = createJsonAsset(Paint, { roughness: 0.25 }, PAINT);
    expect(created.value).toEqual({ schema: "test.paint/2", id: PAINT, baseColor: "#ffffff", roughness: 0.25, maps: { albedo: null } });
    expect(formFields(Paint.json.fields).map((field) => `${field.key}:${field.kind}`)).toEqual(["baseColor:color", "roughness:number", "maps:object"]);
    const schema = jsonAssetJsonSchema(Paint);
    expect(schema).toMatchObject({ type: "object", required: ["schema", "id"], additionalProperties: false, description: "Test boyası." });
    expect((schema.properties as Record<string, unknown>).schema).toEqual({ const: "test.paint/2" });
  });

  test("the asset index identifies the file by its tag and suffix, and walks its references", () => {
    const reg = registry();
    const files = [
      ...asset("textures/paint.png", TEX, "test.texture@1"),
      paintFile("paints/red.paint.json", { schema: "test.paint/1", id: PAINT, albedo: TEX }),
    ];
    const index = buildAssetIndex(files, { strict: true, registry: reg });
    expect(fileSummary(index.issues)).toEqual([]);
    expect(index.entries.get(PAINT)).toMatchObject({ type: "test.paint", storage: "document", path: "paints/red.paint.json" });
    expect(index.jsonAssets.get(PAINT)?.maps).toEqual({ albedo: TEX });
    expect(index.referrersOf(TEX)).toEqual([
      { path: "maps.albedo", target: TEX, assetType: "test.texture", via: "field", from: PAINT, file: "content/paints/red.paint.json" },
    ]);
    expect(index.metas.get(TEX)?.type).toBe("test.texture@1");
  });

  test("a dangling or wrongly typed reference and a misnamed file are reported", () => {
    const reg = registry();
    const missing = assetId("ff");
    const dangling = buildAssetIndex(
      [paintFile("paints/red.paint.json", { schema: "test.paint/2", id: PAINT, maps: { albedo: missing } })],
      { strict: true, registry: reg },
    );
    expect(dangling.ok).toBe(false);
    expect(fileSummary(dangling.issues).join("\n")).toContain("content/paints/red.paint.json maps.albedo");
    const misnamed = identifyAssets([paintFile("paints/red.json", { schema: "test.paint/2", id: PAINT })], { strict: true, registry: reg });
    expect(fileSummary(misnamed.issues)).toEqual(["error invalid-document content/paints/red.json"]);
  });

  test("a feature registers it like a binary type", () => {
    const reg = createSchemaRegistry();
    installFeatures([defineFeature({ id: "test.paint", assetTypes: [Paint] })], reg);
    expect(reg.getAssetType("test.paint")).toBe(Paint);
  });
});
