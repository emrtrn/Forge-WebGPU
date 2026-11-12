import { defineFeature } from "../../core/index.ts";
import { ModelAssetType } from "./schema.ts";

export default defineFeature({
  id: "forge.model",
  assetTypes: [ModelAssetType],
});
