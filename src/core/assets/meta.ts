// Asset meta files, `forge.assetMeta/1` (architecture §4.6, decision A10; D16).
//
// A binary asset (GLB, texture, sound, terrain tile) carries its identity next
// to it in `<file>.meta.json`: GUID, type, licence, source and the type's
// import settings. Type, licence and source are required: an asset whose
// origin is unknown is not let in (D16). Loading and saving both call
// `normalizeAssetMeta`; there is no second check.
//
// Licence and source are an ordinary field map (`AssetMetaFields`), so the
// Details form and the JSON Schema come from the same definition as the
// normalisation.

import { createId, isId, type AssetId } from "../id.ts";
import { isJsonObject, type JsonObject } from "../json.ts";
import { parseComponentTypeTag } from "../schema/component.ts";
import { object, text, type FieldValues } from "../schema/fields.ts";
import {
  createContext,
  finish,
  reportFatal,
  reportLoss,
  type NormalizeContext,
  type NormalizeOptions,
  type NormalizeResult,
} from "../schema/issues.ts";
import { runMigrations } from "../schema/migrate.ts";
import { normalizeFieldMap, normalizeValue } from "../schema/normalize.ts";
import type { SchemaRegistry } from "../schema/registry.ts";
import { assetTypeTag, type BinaryAssetTypeDef } from "./assetType.ts";

export const ASSET_META_SCHEMA = "forge.assetMeta/1";
export const META_SUFFIX = ".meta.json";

/**
 * One SPDX licence id (`CC0-1.0`, `CC-BY-4.0`, `MIT`) or a project licence
 * written as `LicenseRef-<name>`. "Unknown" and "NOASSERTION" say nothing
 * and are refused: the lesson of D16 is 810 assets marked Unknown.
 */
export const LICENSE_PATTERN =
  "^(?!(?:[Uu][Nn][Kk][Nn][Oo][Ww][Nn]|NOASSERTION)$)[A-Za-z0-9][A-Za-z0-9.+-]*$";

export const AssetMetaFields = {
  license: text({
    required: true,
    pattern: LICENSE_PATTERN,
    hint: "SPDX lisans kimliği (CC0-1.0, CC-BY-4.0, MIT) ya da LicenseRef-<ad> biçiminde proje lisansı. Unknown kabul edilmez.",
  }),
  source: object(
    {
      origin: text({
        required: true,
        hint: "Asset'in geldiği yer: paket ya da site adı, 'authored' ya da 'ai-generated'.",
      }),
      author: text({ hint: "Yazar ya da stüdyo. CC-BY lisansında atıf için gerekir." }),
      url: text({ pattern: "^https?://\\S+$", label: "URL", hint: "Kaynağın adresi." }),
    },
    { hint: "Asset'in kökeni." },
  ),
};

export type AssetProvenance = FieldValues<typeof AssetMetaFields>;

export interface AssetMetaDoc extends AssetProvenance {
  schema: typeof ASSET_META_SCHEMA;
  id: AssetId;
  /** `<asset type>@<import settings version>`, e.g. `forge.texture@1`. */
  type: string;
  /** The type's import settings. */
  import: JsonObject;
}

export interface AssetMetaNormalizeOptions extends NormalizeOptions {
  readonly registry: SchemaRegistry;
}

const META_KEYS = ["schema", "id", "type", "license", "source", "import"];

/** `meshes/car.glb` -> `meshes/car.glb.meta.json`. */
export function metaPathOf(assetPath: string): string {
  return `${assetPath}${META_SUFFIX}`;
}

/** `meshes/car.glb.meta.json` -> `meshes/car.glb`; null for a path that is not a meta file. */
export function assetPathOfMeta(metaPath: string): string | null {
  if (!metaPath.endsWith(META_SUFFIX) || metaPath.length === META_SUFFIX.length) return null;
  return metaPath.slice(0, -META_SUFFIX.length);
}

