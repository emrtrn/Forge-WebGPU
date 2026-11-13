import { defineFeature } from "../../core/index.ts";
import { WorldEnvironmentSubsystem } from "./runtime.ts";
import { WorldEnvironment } from "./schema.ts";

export default defineFeature({
  id: "forge.worldEnvironment",
  components: [WorldEnvironment],
  subsystems: [WorldEnvironmentSubsystem],
});
