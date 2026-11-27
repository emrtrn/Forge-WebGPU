import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { NavigationVolume } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.navigation",
  components: { "forge.navigationVolume": { icon: "volume", outliner: "volume" } },
  addActor: [{
    key: NavigationVolume.name, label: "Navigation Volume", category: "Volumes", icon: "volume",
    lift: 4, components: { volume: { type: componentTypeTag(NavigationVolume) } },
  }],
});
