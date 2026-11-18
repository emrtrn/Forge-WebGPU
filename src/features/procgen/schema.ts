// Procedural generation recipes (vegetation and props plan PG0 / PG1; user
// decisions 2026-11-11 and 2026-11-18): one schema-defined JSON asset type per
// generator, edited with the general data editor's form (A13). A recipe is
// small: the generator's parameters, the seed list (each seed one prototype),
// LOD targets, material and collision. Its output is ordinary persisted
// assets beside it (plan §5.2; written by the generation tool, never at run
// time). `generatorVersion` rises with every generator change that alters the
// output; the tool writes it.
//
// `forge.rockRecipe`: the rock generator's parameters
// (engine/procgen/rock/rockParams.ts, same ranges and defaults; its `seed`
// is each entry of `variants`). The dallanan generator's `forge.treeRecipe`
// comes with PG2.
//
// `forge.surfaceTextureRecipe` (PG1, user decision 2026-11-18; plan §6.6 the
// "noise stack" texture generator): tileable base colour, normal and ORM
// textures baked on the CPU (engine/procgen/texture/surfaceTexture.ts, same
// ranges). A material refers to the textures; the shader's share of the
// hybrid path (large-scale variation) is the material's `variation` group.

import { array, assetRef, color, defineJsonAssetType, enumOf, num, object, vec2, vec3, type FieldValues, type JsonAssetDoc } from "../../core/index.ts";

export const ROCK_SHAPES = ["rounded", "angular"] as const;
export const RECIPE_COLLISIONS = ["none", "hull"] as const;

export const RockRecipeFields = {
  generatorVersion: num({ min: 1, default: 1, step: 1, hint: "Üreticinin çıktıyı değiştiren sürümü; üretim aracı yazar." }),
  variants: array(num({ min: 0, max: 4294967295, default: 1, step: 1, hint: "Bu tohum bir prototip üretir." }), {
    default: [1],
    hint: "Tohum listesi: her tohum ayrı bir kaya prototipi.",
  }),
  size: vec3({ default: [2, 2, 2], min: 0.01, max: 1000, step: 0.01, label: "Size (m)", hint: "Yaklaşık çaplar, metre (alt düzlemeden önce)." }),
  shape: enumOf(ROCK_SHAPES, { default: "rounded", labels: { rounded: "Rounded", angular: "Angular" }, hint: "Yuvarlak (alt bölünmüş küre) ya da köşeli (düzlem kesikleri belirgin)." }),
  cuts: num({ min: 0, max: 64, default: 8, step: 1, hint: "Düzlem kesiği sayısı; köşeli yüzeyler." }),
  noise: object(
    {
      amplitude: num({ min: 0, max: 0.35, default: 0.12, hint: "Yüzey gürültüsünün genliği (birim küre yarıçapına göre)." }),
      scale: num({ min: 0.01, max: 32, default: 2.5, slider: [0.1, 8], hint: "Gürültünün ölçeği; büyük değer daha sık pürüz." }),
      octaves: num({ min: 1, max: 8, default: 3, step: 1, hint: "Gürültü katmanı sayısı." }),
    },
    { hint: "Çok ölçekli yüzey gürültüsü." },
  ),
  flattenBottom: num({ min: 0, max: 1, default: 0.5, hint: "Alt yüzün düzlenme oranı (0 hiç, 1 tam)." }),
  embedDepth: num({ min: 0, max: 1000, default: 0.05, slider: [0, 2], hint: "Zemine gömülme derinliği, metre." }),
  lods: array(num({ min: 0, max: 16, default: 3, step: 1, hint: "Alt bölünme düzeyi." }), {
    default: [3, 2, 1],
    hint: "LOD başına alt bölünme düzeyi, inceden kabaya (LOD0 ilk).",
  }),
  material: assetRef({ assetType: "forge.material", hint: "Kayanın yüzey materyali (boşsa motorun varsayılanı)." }),
  collision: enumOf(RECIPE_COLLISIONS, { default: "hull", labels: { none: "None", hull: "Convex Hull" }, hint: "Çarpışma: yok ya da LOD0'ı saran dışbükey kabuk." }),
};

export const RockRecipeAssetType = defineJsonAssetType(
  "forge.rockRecipe",
  1,
  { suffix: ".rockrecipe.json", fields: RockRecipeFields },
  { label: "Rock Recipe", hint: "Prosedürel kaya tarifi: parametreler, tohumlar, LOD ve materyal; çıktısı yanındaki asset'ler." },
);

