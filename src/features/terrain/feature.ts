import { defineFeature } from "../../core/index.ts";
import { LandscapeAutoPaint, Terrain } from "./schema.ts";
import { TerrainResidencySubsystem } from "./runtime.ts";

export default defineFeature({
  id: "forge.terrain",
  components: [Terrain, LandscapeAutoPaint],
  subsystems: [TerrainResidencySubsystem],
});
