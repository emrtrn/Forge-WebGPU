// Plants (vegetation and props plan PG0, §5.4; user decisions 2026-11-14 and
// 2026-11-18): one plant family consumed alike by a single plant actor and by
// foliage, with one environment response.
//
// `forge.plantFamily` (`*.plantfamily.json`) is what the generator writes for
// a branching recipe (PG2): its prototypes (one per recipe seed), each a LOD
// chain whose models carry wood and leaves as two material slots (decision
// 2026-11-18: one GLB per LOD), the cards / impostor the PG3 bake adds, the
// wood and leaf materials, the collider, and the response profile WES drives:
// deciduous or evergreen, per season the share of leaves shown and their
// tint, wind flexibility, how much snow wood and leaves take, how wetness
// darkens them. Season changes never rewrite the family, the level or the
// placements: the response is resolved from the live WES state.
//
// `forge.plant` is the single plant actor's component: the family, which
// prototype and the instance seed (colour, wind phase and shedding variety; no
// mesh per instance). A foliage type references the same family
// (`forge.foliageType` `family`), so both look the same in the same WES state
// (PV-WES-02).
//
// `forge.treeRecipe` (`*.treerecipe.json`, PG2; user decision 2026-11-18:
// one recipe type per generator) is the branching generator's recipe
// (engine/procgen/tree/treeParams.ts, same ranges): habit, size, branch
// levels, leaves and their card texture, LODs, the family's materials and
// response. `npm run forge -- generate` writes the LOD models, the leaf
// texture, the family and a foliage type per prototype beside it. It lives
// here, not in procgen, because it carries the family's response profile.

import { array, assetRef, bool, color, defineComponent, defineJsonAssetType, enumOf, num, object, vec2, type ComponentData, type FieldValues, type JsonAssetDoc } from "../../core/index.ts";

export const LEAF_HABITS = ["deciduous", "evergreen"] as const;
export const PLANT_COLLIDERS = ["none", "trunk", "hull"] as const;

const season = (foliage: number, tint: string, label: string) => object(
  {
    foliage: num({ min: 0, max: 1, default: foliage, hint: "Bu mevsimde görünen yaprak oranı (0 çıplak, 1 tam)." }),
    tint: color({ default: tint, hint: "Bu mevsimde yaprakların renk çarpanı." }),
  },
  { label, hint: `${label} hedefi; mevsim geçişi WES'in zamanlı geçişiyle.` },
);

const ResponseField = object(
  {
    habit: enumOf(LEAF_HABITS, { default: "deciduous", labels: { deciduous: "Deciduous", evergreen: "Evergreen" }, hint: "Yaprak döken ya da herdem yeşil." }),
    spring: season(0.8, "#9ccf6a", "Spring"),
    summer: season(1, "#ffffff", "Summer"),
    autumn: season(0.7, "#d98b3a", "Autumn"),
    winter: season(0, "#ffffff", "Winter"),
    windFlex: num({ min: 0, max: 2, default: 1, hint: "Rüzgâr esnekliği çarpanı (0 kıpırdamaz)." }),
    snow: object(
      {
        wood: num({ min: 0, max: 1, default: 0.6, hint: "Dalların kabul ettiği kar örtüsü oranı." }),
        leaf: num({ min: 0, max: 1, default: 0.8, hint: "Yaprakların / iğnelerin kabul ettiği kar örtüsü oranı." }),
      },
      { hint: "WES kar örtüsüne tepki; maske dal altını beyazlatmaz." },
    ),
    wetness: num({ min: 0, max: 1, default: 0.5, hint: "Islaklıkta koyulaşma oranı." }),
  },
  { hint: "WES'in mevsim, rüzgâr ve örtü durumuna tepki; aileye geri yazılmaz." },
);

