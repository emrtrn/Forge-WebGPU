import { defineFeature } from "../../core/index.ts";
import { FoliageTypeAssetType, LandscapeFoliage } from "./schema.ts";

export default defineFeature({
  id: "forge.foliage",
  components: [LandscapeFoliage],
  assetTypes: [FoliageTypeAssetType],
});
