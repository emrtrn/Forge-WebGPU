import { defineFeature } from "../../core/index.ts";
import { Terrain } from "./schema.ts";

export default defineFeature({
  id: "forge.terrain",
  components: [Terrain],
});
