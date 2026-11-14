// The light feature in the editor: Forge's Outliner icon and type group, and
// its Add Actor entries (Forge's `createDefaultLightActor`: directional and
// spot turned -55, 35, 0 and casting shadows, every light 1,5 m above where it
// is dropped).
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { DirectionalLight, PointLight, SpotLight } from "./schema.ts";

const light = { icon: "light", outliner: "light" } as const;
const placed = { category: "Lights", icon: "light", lift: 1.5 } as const;
const turned = [-55, 35, 0] as const;

export default defineFeatureEditor({
  feature: "forge.light",
  components: { "forge.directionalLight": light, "forge.pointLight": light, "forge.spotLight": light },
  addActor: [
    { key: "forge.light:directional", label: "Directional Light", ...placed, rotation: turned, components: { light: { type: componentTypeTag(DirectionalLight) } } },
    { key: "forge.light:point", label: "Point Light", ...placed, components: { light: { type: componentTypeTag(PointLight) } } },
    { key: "forge.light:spot", label: "Spot Light", ...placed, rotation: turned, components: { light: { type: componentTypeTag(SpotLight), castShadow: true } } },
  ],
});
