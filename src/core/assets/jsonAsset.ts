// Schema-defined JSON asset types (architecture §4.6; phase 3 decision 5, the
// ground for A13).
//
// A JSON asset whose content is a field map of the schema DSL, defined once
// with `defineJsonAssetType` like a component:
//
//   { "schema": "forge.material/1", "id": "ast_…", …fields in definition order }
//
// The `schema` tag names the type and the version the file was written at;
// loading runs the migration chain from there, saving writes the current
// version (D6). Everything else comes from the field map: normalisation and
// its issues, the canonical text (every field, definition order), the asset
// references the index walks (`assetRef` fields at any depth), the Details
// form and the JSON Schema. The file name ends with the type's suffix
// (`brick.material.json`). A data document (`dataDocument.ts`) is the other
// kind of engine document: its content belongs to another layer's normaliser.

import { createId, isId, type AssetId } from "../id.ts";
import { isJsonObject, type JsonObject } from "../json.ts";
import { COMPONENT_NAME_PATTERN } from "../schema/component.ts";
import { checkFieldMap, deepFreeze, SchemaDefinitionError, type FieldMap, type FieldValues } from "../schema/fields.ts";
import {
  createContext,
  finish,
  reportFatal,
  reportLoss,
  type NormalizeOptions,
  type NormalizeResult,
} from "../schema/issues.ts";
import { JSON_SCHEMA_DRAFT, fieldMapJsonSchema, idJsonSchema, type JsonSchemaObject } from "../schema/jsonSchema.ts";
import { labelFromComponentName } from "../schema/label.ts";
import { checkMigrations, runMigrations, type MigrationMap } from "../schema/migrate.ts";
import { assertDefaultsAreNormal, normalizeFieldMap } from "../schema/normalize.ts";
import type { DocumentAssetTypeDef } from "./assetType.ts";
import { EXTENSION_PATTERN } from "./assetType.ts";

/** What makes a document type schema-defined. */
export interface JsonAssetShape<M extends FieldMap = FieldMap> {
  /** Version of the field map; the `schema` tag of a saved file. */
  readonly version: number;
  /** The file name ends with this, e.g. `.material.json`. */
  readonly suffix: string;
  readonly fields: M;
  /** One step per earlier version, keyed by the version it migrates from. */
  readonly migrations: MigrationMap;
}

export interface JsonAssetTypeDef<M extends FieldMap = FieldMap> extends DocumentAssetTypeDef {
  readonly idKind: "asset";
  readonly json: JsonAssetShape<M>;
}

/** A JSON asset as stored: envelope + field values. */
export type JsonAssetDoc<M extends FieldMap = FieldMap> = { schema: string; id: AssetId } & FieldValues<M>;

export interface JsonAssetTypeOptions {
  readonly label?: string;
  /** Turkish description shown in the editor. */
  readonly hint?: string;
  readonly migrations?: MigrationMap;
}

const ENVELOPE_KEYS = ["schema", "id"];

/** `forge.material/2` -> name and version; null when malformed. */
export function parseDocumentSchemaTag(tag: unknown): { name: string; version: number } | null {
  if (typeof tag !== "string") return null;
  const slash = tag.lastIndexOf("/");
  if (slash <= 0) return null;
  const name = tag.slice(0, slash);
  const version = tag.slice(slash + 1);
  if (!COMPONENT_NAME_PATTERN.test(name) || !/^[1-9][0-9]*$/.test(version)) return null;
  return { name, version: Number(version) };
}

