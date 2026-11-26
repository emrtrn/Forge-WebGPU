// Material: schema-defined JSON asset type (architecture §4.6, §4.9; phase 3
// decision 5).
//
// A `*.material.json` file: Forge WebGL's `ForgeMaterialDef` fields with their
// units and ranges (engine/assets/material.ts), as a field map. Differences,
// by user decision 2026-11-13:
// - `name` is gone: an asset's name is its file name, as for every asset.
// - The groups Forge kept as null (`normalMotion`, `layerBlend`, `sway`)
//   carry an `enabled` switch; `terrainDetail` is off while it has no normal
//   map (Forge's rule). `terrainMetersPerRepeat` 0 means "off".
// - Presets (standard, textured, metal, glass, emissive, basic) are not
//   stored: they are the editor's starting values for a new material
//   (`MATERIAL_PRESETS`); `materialType` is.
// - Texture slots are `assetRef(forge.texture)`; the slot decides the colour
//   space (base colour and emissive sRGB, the rest linear), as in Forge.
// The renderer draws the slots as a node material from phase 3; `sway` is
// drawn in 5c and `terrainDetail` in 5a, their fields are here now.
//
// Vegetation plan PG1 (user decision 2026-11-18, §6.6 hybrid path C), both
// added with defaults (old files read as they are):
// - `projection`: `uv` (the mesh's UVs) or `triplanar` (three axis
//   projections in model space, blended by the normal; no unwrapping, the
//   generated rock has no UVs). `metersPerRepeat` is one texture repeat.
// - `variation`: the shader's share of the hybrid path: a low-frequency world
//   noise colour shift, a cavity tint from vertex colour R and an up-facing
//   cover tint (moss, dust) from the world normal. Detail stays in the baked
//   tile textures.
//
// Plan phase W4, added with neutral defaults (old files read as they are):
// - `weather`: how the surface takes the World Environment's wetness and snow
//   (engine/environment/surfaceResponse.ts). `puddleAccept` is drawn in W6.

import {
  assetRef,
  bool,
  color,
  defineJsonAssetType,
  enumOf,
  num,
  object,
  vec2,
  type FieldValues,
  type JsonAssetDoc,
} from "../../core/index.ts";

export const MATERIAL_TYPES = ["standard", "basic"] as const;
export const MATERIAL_SIDES = ["front", "back", "double"] as const;
export const MATERIAL_ALPHA_MODES = ["opaque", "blend", "mask"] as const;
export const LAYER_BLEND_DRIVERS = ["constant", "slope", "worldHeight", "maskTexture", "vertexColor"] as const;
export const VERTEX_COLOR_CHANNELS = ["r", "g", "b", "a"] as const;
export const MATERIAL_PROJECTIONS = ["uv", "triplanar"] as const;

/** Texture slots that hold colour (sRGB); every other slot is data (linear). */
export const SRGB_TEXTURE_SLOTS: ReadonlySet<string> = new Set(["baseColorTexture", "emissiveTexture"]);

const texture = (hint: string, label?: string) =>
  assetRef({ assetType: "forge.texture", hint, ...(label === undefined ? {} : { label }) });

const uvTiling = (hint: string) =>
  vec2({ default: [1, 1], min: 0.001, max: 100, label: "UV Tiling", hint });

const unit = (fallback: number, hint: string, label?: string) =>
  num({ min: 0, max: 1, default: fallback, hint, ...(label === undefined ? {} : { label }) });

const emissiveIntensity = (hint: string) => num({ min: 0, default: 0, slider: [0, 10], hint });

const velocity = (fallback: [number, number], hint: string) =>
  vec2({ default: fallback, min: -10, max: 10, hint });

