// Lights: component schemas (plan phase 3 step 3, architecture §4.9).
//
// One actor per light, as in Forge WebGL's `lights[]` (engine/scene/layout.ts
// `LayoutLightActor`). The actor's transform places and aims the light: a
// directional or spot light shines along its local -Z. Defaults and ranges are
// Forge's (engine/scene/lights.ts `defaultLightIntensity`,
// engine/render-three/lights.ts, the light Details panel).
//
// The sun is the directional light marked `atmosphereSun` (the first one, if a
// level marks several): the sky, the fog's sun tint and cascaded shadows follow
// it. The Forge importer marks the light Forge elected (the `sun` id, else the
// first directional light). A level with no light component at all gets the
// renderer's default sun.

import { bool, color, defineComponent, num, type ComponentData } from "../../core/index.ts";

const lightColor = () =>
  color({
    default: "#ffffff",
    hint: "Işığın rengi.",
  });

const castShadow = (on: boolean, hint: string) => bool({ default: on, label: "Cast Shadows", hint });

const decay = () =>
  num({
    min: 0,
    max: 8,
    default: 2,
    step: 0.1,
    hint: "Mesafeyle sönme üssü. 2 fiziksel olarak doğru ters kare sönümdür.",
  });

export const DirectionalLight = defineComponent(
  "forge.directionalLight",
  1,
  {
    color: lightColor(),
    intensity: num({
      min: 0,
      max: 100,
      default: 2,
      step: 0.1,
      slider: [0, 10],
      hint: "Işığın şiddeti. Kaydırıcı 0 - 10 arasındadır; daha yüksek değer kutuya yazılır.",
    }),
    castShadow: castShadow(true, "Işık gölge düşürür. Güneş ışığında gölge kalite profilinin mesafesine kadar uzanır."),
    cascadedShadows: bool({
      default: false,
      label: "Cascaded Shadows",
      hint: "Yalnız güneşte: gölge kameraya oturan kaskatlarla çizilir (sayı ve mesafe kalite profilinden). Kapalıysa kamerayı izleyen tek harita.",
    }),
    atmosphereSun: bool({
      default: false,
      label: "Atmosphere Sun",
      hint: "Bu ışık güneştir: gökyüzü, sisin güneş rengi ve kaskatlı gölge onu izler. Level başına bir tane işaretlenir.",
    }),
  },
  {
    label: "Directional Light",
    hint: "Sonsuz uzaktan paralel gelen ışık (güneş, ay). Yönü aktörün dönüşü verir; aktörün -Z ekseni boyunca parlar.",
    spatial: true,
  },
);

export const PointLight = defineComponent(
  "forge.pointLight",
  1,
  {
    color: lightColor(),
    intensity: num({
      min: 0,
      max: 1000,
      default: 2.5,
      step: 0.1,
      slider: [0, 20],
      hint: "Işığın şiddeti. Kaydırıcı 0 - 20 arasındadır; daha yüksek değer kutuya yazılır.",
    }),
    distance: num({
      min: 0,
      max: 100,
      default: 8,
      step: 0.1,
      label: "Distance (m)",
      hint: "Işığın ulaştığı en uzak mesafe, metre. 0 sınırsızdır.",
    }),
    decay: decay(),
    castShadow: castShadow(false, "Işık gölge düşürür (her yöne altı harita; pahalıdır)."),
  },
  {
    label: "Point Light",
    hint: "Bir noktadan her yöne yayılan ışık (lamba, ateş).",
    spatial: true,
  },
);

export const SpotLight = defineComponent(
  "forge.spotLight",
  1,
  {
    color: lightColor(),
    intensity: num({
      min: 0,
      max: 1000,
      default: 3,
      step: 0.1,
      slider: [0, 20],
      hint: "Işığın şiddeti. Kaydırıcı 0 - 20 arasındadır; daha yüksek değer kutuya yazılır.",
    }),
    distance: num({
      min: 0,
      max: 100,
      default: 10,
      step: 0.1,
      label: "Distance (m)",
      hint: "Işığın ulaştığı en uzak mesafe, metre. 0 sınırsızdır.",
    }),
    angle: num({
      min: 1,
      max: 90,
      default: 30,
      step: 1,
      label: "Angle (°)",
      hint: "Koninin yarı açısı, derece.",
    }),
    penumbra: num({
      min: 0,
      max: 1,
      default: 0.35,
      step: 0.05,
      hint: "Koni kenarının yumuşaklığı. 0 keskin, 1 en yumuşak.",
    }),
    decay: decay(),
    castShadow: castShadow(false, "Işık gölge düşürür."),
  },
  {
    label: "Spot Light",
    hint: "Bir noktadan koni biçiminde yayılan ışık (el feneri, far). Aktörün -Z ekseni boyunca parlar.",
    spatial: true,
  },
);

export type DirectionalLightData = ComponentData<typeof DirectionalLight>;
export type PointLightData = ComponentData<typeof PointLight>;
export type SpotLightData = ComponentData<typeof SpotLight>;
