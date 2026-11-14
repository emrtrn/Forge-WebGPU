// Document adapters for the shared asset editor. All writes keep their GUID
// and use the same core normalisers as the server (no editor-only schema).
import {
  ACTOR_CLASS_SCHEMA, AssetMetaFields, formFields, isJsonAssetType, normalizeActorClass,
  normalizeAssetMeta, normalizeJsonAsset, object, text,
  type FormField, type NormalizeResult, type SchemaRegistry,
} from "../../core/index.ts";

export type AssetDocument = Record<string, unknown>;
export interface EditableAsset {
  readonly file: string;
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly writable: boolean;
}
export interface AssetDocumentAdapter {
  readonly path: string;
  readonly fields: readonly FormField[];
  readonly kind: "json" | "model" | "class";
  normalize(raw: unknown): NormalizeResult<AssetDocument | null>;
}

export function assetDocumentAdapter(asset: EditableAsset, registry: SchemaRegistry): AssetDocumentAdapter | null {
  const options = { strict: true, registry };
  if (asset.type === "forge.actorClass") return {
    path: asset.file, kind: "class",
    fields: formFields({ name: text({ default: "Actor Class", required: true }) }),
    normalize: (raw) => normalizeActorClass(raw, options) as unknown as NormalizeResult<AssetDocument | null>,
  };
  const def = registry.getAssetType(asset.type);
  if (!def) return null;
  if (isJsonAssetType(def)) return {
    path: asset.file, kind: "json", fields: formFields(def.json.fields),
    normalize: (raw) => normalizeJsonAsset(def, raw, options) as NormalizeResult<AssetDocument | null>,
  };
  if (def.storage === "binary" && def.name === "forge.model") return {
    path: `${asset.file}.meta.json`, kind: "model",
    fields: formFields({ ...AssetMetaFields, import: object(def.importFields, { label: "Import Settings" }) }),
    normalize: (raw) => normalizeAssetMeta(raw, options) as unknown as NormalizeResult<AssetDocument | null>,
  };
  return null;
}

export const isClassDocument = (doc: AssetDocument): boolean => doc.schema === ACTOR_CLASS_SCHEMA;