/** Layer 1 of a two-layer blend (Forge's `ForgeMaterialLayer`). */
const Layer = object(
  {
    baseColor: color({ default: "#ffffff", hint: "Katmanın temel rengi; doku varsa onunla çarpılır." }),
    baseColorTexture: texture("Katmanın renk dokusu (sRGB)."),
    normalTexture: texture("Katmanın normal haritası. Yalnız temel katmanda normal haritası varsa kullanılır."),
    roughnessTexture: texture("Katmanın pürüzlülük dokusu (G kanalı)."),
    metalnessTexture: texture("Katmanın metaliklik dokusu (B kanalı)."),
    opacityTexture: texture("Katmanın opaklık dokusu (G kanalı)."),
    emissiveTexture: texture("Katmanın ışıma dokusu (sRGB)."),
    aoTexture: texture("Katmanın ortam kapanması dokusu (R kanalı).", "AO Texture"),
    roughness: unit(0.8, "Katmanın pürüzlülüğü: 0 ayna, 1 mat."),
    metalness: unit(0, "Katmanın metalikliği: 0 yalıtkan, 1 metal."),
    opacity: unit(1, "Katmanın opaklığı: 0 görünmez, 1 tam."),
    emissive: color({ default: "#000000", hint: "Katmanın ışıma rengi." }),
    emissiveIntensity: emissiveIntensity("Katmanın ışıma gücü (1 parlamaya başlar)."),
    aoIntensity: unit(1, "Katmanın ortam kapanması etkisi: 0 yok, 1 tam.", "AO Intensity"),
    uvTiling: uvTiling("Katman dokularının tekrar sayısı (U, V)."),
  },
  { label: "Layer 1", hint: "Karışımın ikinci katmanı." },
);

