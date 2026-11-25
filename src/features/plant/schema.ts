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
// one recipe type per generator) is the crown generator's recipe
// (engine/procgen/tree/crown/crownParams.ts, same ranges): habit, size,
// growth, bark, the leafy sprays, LODs, the family's materials and response.
// `npm run forge -- generate` writes the LOD models, the leaf
// texture, the family and a foliage type per prototype beside it. It lives
// here, not in procgen, because it carries the family's response profile.

import { array, assetRef, bool, color, defineComponent, defineJsonAssetType, enumOf, num, object, text, type ComponentData, type FieldValues, type JsonAssetDoc, type JsonObject } from "../../core/index.ts";

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
    translucency: num({ min: 0, max: 2, default: 1, hint: "Yaprağın arkasından geçen ışık (0 yok); üretilmiş ağaç ve çalılarda." }),
    crownDepth: num({ min: 0, max: 1, default: 1, hint: "Tacın içinin kararması (0 yok); üretilmiş ağaç ve çalılarda." }),
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
            screenSize: num({ min: 0, max: 1, default: 0.03, hint: "Impostor'a geçilen ekran boyu (yükseklik oranı)." }),
            color: color({ default: null, hint: "Yaprak katmanının ortalama rengi (üretim aracı yazar); uzak ton bunu kullanır." }),
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
  twigTint: color({ default: "#ffffff", hint: "İnce dalların kabuk renk çarpanı (tarifin Bark grubundan)." }),
  collider: enumOf(PLANT_COLLIDERS, { default: "trunk", labels: { none: "None", trunk: "Trunk Capsule", hull: "Convex Hull" }, hint: "Tekil bitkinin çarpışması; foliage'da türün `collision` ayarı." }),
  sway: object(
    {
      amplitude: num({ min: 0, max: 5, default: 0.25, hint: "Rüzgâr gücü 1'de tacın yer değiştirmesi, metre (köşe ağırlıklarıyla; esneklik çarpar)." }),
      frequency: num({ min: 0, max: 10, default: 0.35, hint: "Salınım sıklığı, Hz." }),
    },
    { hint: "Ailenin rüzgârı: tekil bitki ve foliage aynı salınımı kullanır." },
  ),
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

export const TREE_HABITS = ["broadleaf", "conifer", "shrub"] as const;
/** The only generator there is (older recipes migrate, plan PG5b, user decision 2026-11-25). */
export const TREE_GENERATOR_VERSION = 6;
export const TREE_COLLIDERS = ["none", "trunk"] as const;
export const SPRAY_TEXTURE_SIZES = ["128", "256", "512", "1024"] as const;
export const IMPOSTOR_FRAME_SIZES = ["64", "128", "256"] as const;

export const SPRAY_LEAF_SHAPES = ["ovate", "lobed", "palmate", "needle"] as const;

const treeLod = object(
  {
    radialSegments: num({ min: 3, max: 32, default: 8, step: 1, hint: "Gövdenin çevre dilimi; ince dallar daha az." }),
    ringsPerMeter: num({ min: 0.1, max: 16, default: 2, hint: "Metre başına halka (kıvrım çözünürlüğü)." }),
    minRadius: num({ min: 0, max: 0.5, default: 0, hint: "Bundan ince dallar ve çocukları düşer, metre." }),
    leafFraction: num({ min: 0, max: 1, default: 1, hint: "Tutulan yapraklı dalcık oranı; tutulanlar yaprak alanını koruyacak kadar büyür." }),
    screenSize: num({ min: 0, max: 1, default: 0.25, hint: "Bu LOD'a geçilen ekran boyu (yükseklik oranı); LOD0'da kullanılmaz." }),
  },
  { label: "LOD" },
);

