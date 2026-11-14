// The sky feature in the editor: Forge's Outliner icons and type group.
import { defineFeatureEditor } from "../../editor-sdk/index.ts";

export default defineFeatureEditor({
  feature: "forge.sky",
  components: {
    "forge.skyAtmosphere": { icon: "atmosphere", outliner: "environment" },
    "forge.skyLight": { icon: "light", outliner: "environment" },
  },
});
