import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { publishRecipe } from "../plant/publish.ts";

export default defineFeatureEditor({
  feature: "forge.procgen",
  assetEditors: [{
    assetType: "forge.rockRecipe", preview: "forge.rockRecipe", handledFields: ["generatorVersion"],
    publish: { label: "Generate & Save Models", run: publishRecipe },
  }],
});
