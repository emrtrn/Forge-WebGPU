import { normalizeJsonAsset } from "../../core/index.ts";
import type { AssetPreviewRegistration } from "../../render/editor/assetPreview.ts";
import { createFamilyPreview } from "../../render/editor/familyPreview.ts";
import { createFamilySheetPreview, type FamilySheetReaders } from "../../render/editor/familySheetPreview.ts";
import { createRecipePreview } from "../../render/editor/recipePreview.ts";
import type { FoliageTypeFieldsRead } from "../../render/foliage/foliageTypeDraw.ts";
import type { PlantFamilyFieldsRead } from "../../render/plant/plantFamilies.ts";
import { FoliageTypeAssetType } from "../foliage/schema.ts";
import { PlantFamilyAssetType } from "./schema.ts";

const readers: FamilySheetReaders = {
  family: (raw) => (normalizeJsonAsset(PlantFamilyAssetType, raw, { strict: false }).value as unknown as PlantFamilyFieldsRead | null) ?? null,
  foliageType: (raw: unknown) => (normalizeJsonAsset(FoliageTypeAssetType, raw, { strict: false }).value as unknown as FoliageTypeFieldsRead | null) ?? null,
};

export const assetPreviews: readonly AssetPreviewRegistration[] = [
  { key: "forge.treeRecipe", create: (ctx) => createRecipePreview(ctx, "tree") },
  { key: "forge.grassRecipe", create: (ctx) => createRecipePreview(ctx, "grass") },
  { key: "forge.plantFamily", create: (ctx) => createFamilyPreview(ctx, readers) },
  { key: "forge.familySheet", create: (ctx) => createFamilySheetPreview(ctx, readers) },
];
