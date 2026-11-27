import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { BlockingVolume } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.physics",
  components: { "forge.blockingVolume": { icon: "volume", outliner: "volume" } },
  addActor: [{
    key: "forge.blockingVolume",
    label: "Blocking Volume",
    category: "Volumes",
    icon: "volume",
    components: { volume: { type: componentTypeTag(BlockingVolume) } },
    lift: 0.5,
  }],
});
