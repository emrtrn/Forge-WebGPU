// Post Process: component schema (plan phase 3 step 6, architecture §4.9).
//
// Forge WebGL's global Post Process singleton (engine/scene/postProcess.ts and
// its Details panel): exposure and tone mapping, anti-aliasing, bloom, colour
// grading (saturation, contrast, white balance), vignette, depth of field,
// ambient occlusion, chromatic aberration and film grain. Defaults and ranges
// are Forge's; the groups keep Forge's shape. Two WebGPU choices join them:
// `antialias` gains TRAA (`none | traa | smaa`) and `reflection` picks
// screen-space reflections (`off | ssr`, user decision 2026-11-11).
//
// A level authors effects; the quality profile only allows them (phase 3
// decision 3, Forge's principle #2): `applyQualityToPostProcess` turns an
// authored effect off where the profile does not allow it, never on.
// Ambient occlusion is GTAO, or SSGI where the profile allows it (Cinematic;
// SSGI's occlusion takes GTAO's place, user decision 2026-11-13). The renderer
// maps the 1-based authored values onto its passes.
//
// Exposure: while a level has a Post Process its tone mapper and exposure
// (x 0.2, Forge's scale) present the frame, the sky's included; the Sky
// Atmosphere's own exposure then scales the sky dome against the scene
// (user decision 2026-11-13).

import { bool, defineComponent, enumOf, num, object, type ComponentData } from "../../core/index.ts";

export const TONE_MAPPINGS = ["aces", "neutral", "none"] as const;
export const ANTIALIAS_MODES = ["none", "traa", "smaa"] as const;
export const REFLECTION_MODES = ["off", "ssr"] as const;

const enabled = (hint: string) => bool({ default: false, hint });
const amount = (min: number, max: number, fallback: number, hint: string, label?: string) =>
  num({ min, max, default: fallback, step: 0.05, hint, ...(label ? { label } : {}) });

export const PostProcess = defineComponent(
  "forge.postProcess",
  1,
  {
    exposure: amount(0, 4, 1, "Sahnenin pozlaması (1 Forge'un varsayılanı). Post Process varken gökyüzü dahil bütün karenin ton eşleme pozlaması budur."),
    toneMapping: enumOf(TONE_MAPPINGS, {
      default: "aces",
      label: "Tonemapper",
      labels: { aces: "ACES Filmic", neutral: "Neutral", none: "None" },
      hint: "HDR görüntüyü ekrana sığdıran ton eşleme eğrisi. None ton eşlemesiz çizer.",
    }),
    antialias: enumOf(ANTIALIAS_MODES, {
      default: "none",
      label: "Anti-aliasing",
      labels: { none: "None", traa: "TRAA", smaa: "SMAA" },
      hint: "Kenar yumuşatma: TRAA zamansal (hareketsiz sahnede en temiz), SMAA kare içi. Kalite profili izin vermezse kapanır.",
    }),
    reflection: enumOf(REFLECTION_MODES, {
      default: "off",
      labels: { off: "Off", ssr: "SSR" },
      hint: "Ekran uzayı yansımaları (SSR). Kalite profili çözünürlüğünü seçer ya da kapatır.",
    }),
    bloom: object(
      {
        enabled: enabled("Parlak bölgelerin çevresine ışık taşmasını açar."),
        threshold: amount(0, 2, 1, "Parlamanın başladığı parlaklık eşiği."),
        intensity: amount(0, 5, 1, "Parlamanın gücü (1 güneşin standart parlaması)."),
        radius: amount(0, 2, 1, "Parlamanın yayılma yarıçapı."),
      },
      { hint: "Bloom: parlak yüzeylerin ve güneşin çevresinde ışık taşması." },
    ),
    saturation: amount(0, 2, 1, "Renk doygunluğu: 0 gri, 1 değişmez, 2 çok doygun."),
    contrast: amount(0, 2, 1, "Karşıtlık: 1 değişmez."),
    temperature: amount(-1, 1, 0, "Beyaz dengesi sıcaklığı: artı ısıtır, eksi soğutur, 0 nötr."),
    tint: amount(-1, 1, 0, "Beyaz dengesi tonu: artı macentaya, eksi yeşile kaydırır, 0 nötr."),
    vignette: object(
      {
        enabled: enabled("Görüntünün kenarlarını karartmayı açar."),
        intensity: amount(0, 2, 0.35, "Kenar kararmasının gücü."),
        offset: amount(0, 2, 1, "Kararmanın merkezden ne kadar içeri girdiği."),
      },
      { hint: "Vignette: görüntü kenarlarının kararması." },
    ),
    dof: object(
      {
        enabled: enabled("Alan derinliğini açar: odak dışı bölgeler bulanıklaşır."),
        focusDistance: num({ min: 0, max: 100, default: 10, step: 0.5, hint: "Odak uzaklığı, metre (kameranın baktığı yönde)." }),
        aperture: amount(0, 2, 1, "Diyafram: büyük değer odak dışını daha hızlı bulanıklaştırır."),
        maxBlur: amount(0, 2, 1, "En büyük bulanıklık.", "Max Blur"),
      },
      { label: "Depth of Field", hint: "Alan derinliği (DoF)." },
    ),
    ao: object(
      {
        enabled: enabled("Ortam kapatmasını (AO) açar: köşe ve temas noktaları kararır."),
        radius: amount(0, 4, 1, "Kapatma örnekleme yarıçapı (1 yakın temas gölgesi ölçeği)."),
        intensity: amount(0, 2, 1, "Kapatmanın gücü: 1 tam."),
      },
      { label: "Ambient Occlusion", hint: "Ortam kapatması: GTAO; kalite profili izin verirse (Cinematic) yerini SSGI alır." },
    ),
    chromaticAberration: object(
      {
        enabled: enabled("Renk sapmasını açar: kırmızı ve mavi kanallar ayrışır."),
        amount: amount(0, 2, 0.5, "Kanalların ayrışma miktarı."),
      },
      { hint: "Renk sapması (chromatic aberration)." },
    ),
    grain: object(
      {
        enabled: enabled("Film greni gürültüsünü açar."),
        intensity: amount(0, 1, 0.5, "Gren gücü."),
      },
      { label: "Film Grain", hint: "Film greni." },
    ),
  },
  {
    label: "Post Process",
    hint: "Level'ın görüntü işleme ayarları: pozlama, ton eşleme, kenar yumuşatma, yansıma ve efektler. Level başına bir tane olur; kalite profili efektleri yalnız kapatabilir.",
    singleton: true,
  },
);

export type PostProcessData = ComponentData<typeof PostProcess>;
