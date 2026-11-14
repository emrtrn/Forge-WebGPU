// The static mesh feature in the editor: Forge's Outliner icon and type group.
import { defineFeatureEditor } from "../../editor-sdk/index.ts";

export default defineFeatureEditor({
  feature: "forge.staticMesh",
  components: { "forge.staticMesh": { icon: "mesh", outliner: "mesh" } },
});
