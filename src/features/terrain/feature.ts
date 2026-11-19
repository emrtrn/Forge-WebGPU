import { defineFeature } from "../../core/index.ts";
import { LandscapeAutoPaint, Terrain } from "./schema.ts";

export default defineFeature({
  id: "forge.terrain",
  components: [Terrain, LandscapeAutoPaint],
});