export const MaterialFields = {
  materialType: enumOf(MATERIAL_TYPES, {
    default: "standard",
    labels: { standard: "Standard (Lit)", basic: "Basic (Unlit)" },
    hint: "Standard ışıkla gölgelenir; Basic ışıksız, rengi olduğu gibi gösterir.",
  }),
  baseColor: color({ default: "#ffffff", hint: "Temel renk; renk dokusu varsa onunla çarpılır." }),
  baseColorTexture: texture("Renk dokusu (sRGB). Alfası opaklık olarak kullanılabilir."),
  normalTexture: texture("Normal haritası (tanjant uzayı)."),
  maskTexture: texture("Eski maske dokusu: ORM yoksa ORM olarak okunur (Forge kuralı)."),
  roughnessTexture: texture("Pürüzlülük dokusu (G kanalı)."),
  metalnessTexture: texture("Metaliklik dokusu (B kanalı)."),
  aoTexture: texture("Ortam kapanması dokusu (R kanalı).", "AO Texture"),
  opacityTexture: texture("Opaklık dokusu (G kanalı)."),
  useBaseColorAlphaForOpacity: bool({
    default: false,
    label: "Use Base Color Alpha For Opacity",
    hint: "Opaklık dokusu yoksa renk dokusunun alfasını kesme maskesi olarak kullanır.",
  }),
  emissiveTexture: texture("Işıma dokusu (sRGB)."),
  ormTexture: texture("Paketli doku: R ortam kapanması, G pürüzlülük, B metaliklik. Varsa ayrı dokuların yerini alır.", "ORM Texture"),
  uvTiling: uvTiling("Dokuların tekrar sayısı (U, V)."),
  terrainMetersPerRepeat: num({
    min: 0,
    max: 1000,
    default: 0,
    slider: [0, 50],
    hint: "Yalnız terrain'de: bir doku tekrarının dünya boyutu, metre. 0 kapalı (UV tiling kullanılır).",
  }),
  flipY: bool({
    default: true,
    label: "Flip Y",
    hint: "Dokular yüklenirken dikey çevrilir. GLB modelin kendi UV'leriyle kullanılan materyalde kapat.",
  }),
  roughness: unit(0.8, "Pürüzlülük: 0 ayna, 1 mat."),
  metalness: unit(0, "Metaliklik: 0 yalıtkan, 1 metal."),
  aoIntensity: unit(1, "Ortam kapanması etkisi: 0 yok, 1 tam.", "AO Intensity"),
  opacity: unit(1, "Opaklık: 0 görünmez, 1 tam. 1'in altı karıştırmayı açar."),
  alphaMode: enumOf(MATERIAL_ALPHA_MODES, {
    default: "opaque",
    labels: { opaque: "Opaque", blend: "Blend", mask: "Mask" },
    hint: "Opaque tam opak; Blend yarı saydam (derinlik yazmaz); Mask eşiğin altını keser.",
  }),
  alphaTest: unit(0.5, "Mask kipinde kesme eşiği."),
  side: enumOf(MATERIAL_SIDES, {
    default: "front",
    labels: { front: "Front", back: "Back", double: "Double" },
    hint: "Hangi yüzün çizileceği.",
  }),
  emissive: color({ default: "#000000", hint: "Işıma rengi." }),
  emissiveIntensity: emissiveIntensity("Işıma gücü (1 parlamaya başlar; motor 1000 ile ölçekler)."),
  normalMotion: object(
    {
      enabled: bool({ default: false, hint: "Normal haritasını iki örnekle kaydırır (su yüzeyi gibi)." }),
      primaryVelocity: velocity([0.012, 0.006], "Birinci örneğin kayma hızı, UV tekrar / saniye."),
      secondaryTiling: vec2({ default: [1.37, 1.37], min: 0.001, max: 100, hint: "İkinci örneğin tekrar sayısı." }),
      secondaryVelocity: velocity([-0.009, 0.014], "İkinci örneğin kayma hızı, UV tekrar / saniye."),
      strength: num({ min: 0.05, max: 4, default: 0.65, hint: "Hareketli normalin gücü." }),
    },
    { hint: "Normal haritası hareketi. Normal haritası yoksa etkisizdir." },
  ),
  layerBlend: object(
    {
      enabled: bool({ default: false, hint: "İkinci katmanı karıştırır." }),
      layer1: Layer,
      driver: enumOf(LAYER_BLEND_DRIVERS, {
        default: "constant",
        labels: {
          constant: "Constant",
          slope: "Slope",
          worldHeight: "World Height",
          maskTexture: "Mask Texture",
          vertexColor: "Vertex Color",
        },
        hint: "Karışımı ne sürer: sabit miktar, eğim, dünya yüksekliği, maske dokusu ya da köşe rengi.",
      }),
      amount: unit(0.5, "Constant sürücüde katman 1'in payı."),
      min: num({ default: 0, hint: "Eğim (0–1) ya da yükseklik (m) sürücüsünde karışımın başladığı değer." }),
      max: num({ default: 1, hint: "Eğim (0–1) ya da yükseklik (m) sürücüsünde karışımın tamamlandığı değer." }),
      contrast: num({ min: 0.01, max: 8, default: 1, hint: "Karışım geçişinin sertliği (üs)." }),
      maskTexture: texture("Mask Texture sürücüsünün maskesi (R kanalı); temel UV'de, tekrarsız."),
      vertexColorChannel: enumOf(VERTEX_COLOR_CHANNELS, {
        default: "r",
        labels: { r: "R", g: "G", b: "B", a: "A" },
        hint: "Vertex Color sürücüsünün okuduğu kanal.",
      }),
      invertVertexColor: bool({ default: false, hint: "Köşe rengi kanalını ters çevirir." }),
    },
    { hint: "İki katmanlı karışım." },
  ),
  terrainDetail: object(
    {
      normalTexture: texture("Ayrıntı normal haritası. Boşsa ayrıntı kapalı."),
      atlasSize: enumOf(["1x1", "2x2"], {
        default: "1x1",
        labels: { "1x1": "Single", "2x2": "2x2 Atlas" },
        hint: "Tek görüntü ya da ayrı ayrı döşenen 2x2 atlas.",
      }),
      uvTiling: uvTiling("Materyal UV tekrarına göre ayrıntının tekrar sayısı."),
      strength: num({ min: 0, max: 2, default: 0.65, hint: "Ayrıntı normalinin gücü." }),
      coverage: unit(0.55, "Ayrıntının kapladığı alan oranı."),
      baseNormalStrength: num({ min: 0, max: 2, default: 1, hint: "Temel normal haritasının gücü." }),
      patchSize: num({ min: 0.5, max: 100, default: 6, hint: "Yama boyutu, metre." }),
      direction: num({ min: -360, max: 360, default: 0, hint: "Yamaların yönü, derece." }),
      directionVariation: num({ min: 0, max: 45, default: 12, hint: "Yön sapması, derece." }),
      seed: num({ min: 0, max: 65535, default: 1, step: 1, hint: "Yama dağılımının tohumu." }),
      roughness: num({ min: 0.05, max: 1, default: 0.4, hint: "Ayrıntı yamalarının pürüzlülüğü." }),
    },
    { hint: "Yalnız terrain: uzun, tohumlu yamalarda statik ayrıntı (çizimi 5a)." },
  ),
  projection: object(
    {
      mode: enumOf(MATERIAL_PROJECTIONS, {
        default: "uv",
        labels: { uv: "UV", triplanar: "Triplanar" },
        hint: "Dokular modelin UV'leriyle ya da model uzayında üç eksenden izdüşümle (UV açılımı gerekmez) örneklenir.",
      }),
      metersPerRepeat: num({ min: 0.01, max: 1000, default: 1, slider: [0.1, 20], hint: "Triplanar: bir doku tekrarının boyu, model uzayında metre." }),
      sharpness: num({ min: 1, max: 16, default: 4, hint: "Triplanar: eksenler arası geçişin sertliği (büyük değer daha keskin)." }),
    },
    { hint: "Dokuların yüzeye nasıl izdüşürüldüğü." },
  ),
  variation: object(
    {
      enabled: bool({ default: false, hint: "Dokunun üstüne büyük ölçekli renk değişimi ve yıpranma ekler (gölgelendiricide, düşük frekans)." }),
      scale: num({ min: 0.1, max: 1000, default: 6, slider: [0.5, 50], hint: "Renk kaymasının dünya uzayındaki boyu, metre." }),
      tint: color({ default: "#b8ab97", hint: "Kaymanın hedef renk çarpanı." }),
      strength: unit(0.35, "Renk kaymasının gücü: 0 yok, 1 tam."),
      cavityColor: color({ default: "#3a3229", hint: "Oyuklardaki kir rengi (köşe rengi R: oyukluk)." }),
      cavity: unit(0, "Oyuk kirinin gücü; köşe rengi olmayan modelde etkisiz."),
      topColor: color({ default: "#5b6b3c", hint: "Yukarı bakan yüzlerin örtü rengi (yosun, toz)." }),
      top: unit(0, "Üst yüz örtüsünün gücü."),
      topSharpness: num({ min: 0.5, max: 16, default: 4, hint: "Üst yüz örtüsünün eğime göre sertliği (büyük değer yalnız düz üstler)." }),
    },
    { hint: "Karma yolun gölgelendirici payı: dünya gürültüsüyle renk kayması, oyuk kiri, üst yüz örtüsü." },
  ),
  sway: object(
    {
      enabled: bool({ default: false, hint: "Bu materyalle çizilen statik mesh rüzgârda salınır." }),
      amplitude: num({ min: 0, max: 5, default: 0.15, hint: "Rüzgâr gücü 1'de uç yer değiştirmesi, metre." }),
      height: num({ min: 0.01, max: 100, default: 1, hint: "Salınımın tama ulaştığı yükseklik (pivotun üstü), metre." }),
      frequency: num({ min: 0, max: 10, default: 0.6, hint: "Titreşim sıklığı, Hz." }),
    },
    { hint: "Rüzgâr salınımı (çizimi 5c)." },
  ),
  weather: object(
    {
      wetting: unit(1, "Yüzeyin ıslaklıktan aldığı pay: 0 hiç ıslanmaz (kapalı cam, plastik), 1 tam."),
      porosity: unit(0.5, "Gözeneklilik: 0 sert yüzey ıslanınca parlar (metal, cila), 1 gözenekli yüzey koyulaşır, mat kalır (toprak, tuğla)."),
      snowAccept: unit(1, "Karın tuttuğu pay: 0 kar tutmaz, 1 tam."),
      puddleAccept: unit(1, "Düz yüzeyde su birikintisi kabulü (Faz W6 çizer): 0 hiç birikmez, 1 tam."),
    },
    { hint: "Havaya tepki (Faz W): yağışla ıslanma ve karlanma. Islanma ve kar kabulü 0 ise materyal havadan hiç etkilenmez." },
  ),
};

