// The post process feature in the editor: Forge's Outliner icon and type group.
import { defineFeatureEditor } from "../../editor-sdk/index.ts";

export default defineFeatureEditor({
  feature: "forge.postProcess",
  components: { "forge.postProcess": { icon: "postprocess", outliner: "environment" } },
});
