import { defineFeature } from "../../core/index.ts";
import { TextureAssetType } from "./schema.ts";

export default defineFeature({
  id: "forge.texture",
  assetTypes: [TextureAssetType],
});
