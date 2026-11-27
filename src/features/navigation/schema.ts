import { defineComponent, vec3 } from "../../core/index.ts";

export const NavigationVolume = defineComponent("forge.navigationVolume", 1, {
  size: vec3({ default: [20, 8, 20], min: 0.1, hint: "Recast gezinme hacminin yerel boyutu, metre." }),
}, { label: "Navigation Volume", spatial: true });