/** Per skeleton, what an older generator's branch levels and leaf cards become (the starter's shapes). */
const MIGRATED = {
  broadleaf: {},
  conifer: {
    irregularity: 0.5,
    growth: { width: 0.46, widestPoint: 0.2, fullness: 0.75, leaderDominance: 1 },
    spray: { length: 0.6, aspect: 0.72, leafShape: "needle", leafLength: 0.024, leafWidth: 0.1, leafColor: "#5b7c3c", twigColor: "#443327" },
    lods: [
      { radialSegments: 12, ringsPerMeter: 1.4, minRadius: 0, leafFraction: 1, screenSize: 0.5 },
      { radialSegments: 6, ringsPerMeter: 0.6, minRadius: 0.034, leafFraction: 0.75, screenSize: 0.42 },
      { radialSegments: 4, ringsPerMeter: 0.3, minRadius: 0.07, leafFraction: 0.2, screenSize: 0.17 },
    ],
  },
  shrub: {
    crownStart: 0.08,
    growth: { width: 1.15, widestPoint: 0.5, fullness: 0.6, leaderDominance: 0.3, clumping: 0.6, droop: 0.1 },
    bark: { twigRadius: 0.01 },
    spray: { length: 0.5, leafLength: 0.085, leafWidth: 0.78 },
    lods: [
      { radialSegments: 5, ringsPerMeter: 5, minRadius: 0, leafFraction: 1, screenSize: 1 },
      { radialSegments: 3, ringsPerMeter: 2, minRadius: 0.009, leafFraction: 0.8, screenSize: 0.22 },
      { radialSegments: 3, ringsPerMeter: 0.5, minRadius: 0.5, leafFraction: 0.3, screenSize: 0.08 },
    ],
  },
} as const;

const record = (value: unknown): JsonObject => (typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : {});

/**
 * A recipe of the removed generators (1-5) as the crown generator's: its size, age, seeds, materials, response and
 * colours stay, its branch levels, leaf cards and LODs give way to the habit's sprays (user decision 2026-11-25).
 * Published output draws as it is until the recipe is generated again.
 */
function crownRecipe({ levels: _levels, leaves, lods, ...data }: JsonObject): JsonObject {
  // Nothing given, nothing changed (what a migration must do).
  if (Object.keys(data).length === 0) return {};
  if (data.generatorVersion === TREE_GENERATOR_VERSION) {
    return { ...data, ...(Array.isArray(lods) ? { lods: lods.map((lod) => { const { leafCards: _cards, ...rest } = record(lod); return rest; }) } : {}) };
  }
  if (typeof data.generatorVersion === "number" && data.generatorVersion > TREE_GENERATOR_VERSION) throw new Error(`Unsupported tree generator version ${data.generatorVersion}`);
  const habit = data.generatorVersion === 5 || data.habit === "shrub" ? "shrub" : data.habit === "conifer" ? "conifer" : "broadleaf";
  const base = MIGRATED[habit] as JsonObject, card = record(record(leaves).texture);
  const colors = Object.fromEntries(["leafColor", "twigColor"].flatMap((key) => (typeof card[key] === "string" ? [[key, card[key]]] : []))) as JsonObject;
  return {
    ...data, ...base, generatorVersion: TREE_GENERATOR_VERSION, habit,
    growth: { ...record(base.growth), ...(data.generatorVersion === 4 ? record(data.growth) : {}) },
    spray: { ...record(base.spray), ...colors },
    ...(data.impostor !== undefined ? { impostor: { ...record(data.impostor), screenSize: 0.08 } } : {}),
  };
}

