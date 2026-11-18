import { defineFeature } from "../../core/index.ts";
import { Plant, PlantFamilyAssetType, TreeRecipeAssetType } from "./schema.ts";

export default defineFeature({
  id: "forge.plant",
  components: [Plant],
  assetTypes: [PlantFamilyAssetType, TreeRecipeAssetType],
});
