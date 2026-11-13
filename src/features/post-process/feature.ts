import { defineFeature } from "../../core/index.ts";
import { PostProcess } from "./schema.ts";

export default defineFeature({
  id: "forge.postProcess",
  components: [PostProcess],
});
