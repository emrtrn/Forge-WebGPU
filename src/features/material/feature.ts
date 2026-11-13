import { defineFeature } from "../../core/index.ts";
import { MaterialAssetType } from "./schema.ts";

export default defineFeature({
  id: "forge.material",
  assetTypes: [MaterialAssetType],
});
