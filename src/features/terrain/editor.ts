// The terrain feature in the editor: Forge's Outliner icon and type group.
import { defineFeatureEditor } from "../../editor-sdk/index.ts";

export default defineFeatureEditor({
  feature: "forge.terrain",
  components: { "forge.terrain": { icon: "terrain", outliner: "terrain" } },
});
