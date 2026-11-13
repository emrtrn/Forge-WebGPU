import { defineFeature } from "../../core/index.ts";
import { SkyAtmosphere, SkyLight } from "./schema.ts";

export default defineFeature({
  id: "forge.sky",
  components: [SkyAtmosphere, SkyLight],
});
