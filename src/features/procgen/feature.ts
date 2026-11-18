import { defineFeature } from "../../core/index.ts";
import { RockRecipeAssetType } from "./schema.ts";

export default defineFeature({
  id: "forge.procgen",
  assetTypes: [RockRecipeAssetType],
});
