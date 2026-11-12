import { defineFeature } from "../../core/index.ts";
import { StaticMesh } from "./schema.ts";

export default defineFeature({
  id: "forge.staticMesh",
  components: [StaticMesh],
});
