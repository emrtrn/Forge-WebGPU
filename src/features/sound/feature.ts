import { defineFeature } from "../../core/index.ts";
import { SoundAssetType } from "./schema.ts";

export default defineFeature({
  id: "forge.sound",
  assetTypes: [SoundAssetType],
});
