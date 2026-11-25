import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { publishRecipe } from "./publish.ts";

export default defineFeatureEditor({
  feature: "forge.plant",
  assetEditors: ["forge.treeRecipe", "forge.grassRecipe"].map(assetType => ({
    assetType, preview: assetType, handledFields: assetType === "forge.treeRecipe" ? ["generatorVersion"] : [],
    publish: { label: "Generate & Save Family", run: publishRecipe },
  })),
});
