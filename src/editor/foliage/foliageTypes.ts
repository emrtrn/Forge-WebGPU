// Foliage Types as the Foliage tools read them (plan 5d step 6): generation's
// and painting's fields and the model's box. The type the Foliage tab has open
// is read from its draft, so painting follows an edit before it is saved; the
// others from their files, kept until the file's editor says otherwise.

import { normalizeJsonAsset, isJsonAssetType, type AssetId, type SaveClient, type SchemaRegistry } from "../../core/index.ts";
import { foliageTypeParamsOf, type FoliageTypeAssetFields } from "../../engine/foliage/foliageAsset.ts";
import type { ModelBoundsReader } from "../../render/editor/modelBounds.ts";
import type { EditableAsset } from "../assets/assetDocument.ts";
import type { FoliageTypeInfo } from "./foliageTool.ts";

type TypeFields = FoliageTypeAssetFields & { readonly mesh: string | null; readonly radius: number; readonly density: number };

export interface FoliageTypesOptions {
  readonly client: Pick<SaveClient, "read">;
  readonly registry: SchemaRegistry;
  lookup(guid: string): EditableAsset | null;
  /** The tab's open draft of a type; null when it is not open. */
  draft(guid: string): Record<string, unknown> | null;
  readonly modelBounds: ModelBoundsReader;
}

export interface FoliageTypes {
  info(type: AssetId): Promise<FoliageTypeInfo | null>;
  /** A type's file changed: it is read again. */
  forget(type: string): void;
}

export function createFoliageTypes(options: FoliageTypesOptions): FoliageTypes {
  const files = new Map<string, Promise<TypeFields | null>>();
  const read = async (guid: string): Promise<TypeFields | null> => {
    const asset = options.lookup(guid);
    const def = asset ? options.registry.getAssetType(asset.type) : undefined;
    if (!asset || !def || !isJsonAssetType(def)) return null;
    const file = await options.client.read(asset.file);
    if (!file) return null;
    return (normalizeJsonAsset(def, JSON.parse(file.text), { strict: false }).value as unknown as TypeFields | null) ?? null;
  };
  const fieldsOf = (guid: string): Promise<TypeFields | null> => {
    const draft = options.draft(guid);
    if (draft) return Promise.resolve(draft as unknown as TypeFields);
    let known = files.get(guid);
    if (!known) files.set(guid, (known = read(guid).catch(() => null)));
    return known;
  };
  return {
    async info(type) {
      const fields = await fieldsOf(type);
      if (!fields) return null;
      return {
        params: { ...foliageTypeParamsOf(fields), radius: fields.radius, density: fields.density },
        box: fields.mesh ? await options.modelBounds(fields.mesh) : null,
      };
    },
    forget: (type) => void files.delete(type),
  };
}
