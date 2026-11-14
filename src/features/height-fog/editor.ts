// The height fog feature in the editor: Forge's Outliner icon and type group,
// and its Add Actor entry (one per level: clicked, not dragged).
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { HeightFog } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.heightFog",
  components: { "forge.heightFog": { icon: "atmosphere", outliner: "environment" } },
  addActor: [{ key: "forge.heightFog", label: "Exponential Height Fog", category: "Visual Effects", icon: "cloud", components: { fog: { type: componentTypeTag(HeightFog) } } }],
});
