import { createAssetPreview, type AssetPreviewRegistration } from "../../render/editor/assetPreview.ts";
export const assetPreviews: readonly AssetPreviewRegistration[] = [{ key: "forge.model", create: (context) => createAssetPreview(context, "model") }];
