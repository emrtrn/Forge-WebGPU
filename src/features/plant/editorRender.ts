import type { AssetPreviewRegistration } from "../../render/editor/assetPreview.ts";
import { createRecipePreview } from "../../render/editor/recipePreview.ts";

export const assetPreviews: readonly AssetPreviewRegistration[] = [
  { key: "forge.treeRecipe", create: (ctx) => createRecipePreview(ctx, "tree") },
  { key: "forge.grassRecipe", create: (ctx) => createRecipePreview(ctx, "grass") },
];
