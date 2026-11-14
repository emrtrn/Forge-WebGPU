import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { createModelTools } from "../../editor/assets/modelTools.ts";
export default defineFeatureEditor({ feature: "forge.model", assetEditors: [{ assetType: "forge.model", preview: "forge.model", handledFields: ["import.materials", "import.vertexColors"], tools: createModelTools }] });
