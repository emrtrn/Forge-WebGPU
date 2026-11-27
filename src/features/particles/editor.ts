import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { ParticleEffect } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.particles",
  newAssets: [{ type: ParticleEffect.name, label: "Particle Effect", values: {} }],
});
