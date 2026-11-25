import type { AssetPreviewRegistration } from "../../render/editor/assetPreview.ts";
import { createRecipePreview } from "../../render/editor/recipePreview.ts";

export const assetPreviews: readonly AssetPreviewRegistration[] = [
  { key: "forge.rockRecipe", create: (ctx) => createRecipePreview(ctx, "rock") },
];
