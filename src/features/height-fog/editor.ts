// The height fog feature in the editor: Forge's Outliner icon and type group.
import { defineFeatureEditor } from "../../editor-sdk/index.ts";

export default defineFeatureEditor({
  feature: "forge.heightFog",
  components: { "forge.heightFog": { icon: "atmosphere", outliner: "environment" } },
});