export const PlantFamilyFields = {
  generatorVersion: num({ min: 1, default: 1, step: 1, hint: "Aileyi yazan üreticinin sürümü; üretim aracı yazar." }),
  prototypes: array(
    object(
      {
        seed: num({ min: 0, max: 4294967295, default: 1, step: 1, hint: "Prototipi üreten tarif tohumu." }),
        lods: array(
          object({
            mesh: assetRef({ assetType: "forge.model", hint: "Bu LOD'un modeli: odun ve yaprak iki materyal slotu." }),
            screenSize: num({ min: 0, max: 1, default: 0.25, hint: "Bu LOD'a geçilen ekran boyu (yükseklik oranı); LOD0 için kullanılmaz." }),
          }, { label: "LOD" }),
          { hint: "İnceden kabaya LOD zinciri (LOD0 ilk)." },
        ),
        impostor: object(
          {
            albedo: assetRef({ assetType: "forge.texture", hint: "Impostor atlasının renk + alfa dokusu (PG3)." }),
            normal: assetRef({ assetType: "forge.texture", hint: "Impostor atlasının normal + derinlik dokusu (PG3)." }),
            views: num({ min: 1, max: 32, default: 8, step: 1, hint: "Atlasın kenar başına görüş sayısı." }),
          },
          { hint: "Uzak temsil (PG3 doldurur); boşsa çalışma anı kartı." },
        ),
        height: num({ min: 0, default: 0, slider: [0, 60], hint: "Prototipin boyu, metre (üretim aracı yazar; uzaklık ve gölge için)." }),
      },
      { label: "Prototype" },
    ),
    { hint: "Tarifin tohum başına ürettiği prototipler." },
  ),
  materials: object(
    {
      wood: assetRef({ assetType: "forge.material", hint: "Gövde ve dalların (kabuk) materyali." }),
      leaf: assetRef({ assetType: "forge.material", hint: "Yaprak / iğne materyali." }),
    },
    { hint: "Modellerin iki slotuna verilen materyaller." },
  ),
  collider: enumOf(PLANT_COLLIDERS, { default: "trunk", labels: { none: "None", trunk: "Trunk Capsule", hull: "Convex Hull" }, hint: "Tekil bitkinin çarpışması; foliage'da türün `collision` ayarı." }),
  response: ResponseField,
};

export const PlantFamilyAssetType = defineJsonAssetType(
  "forge.plantFamily",
  1,
  { suffix: ".plantfamily.json", fields: PlantFamilyFields },
  { label: "Plant Family", hint: "Üretilmiş bitki ailesi: prototipler, LOD'ler, materyaller ve çevre tepkisi." },
);

export type PlantFamilyData = FieldValues<typeof PlantFamilyFields>;
export type PlantFamilyDoc = JsonAssetDoc<typeof PlantFamilyFields>;

export const Plant = defineComponent(
  "forge.plant",
  1,
  {
    family: assetRef({ assetType: "forge.plantFamily", hint: "Bitki ailesi." }),
    prototype: num({ min: 0, default: 0, step: 1, slider: [0, 15], hint: "Ailenin kaçıncı prototipi." }),
    seed: num({ min: 0, max: 4294967295, default: 1, step: 1, hint: "Örnek tohumu: renk, rüzgâr fazı ve yaprak dökülme çeşitliliği (mesh değişmez)." }),
    castShadow: bool({ default: true, hint: "Gölge düşürür. Gölge almak her zaman açık." }),
  },
  {
    label: "Plant",
    hint: "Tekil bitki: aileden bir prototip, aynı çevre tepkisiyle (foliage ile eşdeğer).",
    spatial: true,
  },
);

export type PlantData = ComponentData<typeof Plant>;

export const TREE_HABITS = ["broadleaf", "conifer"] as const;
export const LEAF_CARD_KINDS = ["broad", "needle"] as const;
export const TREE_COLLIDERS = ["none", "trunk"] as const;
export const LEAF_TEXTURE_SIZES = ["128", "256", "512", "1024"] as const;

