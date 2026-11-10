// JSON Schema export for asset meta files (architecture §4.5, §4.6).
//
// Generated from a schema registry: `type` lists the registered binary asset
// types at their current version, and `import` is checked against the type
// the file names. Licence and source come from `AssetMetaFields`.

import { idJsonSchema, fieldMapJsonSchema, JSON_SCHEMA_DRAFT, type JsonSchema } from "../schema/jsonSchema.ts";
import type { SchemaRegistry } from "../schema/registry.ts";
import { assetTypeTag, type BinaryAssetTypeDef } from "./assetType.ts";
import { ASSET_META_SCHEMA, AssetMetaFields } from "./meta.ts";

export function assetMetaJsonSchema(registry: SchemaRegistry): JsonSchema {
  const types = registry
    .assetTypes()
    .filter((def): def is BinaryAssetTypeDef => def.storage === "binary");
  const provenance = fieldMapJsonSchema(AssetMetaFields);
  const definitions: Record<string, JsonSchema> = {};
  for (const def of types) {
    definitions[def.name] = { title: `${def.label} import settings`, ...fieldMapJsonSchema(def.importFields) };
  }
  return {
    $schema: JSON_SCHEMA_DRAFT,
    title: "Forge asset meta",
    type: "object",
    properties: {
      schema: { const: ASSET_META_SCHEMA },
      id: idJsonSchema("asset", false),
      type: types.length === 0 ? false : { enum: types.map(assetTypeTag) },
      ...(provenance.properties as Record<string, JsonSchema>),
      import: { type: "object" },
    },
    required: ["schema", "id", "type", ...(provenance.required as string[])],
    additionalProperties: false,
    // Dispatch on `type` with if / then so a validator names the bad setting.
    allOf: types.map((def) => ({
      if: { properties: { type: { const: assetTypeTag(def) } }, required: ["type"] },
      then: { properties: { import: { $ref: `#/definitions/${def.name}` } } },
    })),
    definitions,
  };
}
