// The post process feature in the editor: Forge's Outliner icon and type
// group, and its Add Actor entry (one per level: clicked, not dragged).
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { PostProcess } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.postProcess",
  components: { "forge.postProcess": { icon: "postprocess", outliner: "environment" } },
  addActor: [{ key: "forge.postProcess", label: "Post Process", category: "Visual Effects", icon: "postprocess", components: { post: { type: componentTypeTag(PostProcess) } } }],
});