export function defineJsonAssetType<M extends FieldMap>(
  name: string,
  version: number,
  definition: { readonly suffix: string; readonly fields: M },
  options: JsonAssetTypeOptions = {},
): JsonAssetTypeDef<M> {
  const what = `defineJsonAssetType ${name}`;
  if (!COMPONENT_NAME_PATTERN.test(name)) {
    throw new SchemaDefinitionError(`defineJsonAssetType: "${name}" must be a namespaced name such as "forge.material".`);
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new SchemaDefinitionError(`${what}: version must be an integer >= 1.`);
  }
  const { suffix } = definition;
  if (!suffix.startsWith(".") || !suffix.endsWith(".json") || !EXTENSION_PATTERN.test(suffix.slice(1))) {
    throw new SchemaDefinitionError(`${what}: suffix "${suffix}" must look like ".material.json".`);
  }
  if (suffix === ".json" || suffix === ".meta.json") {
    throw new SchemaDefinitionError(`${what}: suffix "${suffix}" does not name a type.`);
  }
  const fields = { ...definition.fields } as M;
  checkFieldMap(what, fields);
  for (const reserved of ENVELOPE_KEYS) {
    if (Object.hasOwn(fields, reserved)) {
      throw new SchemaDefinitionError(`${what}: "${reserved}" is part of the envelope and cannot be a field.`);
    }
  }
  assertDefaultsAreNormal(what, fields);
  const migrations = { ...options.migrations };
  checkMigrations(what, version, migrations);
  return deepFreeze({
    kind: "assetType",
    storage: "document",
    name,
    label: options.label ?? labelFromComponentName(name),
    hint: options.hint ?? null,
    schema: `${name}/${version}`,
    idKind: "asset",
    json: { version, suffix, fields, migrations },
  }) as JsonAssetTypeDef<M>;
}

export function isJsonAssetType(def: { readonly storage: string }): def is JsonAssetTypeDef {
  return def.storage === "document" && (def as Partial<JsonAssetTypeDef>).json !== undefined;
}

/**
 * Reads a JSON asset of `def`: migrates from the version its tag names, then
 * normalises the fields. Null when the file cannot be read as this type at all.
 */
export function normalizeJsonAsset<M extends FieldMap>(
  def: JsonAssetTypeDef<M>,
  raw: unknown,
  options: NormalizeOptions,
): NormalizeResult<JsonAssetDoc<M> | null> {
  const ctx = createContext(options);
  if (!isJsonObject(raw)) {
    reportFatal(ctx, "invalid-document", "", `A ${def.label} must be a JSON object.`);
    return finish(ctx, null);
  }
  const tag = parseDocumentSchemaTag(raw.schema);
  if (!tag || tag.name !== def.name) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${def.name}/<version>".`);
    return finish(ctx, null);
  }
  if (tag.version > def.json.version) {
    reportFatal(ctx, "unsupported-version", "schema", `Version ${tag.version} of ${def.name} is newer than this build (${def.json.version}).`);
    return finish(ctx, null);
  }
  if (!isId(raw.id, "asset")) {
    reportFatal(ctx, "invalid-document", "id", `A ${def.label} needs an asset id.`);
    return finish(ctx, null);
  }
  const { schema: _schema, id, ...stored } = raw;
  let data: JsonObject = stored;
  if (tag.version < def.json.version) {
    const outcome = runMigrations(def.json.migrations, tag.version, def.json.version, stored);
    if (!outcome.ok) {
      reportLoss(ctx, "migration-failed", "", `${def.name}: ${outcome.reason}; defaults used.`);
      data = {};
    } else {
      data = outcome.data;
    }
  }
  const value = { schema: def.schema, id, ...normalizeFieldMap(def.json.fields, data, "", ctx) };
  return finish(ctx, value as JsonAssetDoc<M>);
}

/** A new JSON asset with every field at its default, or the given values normalised. */
export function createJsonAsset<M extends FieldMap>(
  def: JsonAssetTypeDef<M>,
  values: Partial<FieldValues<M>> = {},
  id: AssetId = createId("asset"),
): NormalizeResult<JsonAssetDoc<M> | null> {
  return normalizeJsonAsset(def, { ...values, schema: def.schema, id }, { strict: true });
}

/** Draft-07 schema of a JSON asset file (architecture §4.5): what normalisation accepts without issues. */
export function jsonAssetJsonSchema(def: JsonAssetTypeDef): JsonSchemaObject {
  const fields = fieldMapJsonSchema(def.json.fields);
  return {
    $schema: JSON_SCHEMA_DRAFT,
    title: def.label,
    ...(def.hint !== null ? { description: def.hint } : {}),
    type: "object",
    properties: {
      schema: { const: def.schema },
      id: idJsonSchema("asset", false),
      ...(fields.properties as Record<string, unknown>),
    },
    required: ["schema", "id", ...((fields.required as string[] | undefined) ?? [])],
    additionalProperties: false,
  };
}
