import { defineFeature } from "../../core/index.ts";
import { WorldPhysicsSubsystem } from "./runtime.ts";
import { BlockingVolume, Collider } from "./schema.ts";

export default defineFeature({
  id: "forge.physics",
  components: [Collider, BlockingVolume],
  subsystems: [WorldPhysicsSubsystem],
});