const treeLevel = object(
  {
    count: num({ min: 0, max: 64, default: 5, step: 1, hint: "Her ebeveyn sapa düşen dal sayısı." }),
    angle: num({ min: 0, max: 120, default: 45, hint: "Ebeveynin yönünden açı, derece." }),
    angleVariation: num({ min: 0, max: 60, default: 15, hint: "Açının rastgele sapması, derece." }),
    lengthRatio: num({ min: 0.05, max: 1, default: 0.4, hint: "Dal boyu, ebeveynin boyuna oranla." }),
    start: num({ min: 0, max: 1, default: 0.35, hint: "Dalların ebeveyn üstünde başladığı yer (0 kök, 1 uç)." }),
    radiusRatio: num({ min: 0.1, max: 1, default: 0.45, hint: "Dal kalınlığı, ebeveynin o noktadaki kalınlığına oranla." }),
    bend: num({ min: -1, max: 1, default: 0.15, hint: "Eğrilik: artı yukarı kıvrılır, eksi sarkar." }),
    wobble: num({ min: 0, max: 1, default: 0.2, hint: "Dalın rastgele kıvrımı." }),
  },
  { label: "Level" },
);

const treeLod = object(
  {
    radialSegments: num({ min: 3, max: 32, default: 8, step: 1, hint: "Gövdenin çevre dilimi; ince dallar daha az." }),
    ringsPerMeter: num({ min: 0.5, max: 16, default: 2, hint: "Metre başına halka (kıvrım çözünürlüğü)." }),
    minRadius: num({ min: 0, max: 0.5, default: 0, hint: "Bundan ince dallar ve çocukları düşer, metre." }),
    leafFraction: num({ min: 0, max: 1, default: 1, hint: "Tutulan yaprak kümesi oranı; tutulanlar alanı koruyacak kadar büyür." }),
    screenSize: num({ min: 0, max: 1, default: 0.25, hint: "Bu LOD'a geçilen ekran boyu (yükseklik oranı); LOD0'da kullanılmaz." }),
  },
  { label: "LOD" },
);

