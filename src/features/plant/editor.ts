import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { createFamilySheetTools } from "../../editor/assets/familySheetTools.ts";
import { publishRecipe } from "./publish.ts";

export default defineFeatureEditor({
  feature: "forge.plant",
  assetEditors: [{
    // Its prototypes are the generator's; the response is what a person edits here.
    assetType: "forge.plantFamily", preview: "forge.plantFamily", handledFields: ["generatorVersion", "prototypes"],
  }, {
    assetType: "forge.familySheet", preview: "forge.familySheet", handledFields: ["entries"], tools: (context) => createFamilySheetTools(context),
  }, ...["forge.treeRecipe", "forge.grassRecipe"].map(assetType => ({
    assetType, preview: assetType, handledFields: assetType === "forge.treeRecipe" ? ["generatorVersion"] : [],
    publish: { label: "Generate & Save Family", run: publishRecipe },
  }))],
});
