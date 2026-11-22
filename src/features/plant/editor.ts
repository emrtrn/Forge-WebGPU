import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { FORGE_REQUEST_HEADER } from "../../core/index.ts";

export default defineFeatureEditor({
  feature: "forge.plant",
  assetEditors: ["forge.treeRecipe", "forge.grassRecipe"].map(assetType => ({
    assetType, preview: assetType, handledFields: assetType === "forge.treeRecipe" ? ["generatorVersion"] : [],
    publish: {
      label: "Generate & Save Family",
      async run(path, base, document) {
        const response = await fetch("/__forge/tree-bake", {
          method: "POST", headers: { "Content-Type": "application/json", [FORGE_REQUEST_HEADER]: "1" },
          body: JSON.stringify({ path, base, document }),
        });
        const result = await response.json();
        if (result.status === "saved" || result.status === "conflict" || result.status === "rejected") return result;
        return { status: "rejected", reason: "generation", message: result.message ?? "Plant generation failed." };
      },
    },
  })),
});