export type RockRecipeData = FieldValues<typeof RockRecipeFields>;
export type RockRecipeDoc = JsonAssetDoc<typeof RockRecipeFields>;

export const SURFACE_NOISE_KINDS = ["gradient", "ridged", "cellular"] as const;
export const SURFACE_BLENDS = ["add", "multiply", "max", "min"] as const;
export const SURFACE_TEXTURE_SIZES = ["256", "512", "1024", "2048"] as const;

const noiseLayer = object(
  {
    kind: enumOf(SURFACE_NOISE_KINDS, { default: "gradient", labels: { gradient: "Gradient", ridged: "Ridged", cellular: "Cellular" }, hint: "Gürültü türü: yumuşak, sırtlı ya da hücresel (çatlak, taneli)." }),
    scale: num({ min: 1, max: 64, default: 4, step: 1, hint: "Doku başına özellik sayısı (tamsayı; doku döşenebilir kalır)." }),
    octaves: num({ min: 1, max: 8, default: 4, step: 1, hint: "Gürültü katmanı sayısı." }),
    gain: num({ min: 0, max: 1, default: 0.5, hint: "Her katmanın genlik çarpanı." }),
    weight: num({ min: 0, max: 2, default: 1, hint: "Bu katmanın yüksekliğe katkısı." }),
    blend: enumOf(SURFACE_BLENDS, { default: "add", labels: { add: "Add", multiply: "Multiply", max: "Max", min: "Min" }, hint: "Önceki katmanlarla nasıl birleşir (ilk katmanda yok sayılır)." }),
    threshold: num({ min: 0, max: 1, default: 0.5, hint: "Eşik: değer bunun çevresinde keskinleşir." }),
    softness: num({ min: 0, max: 1, default: 1, hint: "Eşik geçişinin yumuşaklığı (1 eşik yok)." }),
  },
  { label: "Layer" },
);

export const SurfaceTextureRecipeFields = {
  generatorVersion: num({ min: 1, default: 1, step: 1, hint: "Üreticinin çıktıyı değiştiren sürümü; üretim aracı yazar." }),
  seed: num({ min: 0, max: 4294967295, default: 1, step: 1, hint: "Gürültünün tohumu." }),
  size: enumOf(SURFACE_TEXTURE_SIZES, { default: "512", labels: { 256: "256", 512: "512", 1024: "1024", 2048: "2048" }, hint: "Dokunun kenarı, piksel." }),
  layers: array(noiseLayer, {
    default: [
      { kind: "gradient", scale: 4, octaves: 5, gain: 0.5, weight: 1, blend: "add", threshold: 0.5, softness: 1 },
      { kind: "cellular", scale: 8, octaves: 2, gain: 0.5, weight: 0.45, blend: "add", threshold: 0.5, softness: 1 },
    ],
    hint: "Yüksekliği kuran gürültü katmanları, sırayla birleşir.",
  }),
  colorRamp: array(
    object({
      at: num({ min: 0, max: 1, default: 0, hint: "Yükseklikte bu rengin yeri (0 çukur, 1 tepe)." }),
      color: color({ default: "#808080", hint: "Bu yükseklikteki renk." }),
    }, { label: "Stop" }),
    {
      default: [
        { at: 0, color: "#4a4640" },
        { at: 0.55, color: "#7b766d" },
        { at: 1, color: "#a29c90" },
      ],
      hint: "Yükseklikten renge geçiş.",
    },
  ),
  normalStrength: num({ min: 0, max: 16, default: 4, hint: "Normal haritasının kabartma gücü." }),
  roughness: vec2({ default: [0.95, 0.75], min: 0, max: 1, hint: "Çukurda ve tepede pürüzlülük." }),
  aoStrength: num({ min: 0, max: 1, default: 0.6, label: "AO Strength", hint: "Oyuklarda ortam kapanmasının gücü." }),
  metalness: num({ min: 0, max: 1, default: 0, hint: "Metaliklik (taşta 0)." }),
};

export const SurfaceTextureRecipeAssetType = defineJsonAssetType(
  "forge.surfaceTextureRecipe",
  1,
  { suffix: ".surfacetexturerecipe.json", fields: SurfaceTextureRecipeFields },
  { label: "Surface Texture Recipe", hint: "Prosedürel yüzey dokusu tarifi (gürültü yığını): döşenebilir renk, normal ve ORM dokuları üretir." },
);

export type SurfaceTextureRecipeData = FieldValues<typeof SurfaceTextureRecipeFields>;
