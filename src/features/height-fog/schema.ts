// Exponential Height Fog: component schema.
//
// Fields, defaults and ranges are carried over from Forge WebGL
// (`engine/scene/heightFog.ts` and its Details panel). Values are stored in
// their real units; Forge's Details showed density x1000 and height falloff
// x100, which is a presentation matter and not part of the schema.

import { color, defineComponent, enumOf, num, type ComponentData } from "../../core/index.ts";

export const HeightFog = defineComponent(
  "forge.heightFog",
  1,
  {
    mode: enumOf(["exp", "linear"], {
      default: "exp",
      labels: { exp: "Exponential", linear: "Linear" },
      hint: "Sis eğrisi. Exponential yoğunlukla, Linear başlangıç ve bitiş mesafesiyle çalışır.",
    }),
    color: color({
      default: "#bcc6d1",
      hint: "Sisin rengi.",
    }),
    density: num({
      min: 0,
      max: 10,
      default: 0.03,
      step: 0.000001,
      slider: [0, 0.002],
      hint: "Sisin yoğunluğu (Exponential). Kaydırıcı 0 - 0,002 arasındadır; daha yüksek değer kutuya yazılır.",
    }),
    heightFalloff: num({
      min: 0,
      max: 0.01,
      default: 0,
      step: 0.0001,
      hint: "Yükseldikçe sisin ne kadar hızlı seyreldiği. 0 yükseklik etkisini kapatır.",
    }),
    baseHeight: num({
      min: -100000,
      max: 100000,
      default: 0,
      step: 1,
      label: "Base Height (m)",
      hint: "Yükseklik etkisinin ölçüldüğü taban yüksekliği, metre.",
    }),
    startDistance: num({
      min: 0,
      max: 100000,
      default: 0,
      step: 1,
      label: "Clear Distance (m)",
      hint: "Kameradan bu mesafeye kadar sis uygulanmaz, metre.",
    }),
    maxOpacity: num({
      min: 0,
      max: 1,
      default: 1,
      step: 0.01,
      label: "Maximum Opacity",
      hint: "Sisin ulaşabileceği en yüksek opaklık.",
    }),
    sunColor: color({
      default: "#ffe2bd",
      label: "Sun Tint",
      hint: "Güneş yönünde sise karışan renk.",
    }),
    sunStrength: num({
      min: 0,
      max: 1,
      default: 0,
      step: 0.01,
      label: "Sun Tint Strength",
      hint: "Güneş renginin sise ne kadar karışacağı. 0 kapatır.",
    }),
    start: num({
      min: 0,
      default: 5,
      step: 1,
      hint: "Sisin başladığı mesafe (Linear), metre.",
    }),
    end: num({
      min: 0,
      default: 60,
      step: 1,
      hint: "Sisin tam yoğunluğa ulaştığı mesafe (Linear), metre.",
    }),
  },
  {
    label: "Exponential Height Fog",
    hint: "Mesafeye ve yüksekliğe bağlı atmosfer sisi. Level başına bir tane olur.",
    singleton: true,
  },
);

export type HeightFogData = ComponentData<typeof HeightFog>;
