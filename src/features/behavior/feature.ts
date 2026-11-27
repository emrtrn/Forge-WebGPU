import { defineFeature } from "../../core/index.ts";
import { Behavior } from "./schema.ts";
import { BehaviorSubsystem } from "./runtime.ts";

export default defineFeature({
  id: "forge.behavior",
  components: [Behavior],
  subsystems: [BehaviorSubsystem],
});
