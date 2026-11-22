import type { AssetPreviewRegistration } from "../../render/editor/assetPreview.ts";
import { createTreePreview } from "../../render/editor/treePreview.ts";

export const assetPreviews: readonly AssetPreviewRegistration[] = [
  { key: "forge.treeRecipe", create: createTreePreview },
  { key: "forge.grassRecipe", create: ctx => createTreePreview(ctx, true) },
];
