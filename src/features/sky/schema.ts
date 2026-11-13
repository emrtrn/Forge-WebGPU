// Sky: component schemas (plan phase 3 step 5, architecture §4.9).
//
// Two singletons, one feature, because the Sky Light captures the sky:
// - `forge.skyAtmosphere`: the scattering sky dome (Forge WebGL's Sky
//   Atmosphere, engine/scene/skyAtmosphere.ts and its Details panel; three's
//   Preetham sky). The sun is not stored here: the sky follows the sun light
//   (`atmosphereSun`), or the World Environment's clock. `exposure` is the
//   authored 1-based multiplier; the renderer scales it by Forge's 0.2
//   (render/pipeline/output.ts).
// - `forge.skyLight`: the level's ambient lighting and backdrop (user
//   decision 2026-11-13, phase 3 decision 7): the sky captured into a
//   prefiltered environment map (PMREM) for image-based reflections and
//   ambient bounce (Forge's `skyAtmosphere.skyLightCapture` and the older
//   `reflection` actor), a flat ambient light, and the background colour seen
//   where no sky is drawn (Forge's `worldSettings.backgroundColor`,
//   `ambientColor`, `ambientIntensity`). A level without one draws Forge's
//   world settings defaults: background #d7d7c7, no ambient light, no
//   environment map. Sphere reflection captures are not ported (INV-D12).

import { color, defineComponent, num, type ComponentData } from "../../core/index.ts";

export const SkyAtmosphere = defineComponent(
  "forge.skyAtmosphere",
  1,
  {
    rayleigh: num({
      min: 0,
      max: 6,
      default: 2,
      step: 0.1,
      hint: "Rayleigh saçılımının gücü: gökyüzünün maviliği.",
    }),
    turbidity: num({
      min: 1,
      max: 20,
      default: 10,
      step: 0.5,
      hint: "Havanın bulanıklığı (pus). Yüksek değer daha soluk, beyazımsı bir gökyüzü verir.",
    }),
    mie: num({
      min: 0,
      max: 0.1,
      default: 0.005,
      step: 0.001,
      hint: "Mie saçılımı katsayısı: güneşin çevresindeki parıltı ve pus.",
    }),
    mieDirectionalG: num({
      min: 0,
      max: 0.999,
      default: 0.8,
      step: 0.01,
      label: "Mie Anisotropy",
      hint: "Güneş halesinin sıkılığı. 1'e yaklaştıkça hale küçülür ve yoğunlaşır.",
    }),
    exposure: num({
      min: 0,
      max: 4,
      default: 1,
      step: 0.05,
      hint: "Gökyüzünün parlaklığı (1 Forge'un varsayılanı). Post Process yoksa sahnenin ton eşleme pozlaması da budur; Post Process varken gökyüzünü sahneye göre ölçekler.",
    }),
  },
  {
    label: "Sky Atmosphere",
    hint: "Saçılımlı gökyüzü kubbesi. Güneşin yeri Atmosphere Sun ışığından (ya da World Environment saatinden) gelir. Level başına bir tane olur.",
    singleton: true,
  },
);

export const SkyLight = defineComponent(
  "forge.skyLight",
  1,
  {
    intensity: num({
      min: 0,
      max: 4,
      default: 1,
      step: 0.05,
      hint: "Gökyüzünden yakalanan ortam ışığı ve yansımaların gücü (PBR yüzeyler). Yalnız Sky Atmosphere varken etkilidir; 0 kapatır.",
    }),
    ambientColor: color({
      default: "#ffffff",
      hint: "Düz ortam ışığının rengi.",
    }),
    ambientIntensity: num({
      min: 0,
      max: 20,
      default: 0,
      step: 0.05,
      slider: [0, 4],
      hint: "Her yüzeyi eşit aydınlatan düz ortam ışığının gücü; gökyüzü ışığının üstüne eklenir. 0 kapatır. Kaydırıcı 0 - 4 arasındadır; daha yüksek değer kutuya yazılır.",
    }),
    backgroundColor: color({
      default: "#d7d7c7",
      hint: "Gökyüzü çizilmeyen yerde görünen arka plan rengi.",
    }),
  },
  {
    label: "Sky Light",
    hint: "Level'ın ortam aydınlatması: gökyüzünden yakalanan ışık ve yansıma, düz ortam ışığı ve gökyüzü yokken arka plan rengi. Level başına bir tane olur.",
    singleton: true,
  },
);

export type SkyAtmosphereData = ComponentData<typeof SkyAtmosphere>;
export type SkyLightData = ComponentData<typeof SkyLight>;

/** Forge's level without a Sky Light (world settings defaults, `SceneRuntimeCore`). */
export const SKY_LIGHT_ABSENT = { ambientColor: "#ffffff", ambientIntensity: 0, backgroundColor: "#d7d7c7" } as const;