/** Null when the file cannot be read as a meta file at all. */
export function normalizeAssetMeta(
  raw: unknown,
  options: AssetMetaNormalizeOptions,
): NormalizeResult<AssetMetaDoc | null> {
  const ctx = createContext(options);
  if (!isJsonObject(raw)) {
    reportFatal(ctx, "invalid-document", "", "An asset meta file must be a JSON object.");
    return finish(ctx, null);
  }
  if (raw.schema !== ASSET_META_SCHEMA) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${ASSET_META_SCHEMA}".`);
    return finish(ctx, null);
  }
  if (!isId(raw.id, "asset")) {
    reportFatal(ctx, "invalid-document", "id", "An asset meta file needs an asset id.");
    return finish(ctx, null);
  }

  const { type, settings } = normalizeTypeAndImport(raw.type, raw.import, ctx, options.registry);
  const value: AssetMetaDoc = {
    schema: ASSET_META_SCHEMA,
    id: raw.id,
    type,
    license: normalizeValue(AssetMetaFields.license, raw.license, "license", ctx) as string,
    source: normalizeValue(AssetMetaFields.source, raw.source, "source", ctx) as AssetProvenance["source"],
    import: settings,
  };
  for (const key of Object.keys(raw)) {
    if (!META_KEYS.includes(key)) {
      reportLoss(ctx, "unknown-field", key, "An asset meta file has no such field; dropped.");
    }
  }
  return finish(ctx, value);
}

/** The binary type a meta file's `type` tag names, if it is registered. */
export function metaTypeOf(registry: SchemaRegistry, meta: AssetMetaDoc): BinaryAssetTypeDef | undefined {
  const tag = parseComponentTypeTag(meta.type);
  const def = tag ? registry.getAssetType(tag.name) : undefined;
  return def?.storage === "binary" ? def : undefined;
}

/** Import settings stay as written when there is no type to check them against. */
function unchecked(raw: unknown, ctx: NormalizeContext): JsonObject {
  if (raw === undefined) return {};
  if (isJsonObject(raw)) return structuredClone(raw);
  reportLoss(ctx, "invalid-value", "import", "Expected an object of import settings; none kept.");
  return {};
}

function normalizeTypeAndImport(
  rawType: unknown,
  rawImport: unknown,
  ctx: NormalizeContext,
  registry: SchemaRegistry,
): { type: string; settings: JsonObject } {
  if (rawType === undefined) {
    reportLoss(ctx, "missing-required", "type", "An asset needs a type.");
    return { type: "", settings: unchecked(rawImport, ctx) };
  }
  const tag = parseComponentTypeTag(rawType);
  if (!tag) {
    reportLoss(ctx, "invalid-value", "type", 'Expected a "<asset type>@<version>" tag.');
    return { type: typeof rawType === "string" ? rawType : "", settings: unchecked(rawImport, ctx) };
  }
  const written = rawType as string;
  const def = registry.getAssetType(tag.name);
  if (!def) {
    reportLoss(ctx, "unknown-asset-type", "type", `No asset type "${tag.name}" is registered.`);
    return { type: written, settings: unchecked(rawImport, ctx) };
  }
  if (def.storage !== "binary") {
    reportLoss(ctx, "unknown-asset-type", "type", `"${def.name}" is a document type; it has no meta file.`);
    return { type: written, settings: unchecked(rawImport, ctx) };
  }
  if (tag.version > def.version) {
    reportLoss(
      ctx,
      "unsupported-version",
      "type",
      `Version ${tag.version} of ${def.name} is newer than this build (${def.version}).`,
    );
    return { type: written, settings: unchecked(rawImport, ctx) };
  }

  let source: unknown = rawImport ?? {};
  if (!isJsonObject(source)) {
    reportLoss(ctx, "invalid-value", "import", "Expected an object of import settings; defaults used.");
    source = {};
  }
  let data = source as JsonObject;
  if (tag.version < def.version) {
    const outcome = runMigrations(def.migrations, tag.version, def.version, data);
    if (!outcome.ok) {
      reportLoss(ctx, "migration-failed", "import", `${def.name}: ${outcome.reason}.`);
      return { type: written, settings: unchecked(rawImport, ctx) };
    }
    data = outcome.data;
  }
  return { type: assetTypeTag(def), settings: normalizeFieldMap(def.importFields, data, "import", ctx) };
}

/**
 * A new meta file for an asset being brought in. Normalised like a loaded
 * one, so a missing licence or source shows up in the issues. `settings` are
 * the import settings it is brought in with (the rest take defaults).
 */
export function createAssetMeta(
  type: BinaryAssetTypeDef,
  provenance: { readonly license: string; readonly source: Partial<AssetProvenance["source"]> },
  options: AssetMetaNormalizeOptions,
  id: AssetId = createId("asset"),
  settings: JsonObject = {},
): NormalizeResult<AssetMetaDoc | null> {
  return normalizeAssetMeta(
    { schema: ASSET_META_SCHEMA, id, type: assetTypeTag(type), ...provenance, import: settings },
    options,
  );
}