export const MaterialAssetType = defineJsonAssetType(
  "forge.material",
  1,
  { suffix: ".material.json", fields: MaterialFields },
  {
    label: "Material",
    hint: "Yüzey materyali: renk, dokular, pürüzlülük, metaliklik, saydamlık, ışıma ve katman karışımı.",
  },
);

export type MaterialData = FieldValues<typeof MaterialFields>;
export type MaterialDoc = JsonAssetDoc<typeof MaterialFields>;

export const MATERIAL_PRESETS = ["standard", "textured", "metal", "glass", "emissive", "basic"] as const;
export type MaterialPreset = (typeof MATERIAL_PRESETS)[number];

/**
 * A new material's starting values per preset (Forge's `defaultForgeMaterialDef`):
 * the editor creates the asset from these; nothing stores the preset.
 */
export const MATERIAL_PRESET_VALUES: Readonly<Record<MaterialPreset, Partial<MaterialData>>> = {
  standard: {},
  textured: { roughness: 0.75 },
  metal: { baseColor: "#b9c0c7", roughness: 0.3, metalness: 1 },
  glass: { baseColor: "#bfe9ff", roughness: 0.05, opacity: 0.35, alphaMode: "blend", side: "double" },
  emissive: { baseColor: "#46b5ff", roughness: 0.4, emissive: "#46b5ff", emissiveIntensity: 1.5 },
  basic: { materialType: "basic", roughness: 1 },
};
