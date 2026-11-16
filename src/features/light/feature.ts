import { defineFeature } from "../../core/index.ts";
import { DirectionalLight, PointLight, ShadowSettings, SpotLight } from "./schema.ts";

export default defineFeature({
  id: "forge.light",
  components: [DirectionalLight, PointLight, SpotLight, ShadowSettings],
});
