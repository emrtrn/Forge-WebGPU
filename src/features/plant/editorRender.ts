import { normalizeJsonAsset } from "../../core/index.ts";
import type { AssetPreviewRegistration } from "../../render/editor/assetPreview.ts";
import { createFamilyPreview } from "../../render/editor/familyPreview.ts";
import { createRecipePreview } from "../../render/editor/recipePreview.ts";
import type { FoliageTypeFieldsRead } from "../../render/foliage/foliageTypeDraw.ts";
import { FoliageTypeAssetType } from "../foliage/schema.ts";

const readers = {
  foliageType: (raw: unknown) => (normalizeJsonAsset(FoliageTypeAssetType, raw, { strict: false }).value as unknown as FoliageTypeFieldsRead | null) ?? null,
};

export const assetPreviews: readonly AssetPreviewRegistration[] = [
  { key: "forge.treeRecipe", create: (ctx) => createRecipePreview(ctx, "tree") },
  { key: "forge.grassRecipe", create: (ctx) => createRecipePreview(ctx, "grass") },
  { key: "forge.plantFamily", create: (ctx) => createFamilyPreview(ctx, readers) },
];
