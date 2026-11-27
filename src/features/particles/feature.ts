import { defineFeature } from "../../core/index.ts";
import { ParticleEffect, ParticleEmitter } from "./schema.ts";

export default defineFeature({
  id: "forge.particles",
  components: [ParticleEmitter],
  assetTypes: [ParticleEffect],
});