/** Defaults are the starter Broadleaf's. */
export const TreeRecipeFields = {
  generatorVersion: num({ min: TREE_GENERATOR_VERSION, default: TREE_GENERATOR_VERSION, step: 1, hint: "Tarifin kullandığı üretici sürümü; üretim aracı yazar." }),
  habit: enumOf(TREE_HABITS, { default: "broadleaf", labels: { broadleaf: "Spreading", conifer: "Whorled Conifer", shrub: "Shrub" },
    hint: "İskelet: taç hacmine yayılan dallar (geniş yapraklılar, açık taçlı çam), düz gövdede kat dalları (ladin, göknar) ya da kökten çok saplı çalı. Değişince starter'ın o iskeletteki biçimi uygulanır." }),
  shrub: object({
    stemCount: num({ min: 2, max: 8, default: 5, step: 1, label: "Main Stems", hint: "Toprak hizasından çıkan odunsu ana sap sayısı." }),
    spread: num({ min: 0.2, max: 1.2, default: 0.62, label: "Basal Spread", hint: "Ana sapların dipten yana açılması, çalı boyuna oranla." }),
  }, { label: "Shrub", hint: "Çalının kök boğazından çıkan saplar ve yana yayılımı." }),
  growth: object({
    age: num({ min: 1, max: 400, default: 60, step: 1, hint: "Ağacın yaşı, yıl." }),
    matureAge: num({ min: 1, max: 400, default: 60, step: 1, hint: "Ağacın tarifteki boy ve gövde kalınlığına ulaştığı yaş." }),
    width: num({ min: 0.1, max: 1.6, default: 0.78, hint: "Tacın çapı, ağaç boyuna oranla." }),
    widestPoint: num({ min: 0.05, max: 0.95, default: 0.45, hint: "Tacın en geniş bölgesinin konumu, alttan tepeye." }),
    fullness: num({ min: 0, max: 1, default: 0.8, hint: "Taç doluluğu: yaprak alanı ve dal yoğunluğu." }),
    leaderDominance: num({ min: 0, max: 1, default: 0.42, hint: "Ana gövdenin baskınlığı. Artırdıkça gövde dikleşir ve yan dallar incelir." }),
    clumping: num({ min: 0, max: 1, default: 0.5, hint: "Dal kütlelerinin ayrılması: arttıkça taç girintili olur, aralarından gök görünür." }),
    droop: num({ min: -1, max: 1, default: 0, hint: "İnce dalların sarkması (huş, söğüt); eksi değer yukarı kaldırır (servi kavağı)." }),
  }, { label: "Growth", hint: "Yaş ve türe özgü taç biçimi." }),
  bark: object({
    twigTint: color({ default: "#e8dccb", hint: "İnce dalların kabuk renk çarpanı: huşta koyu dal, çamda turuncu üst gövde." }),
    twigRadius: num({ min: 0, max: 0.5, default: 0.04, step: 0.005, hint: "Bu yarıçaptan (metre) ince dallar tonu tam alır; 2,5 katından kalın olanlar almaz." }),
  }, { label: "Bark", hint: "Kabuğun ince dallarda değişimi; kabuğun kendisi Wood materyalinde." }),
  spray: object({
    length: num({ min: 0.2, max: 3, default: 0.68, hint: "Yapraklı dalcık kartının boyu, metre." }),
    aspect: num({ min: 0.2, max: 1.5, default: 0.82, hint: "Kartın eni, boyuna oranla." }),
    droop: num({ min: -1, max: 1, default: 0.14, hint: "Dalcıkların sarkması; eksi değer yukarı kaldırır." }),
    leafShape: enumOf(SPRAY_LEAF_SHAPES, { default: "ovate", labels: { ovate: "Ovate", lobed: "Lobed", palmate: "Palmate", needle: "Needle" }, hint: "Yaprak biçimi: oval, loblu (meşe), parmaklı (akçaağaç) ya da iğne." }),
    leafLength: num({ min: 0.01, max: 0.6, default: 0.095, step: 0.005, hint: "Bir yaprağın ya da iğnenin boyu, metre." }),
    leafWidth: num({ min: 0.02, max: 1.4, default: 0.62, hint: "Yaprağın eni, boyuna oranla." }),
    leafColor: color({ default: "#66892f", hint: "Yaz yaprağının rengi; mevsim tonu bununla çarpılır." }),
    twigColor: color({ default: "#4d3826", hint: "Dalcığın rengi." }),
    textureSize: enumOf(SPRAY_TEXTURE_SIZES, { default: "512", labels: { 128: "128", 256: "256", 512: "512", 1024: "1024" }, hint: "Dört kart karosundan birinin kenarı, piksel." }),
  }, { label: "Spray", hint: "Tacı dolduran yapraklı dalcıklar; sayıları Growth'taki Fullness'tan çıkar." }),
  variants: array(num({ min: 0, max: 4294967295, default: 1, step: 1, hint: "Bu tohum bir prototip üretir." }), { default: [1], hint: "Tohum listesi: her tohum ayrı bir ağaç prototipi." }),
  height: num({ min: 1, max: 60, default: 12, slider: [2, 40], hint: "Ağacın boyu, metre." }),
  trunkRadius: num({ min: 0.02, max: 3, default: 0.27, slider: [0.05, 1.5], hint: "Gövdenin tabandaki yarıçapı, metre." }),
  taper: num({ min: 0.01, max: 1, default: 0.08, hint: "Gövdenin tepedeki kalınlığı, tabana oranla." }),
  flare: num({ min: 0, max: 2, default: 0.6, hint: "Kökte genişleme." }),
  crownStart: num({ min: 0, max: 1, default: 0.24, hint: "Tacın gövdede başladığı yükseklik (0 kök, 1 tepe)." }),
  irregularity: num({ min: 0, max: 1, default: 0.6, hint: "Düzensizlik: boy ve açıların rastgele sapması." }),
  lods: array(treeLod, {
    default: [
      { radialSegments: 14, ringsPerMeter: 3, minRadius: 0, leafFraction: 1, screenSize: 0.5 },
      { radialSegments: 7, ringsPerMeter: 1, minRadius: 0.022, leafFraction: 0.8, screenSize: 0.42 },
      { radialSegments: 4, ringsPerMeter: 0.4, minRadius: 0.07, leafFraction: 0.16, screenSize: 0.17 },
    ],
    hint: "İnceden kabaya LOD'lar; her biri ayrı GLB (odun ve yaprak iki slot).",
  }),
  impostor: object(
    {
      enabled: bool({ default: true, hint: "Prototip başına çok açılı impostor atlası çizilsin (en uzak temsil)." }),
      views: num({ min: 4, max: 16, default: 8, step: 1, hint: "Atlasın kenar başına görüş sayısı (8 → yarım kürede 8 × 8)." }),
      frameSize: enumOf(IMPOSTOR_FRAME_SIZES, { default: "128", labels: { 64: "64", 128: "128", 256: "256" }, hint: "Görüş başına piksel." }),
      screenSize: num({ min: 0, max: 1, default: 0.08, hint: "Impostor'a geçilen ekran boyu (yükseklik oranı)." }),
    },
    { hint: "Uzak temsil: odun ve yaprak ayrı katmanlarda, yaprak katmanı dökülme eşiğiyle (PG3)." },
  ),
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
  3,
  { suffix: ".treerecipe.json", fields: TreeRecipeFields },
  { label: "Tree Recipe", migrations: { 1: (data) => data, 2: crownRecipe },
    hint: "Prosedürel ağaç tarifi: taç biçimi, yapraklı dalcıklar, LOD'lar, materyaller ve mevsim tepkisi; çıktısı yanındaki aile ve modeller." },
);

