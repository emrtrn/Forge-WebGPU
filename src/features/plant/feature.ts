import { defineFeature } from "../../core/index.ts";
import { FamilySheetAssetType, GrassRecipeAssetType, Plant, PlantFamilyAssetType, TreeRecipeAssetType } from "./schema.ts";

export default defineFeature({
  id: "forge.plant",
  components: [Plant],
  assetTypes: [PlantFamilyAssetType, TreeRecipeAssetType, GrassRecipeAssetType, FamilySheetAssetType],
});