/** Defaults are the broadleaf preset's (engine/procgen/tree/treeParams.ts `TREE_PRESETS.broadleaf`). */
export const TreeRecipeFields = {
  generatorVersion: num({ min: 1, default: 1, step: 1, hint: "Üreticinin çıktıyı değiştiren sürümü; üretim aracı yazar." }),
  habit: enumOf(TREE_HABITS, { default: "broadleaf", labels: { broadleaf: "Broadleaf", conifer: "Conifer" }, hint: "Geniş yapraklı (yuvarlak taç) ya da iğne yapraklı (gövde tepeye kadar, katlı dallar)." }),
  variants: array(num({ min: 0, max: 4294967295, default: 1, step: 1, hint: "Bu tohum bir prototip üretir." }), { default: [1], hint: "Tohum listesi: her tohum ayrı bir ağaç prototipi." }),
  height: num({ min: 1, max: 60, default: 12, slider: [2, 40], hint: "Ağacın boyu, metre." }),
  trunkRadius: num({ min: 0.02, max: 3, default: 0.3, slider: [0.05, 1.5], hint: "Gövdenin tabandaki yarıçapı, metre." }),
  taper: num({ min: 0.01, max: 1, default: 0.08, hint: "Gövdenin tepedeki kalınlığı, tabana oranla." }),
  flare: num({ min: 0, max: 2, default: 0.65, hint: "Kökte genişleme." }),
  crownStart: num({ min: 0, max: 1, default: 0.39, hint: "Tacın gövdede başladığı yükseklik (0 kök, 1 tepe)." }),
  irregularity: num({ min: 0, max: 1, default: 0.64, hint: "Düzensizlik: boy ve açıların rastgele sapması." }),
  levels: array(treeLevel, {
    default: [
      { count: 14, angle: 84, angleVariation: 14, lengthRatio: 0.34, start: 0.44, radiusRatio: 0.52, bend: 0.25, wobble: 0.25 },
      { count: 5, angle: 45, angleVariation: 20, lengthRatio: 0.44, start: 0.35, radiusRatio: 0.45, bend: 0.15, wobble: 0.24 },
      { count: 3, angle: 33, angleVariation: 15, lengthRatio: 0.48, start: 0.45, radiusRatio: 0.42, bend: 0.12, wobble: 0.2 },
    ],
    hint: "Dal düzeyleri: ilki gövdedeki dallar.",
  }),
  leaves: object(
    {
      perStem: num({ min: 0, max: 64, default: 4, step: 1, hint: "Uç dal başına yaprak kümesi." }),
      size: vec2({ default: [0.35, 0.35], min: 0.01, max: 5, hint: "Yaprak kartının eni ve boyu, metre." }),
      cards: num({ min: 1, max: 4, default: 2, step: 1, hint: "Küme başına çapraz kart sayısı." }),
      texture: object(
        {
          kind: enumOf(LEAF_CARD_KINDS, { default: "broad", labels: { broad: "Broad Leaves", needle: "Needles" }, hint: "Kart dokusu: dalcıkta geniş yapraklar ya da iğneler." }),
          count: num({ min: 1, max: 64, default: 7, step: 1, hint: "Kartta dalcık boyunca yaprak (ya da iğne çifti) sayısı." }),
          leafColor: color({ default: "#4d7329", hint: "Yaz yaprağının rengi; mevsim tonu bununla çarpılır." }),
          twigColor: color({ default: "#4d3826", hint: "Dalcığın rengi." }),
          size: enumOf(LEAF_TEXTURE_SIZES, { default: "256", labels: { 128: "128", 256: "256", 512: "512", 1024: "1024" }, hint: "Kart dokusunun kenarı, piksel." }),
        },
        { hint: "Yaprak kartı dokusu (üretim aracı pişirir)." },
      ),
    },
    { hint: "Yaprak kümeleri ve kartları." },
  ),
  lods: array(treeLod, {
    default: [
      { radialSegments: 14, ringsPerMeter: 4, minRadius: 0, leafFraction: 1, screenSize: 0.5 },
      { radialSegments: 8, ringsPerMeter: 1.6, minRadius: 0.006, leafFraction: 0.33, screenSize: 0.2 },
      { radialSegments: 5, ringsPerMeter: 0.75, minRadius: 0.034, leafFraction: 0.05, screenSize: 0.07 },
    ],
    hint: "İnceden kabaya LOD'lar; her biri ayrı GLB (odun ve yaprak iki slot).",
  }),
  materials: object(
    {
      wood: assetRef({ assetType: "forge.material", hint: "Gövde ve dalların (kabuk) materyali; LOD modellerinin 1. slotu." }),
      leaf: assetRef({ assetType: "forge.material", hint: "Yaprak kartlarının materyali (alfa kesmeli); 2. slot." }),
    },
    { hint: "Ailenin ve modellerin materyalleri." },
  ),
  response: ResponseField,
  sway: object(
    {
      amplitude: num({ min: 0, max: 5, default: 0.25, hint: "Rüzgâr gücü 1'de tacın yer değiştirmesi, metre (foliage türüne yazılır)." }),
      frequency: num({ min: 0, max: 10, default: 0.35, hint: "Salınım sıklığı, Hz." }),
    },
    { hint: "Üretilen foliage türünün rüzgârı (köşe ağırlıklarıyla)." },
  ),
  collision: enumOf(TREE_COLLIDERS, { default: "trunk", labels: { none: "None", trunk: "Trunk Capsule" }, hint: "Ailenin çarpışması." }),
};

export const TreeRecipeAssetType = defineJsonAssetType(
  "forge.treeRecipe",
  1,
  { suffix: ".treerecipe.json", fields: TreeRecipeFields },
  { label: "Tree Recipe", hint: "Prosedürel ağaç tarifi: dallanma, yapraklar, LOD'lar, materyaller ve mevsim tepkisi; çıktısı yanındaki aile ve modeller." },
);

export type TreeRecipeData = FieldValues<typeof TreeRecipeFields>;
