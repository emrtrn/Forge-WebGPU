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

import { array, assetRef, defineJsonAssetType, enumOf, num, object, vec3, type FieldValues, type JsonAssetDoc } from "../../core/index.ts";

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
