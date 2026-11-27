import { assetRef, bool, defineComponent, num, text } from "../../core/index.ts";

export const SkeletalMesh = defineComponent("forge.skeletalMesh", 1, {
  model: assetRef({ assetType: "forge.model", hint: "İskelet ve klipleri olan GLB modeli." }),
  clip: text({ hint: "Açılışta oynatılan animasyon klibi." }),
  speed: num({ default: 1, min: 0, max: 8, hint: "Animasyon hızı." }),
  loop: bool({ default: true }),
  castShadow: bool({ default: true }),
}, { label: "Skeletal Mesh", spatial: true });
