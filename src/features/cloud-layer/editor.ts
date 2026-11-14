// The cloud layer feature in the editor: Forge's Outliner icon and type group,
// and its Add Actor entry (one per level: clicked, not dragged).
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { CloudLayer } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.cloudLayer",
  components: { "forge.cloudLayer": { icon: "cloud", outliner: "environment" } },
  addActor: [{ key: "forge.cloudLayer", label: "Cloud Layer", category: "Visual Effects", icon: "cloud", components: { clouds: { type: componentTypeTag(CloudLayer) } } }],
});
