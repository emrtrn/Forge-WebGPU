import { createAssetPreview, type AssetPreviewRegistration } from "../../render/editor/assetPreview.ts";
export const assetPreviews: readonly AssetPreviewRegistration[] = [{ key: "forge.material", create: (context) => createAssetPreview(context, "material") }];
