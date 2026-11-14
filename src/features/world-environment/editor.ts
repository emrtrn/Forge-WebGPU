// The World Environment feature in the editor: Forge's Outliner icon and type
// group, and its Add Actor entry (one per level: clicked, not dragged).
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { WorldEnvironment } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.worldEnvironment",
  components: { "forge.worldEnvironment": { icon: "worldEnvironment", outliner: "environment" } },
  addActor: [{ key: "forge.worldEnvironment", label: "World Environment", category: "Visual Effects", icon: "worldEnvironment", components: { environment: { type: componentTypeTag(WorldEnvironment) } } }],
});