export type TreeRecipeData = FieldValues<typeof TreeRecipeFields>;

export const FAMILY_SHEET_STATUSES = ["pending", "approved", "rejected"] as const;

export const FamilySheetFields = {
  entries: array(
    object(
      {
        recipe: assetRef({ hint: "Onaylanan ağaç, çalı, ot ya da kaya tarifi (projenin ya da paketin)." }),
        status: enumOf(FAMILY_SHEET_STATUSES, { default: "pending", labels: { pending: "Pending", approved: "Approved", rejected: "Rejected" }, hint: "Kullanıcının kararı. Reddedilen tarif üretilen dünyada kullanılmaz." }),
        digest: text({ default: "", hint: "Karar verildiğindeki çıktının özeti; çıktı değişince onay 'Changed' olur." }),
        note: text({ default: "", hint: "Karara not." }),
      },
      { label: "Recipe" },
    ),
    { hint: "Sayfadaki tarifler." },
  ),
};

/**
 * The approval page of generated families (plan §7.3, PG5; user decision
 * 2026-11-25: its own asset in the project, so a pack's family can be
 * approved too and a regeneration does not erase the answer). World Builder
 * reads it (engine/plant/familySheet.ts).
 */
export const FamilySheetAssetType = defineJsonAssetType(
  "forge.familySheet",
  1,
  { suffix: ".familysheet.json", fields: FamilySheetFields },
  { label: "Family Sheet", hint: "Üretilmiş ailelerin onay sayfası: tarif başına karar, önizlemesiyle." },
);

const GrassRecipeFields = {
  variants: array(num({ min: 0, max: 4294967295, default: 1, step: 1 }), { default: [1, 2, 3], hint: "Her tohum ayrı bir ot demeti üretir." }),
  height: num({ min: 0.08, max: 2, default: 0.42, label: "Blade Height", hint: "Kıvrım öncesi şerit boyu, metre." }),
  width: num({ min: 0.005, max: 0.12, default: 0.037, label: "Blade Width", hint: "Uca doğru incelen şeridin genişliği, metre." }),
  bend: num({ min: 0, max: 1, default: 0.62, label: "Blade Bend", hint: "Şeritlerin kökten dışa doğru kıvrımı." }),
  bladeCount: num({ min: 5, max: 13, default: 12, step: 1, label: "Blades per Tuft", hint: "Bir kök çevresindeki şerit sayısı." }),
};

export const GrassRecipeAssetType = defineJsonAssetType(
  "forge.grassRecipe", 1,
  { suffix: ".grassrecipe.json", fields: GrassRecipeFields },
  { label: "Grass Recipe", hint: "Eğri şeritlerden ot demeti ve iki mesh LOD'u üretir." },
);

export type GrassRecipeData = FieldValues<typeof GrassRecipeFields>;
