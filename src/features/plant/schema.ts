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

import { array, assetRef, bool, color, defineComponent, defineJsonAssetType, enumOf, num, object, type ComponentData, type FieldValues, type JsonAssetDoc } from "../../core/index.ts";

export const LEAF_HABITS = ["deciduous", "evergreen"] as const;
export const PLANT_COLLIDERS = ["none", "trunk", "hull"] as const;

const season = (foliage: number, tint: string, label: string) => object(
  {
    foliage: num({ min: 0, max: 1, default: foliage, hint: "Bu mevsimde görünen yaprak oranı (0 çıplak, 1 tam)." }),
    tint: color({ default: tint, hint: "Bu mevsimde yaprakların renk çarpanı." }),
  },
  { label, hint: `${label} hedefi; mevsim geçişi WES'in zamanlı geçişiyle.` },
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
  response: object(
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
  ),
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
