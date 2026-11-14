// The light feature in the editor: Forge's Outliner icon and type group.
import { defineFeatureEditor } from "../../editor-sdk/index.ts";

const light = { icon: "light", outliner: "light" } as const;

export default defineFeatureEditor({
  feature: "forge.light",
  components: { "forge.directionalLight": light, "forge.pointLight": light, "forge.spotLight": light },
});
