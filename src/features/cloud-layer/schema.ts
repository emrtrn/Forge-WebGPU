// Cloud Layer: component schema (plan phase 3 step 5, architecture §4.9).
//
// Forge WebGL's static Cloud Layer (engine/scene/cloudLayer.ts and its Details
// panel): a camera-following dome painted by procedural fBm noise, no
// raymarching and no textures; not volumetric. Defaults and ranges are
// Forge's. `speed` is the drift ("Wind" in Forge's Details); 0 keeps the
// clouds still.

import { color, defineComponent, num, type ComponentData } from "../../core/index.ts";

export const CloudLayer = defineComponent(
  "forge.cloudLayer",
  1,
  {
    color: color({
      default: "#ffffff",
      hint: "Bulutların rengi.",
    }),
    coverage: num({
      min: 0,
      max: 1,
      default: 0.5,
      step: 0.05,
      hint: "Gökyüzünün bulutla kaplanan oranı: 0 açık, 1 kapalı.",
    }),
    density: num({
      min: 0,
      max: 1,
      default: 0.85,
      step: 0.05,
      hint: "Bulutların opaklığı: 0 görünmez, 1 tam.",
    }),
    softness: num({
      min: 0,
      max: 1,
      default: 0.3,
      step: 0.05,
      hint: "Bulut kenarlarının yumuşaklığı: 0 keskin, 1 çok yumuşak.",
    }),
    scale: num({
      min: 0.1,
      max: 20,
      default: 2,
      step: 0.25,
      hint: "Gürültünün ölçeği: büyük değer daha küçük, sık bulut kümeleri verir.",
    }),
    speed: num({
      min: 0,
      max: 5,
      default: 0,
      step: 0.05,
      label: "Wind",
      hint: "Bulutların sürüklenme hızı. 0 bulutları sabit tutar.",
    }),
  },
  {
    label: "Cloud Layer",
    hint: "Statik, prosedürel bulut kubbesi (hacimsel değil). Level başına bir tane olur.",
    singleton: true,
  },
);

export type CloudLayerData = ComponentData<typeof CloudLayer>;
