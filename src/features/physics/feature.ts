import { defineFeature } from "../../core/index.ts";
import { WorldPhysicsSubsystem } from "./runtime.ts";
import { BlockingVolume, Collider, CollisionState } from "./schema.ts";

export default defineFeature({
  id: "forge.physics",
  components: [Collider, BlockingVolume],
  saveStates: [CollisionState],
  subsystems: [WorldPhysicsSubsystem],
});
