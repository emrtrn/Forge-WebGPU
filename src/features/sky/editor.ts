// The sky feature in the editor: Forge's Outliner icons and type group, and
// its Add Actor entries (one per level: clicked, not dragged).
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { SkyAtmosphere, SkyLight } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.sky",
  components: {
    "forge.skyAtmosphere": { icon: "atmosphere", outliner: "environment" },
    "forge.skyLight": { icon: "light", outliner: "environment" },
  },
  addActor: [
    { key: "forge.sky:atmosphere", label: "Sky Atmosphere", category: "Visual Effects", icon: "atmosphere", components: { sky: { type: componentTypeTag(SkyAtmosphere) } } },
    { key: "forge.sky:light", label: "Sky Light", category: "Visual Effects", icon: "light", components: { skyLight: { type: componentTypeTag(SkyLight) } } },
  ],
});
