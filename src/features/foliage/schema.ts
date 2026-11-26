// Foliage: the Foliage Type asset and the terrain's Landscape foliage rules
// (phase 5c decisions 2 and 3, user 2026-11-17).
//
// `forge.foliageType` is a schema-defined JSON asset (`*.foliagetype.json`):
// Forge WebGL's `ForgeFoliageTypeDef` (engine/scene/foliage.ts) with its units,
// defaults and ranges. Differences:
// - The mesh is an `assetRef(forge.model)` (Forge: `meshAssetId`); a generated
//   plant family (`family` + `prototype`, PG0) replaces it and its LODs.
// - Forge kept scale as a Vec3 but used only X (uniform): `scaleMin` / `scaleMax`
//   are numbers here.
// - Forge's optional height limits (absent = open) are an `enabled` group, as
//   the material asset did with Forge's null groups (phase 3 decision).
// - `receiveShadow` is gone: receiving shadows is always on (the static mesh
//   decision of 2026-11-13).
// - Wind `sway` names its source: Forge's height falloff, or weights the mesh
//   carries in its vertices (procedural plants, PG0 contract 2).
// - `lods` and `impostor` are the slots of PG0 contract 1 (LOD chain, impostor
//   atlas); empty until PG3 writes them. Forge's runtime billboard is drawn
//   from `far` (decision 6).
//
// `forge.landscapeFoliage` sits on the terrain's actor (persistent layer):
// Forge's `LandscapeFoliageRule`s of that terrain. The rule's `landscapeId`
// is the actor itself; its optional band fields are groups with Forge's
// defaults (`LANDSCAPE_FOLIAGE_RULE_BAND_DEFAULTS`, `TERRAIN_MASK_RANGES`).
// Painted instances are not here: they are a level part (`foliage.json` +
// `foliage/<x>_<z>.bin`, decision 4).

import {
  array,
  assetRef,
  bool,
  color,
  defineComponent,
  defineJsonAssetType,
  enumOf,
  num,
  object,
  text,
  type ComponentData,
  type FieldValues,
  type JsonAssetDoc,
} from "../../core/index.ts";

export const FOLIAGE_SWAY_SOURCES = ["height", "vertex"] as const;

export const FoliageTypeFields = {
  mesh: assetRef({ assetType: "forge.model", hint: "Her örnekte çizilen model." }),
  family: assetRef({ assetType: "forge.plantFamily", hint: "Üretilmiş bitki ailesi; doluysa model ve LOD'ler yerine ailenin prototipi çizilir (tekil bitkiyle aynı tepki)." }),
  prototype: num({ min: 0, default: 0, step: 1, slider: [0, 15], hint: "Ailenin kaçıncı prototipi (aile boşsa kullanılmaz)." }),
  radius: num({ min: 0, default: 0.5, slider: [0, 20], hint: "Aynı türün iki örneği arasındaki en küçük aralık (boyama), metre." }),
  density: num({ min: 0, max: 10, default: 1, hint: "Boyamada fırça darbesi başına örnek çarpanı." }),
  scaleMin: num({ min: 0.001, default: 1, slider: [0.05, 5], hint: "Örnek başına rastgele ölçeğin alt sınırı (eşit ölçek)." }),
  scaleMax: num({ min: 0.001, default: 1, slider: [0.05, 5], hint: "Örnek başına rastgele ölçeğin üst sınırı (eşit ölçek)." }),
  randomYaw: bool({ default: true, hint: "Her örnek dikey eksende rastgele döner." }),
  alignToNormal: bool({ default: true, hint: "Örneğin yukarı ekseni zeminin normaline döner." }),
  zOffsetMin: num({ default: 0, slider: [-5, 5], hint: "Yerleşimden sonra rastgele dikey kaymanın alt sınırı, metre." }),
  zOffsetMax: num({ default: 0, slider: [-5, 5], hint: "Yerleşimden sonra rastgele dikey kaymanın üst sınırı, metre." }),
  slopeMin: num({ min: 0, max: 90, default: 0, hint: "Kabul edilen en küçük eğim, derece (0 düz)." }),
  slopeMax: num({ min: 0, max: 90, default: 90, hint: "Kabul edilen en büyük eğim, derece (90 dik duvar)." }),
  heightLimit: object(
    {
      enabled: bool({ default: false, hint: "Yerleşim dünya yüksekliğiyle sınırlanır." }),
      min: num({ min: -10000, max: 10000, default: -10000, slider: [-500, 2000], hint: "En düşük dünya yüksekliği, metre." }),
      max: num({ min: -10000, max: 10000, default: 10000, slider: [-500, 2000], hint: "En yüksek dünya yüksekliği, metre." }),
    },
    { hint: "Dünya yüksekliği penceresi; kapalıysa sınır yok." },
  ),
  castShadow: bool({ default: true, hint: "Gölge düşürür. Gölge almak her zaman açık." }),
  collision: bool({ default: false, hint: "Oyunda çarpışır. Ot, çiçek ve çakıl çarpışmaz." }),
  cullStart: num({ min: 0, default: 0, slider: [0, 2000], hint: "Solmanın başladığı uzaklık, metre (0 kapalı)." }),
  cullEnd: num({ min: 0, default: 0, slider: [0, 2000], hint: "Örneklerin kaybolduğu uzaklık, metre (0 hiç kaybolmaz). Kalite profili ölçekler." }),
  sway: object(
    {
      enabled: bool({ default: false, hint: "Örnekler rüzgârda salınır (WES rüzgârı)." }),
      source: enumOf(FOLIAGE_SWAY_SOURCES, {
        default: "height",
        labels: { height: "Height", vertex: "Vertex Weights" },
        hint: "Salınım ağırlığı: pivotun üstündeki yükseklikten ya da modelin köşe niteliklerinden.",
      }),
      amplitude: num({ min: 0, max: 5, default: 0.15, hint: "Rüzgâr gücü 1'de uç yer değiştirmesi, metre." }),
      height: num({ min: 0.01, max: 100, default: 1, hint: "Salınımın tama ulaştığı yükseklik (pivotun üstü), metre." }),
      frequency: num({ min: 0, max: 10, default: 0.6, hint: "Titreşim sıklığı, Hz." }),
    },
    { hint: "Rüzgâr salınımı." },
  ),
  fadeSpread: num({ min: 0, default: 0, slider: [0, 100], hint: "Seyrelme aralığı, metre. Her örneğin solma penceresi bu aralıkta daha yakına kayar. Uzak kart kullanıldığında uygulanmaz." }),
  far: object(
    {
      distance: num({ min: 0, max: 20000, default: 0, slider: [0, 5000], hint: "Landscape kuralı foliage'ı cullEnd'den sonra bu uzaklığa kadar kameraya dönük kartla çizilir, metre (0 kapalı)." }),
      tint: num({ min: 0, max: 1, default: 0, hint: "Uzakta, kuralın foliage'ı altındaki arazinin bitkinin rengine koyulaşması (0 kapalı)." }),
    },
    { hint: "Uzak temsil (yalnız Landscape kuralları; boyanmış foliage kullanmaz)." },
  ),
  lods: array(
    object({
      mesh: assetRef({ assetType: "forge.model", hint: "Bu LOD'un modeli." }),
      screenSize: num({ min: 0, max: 1, default: 0.25, hint: "Bu LOD'a geçilen ekran boyu (yükseklik oranı)." }),
    }, { label: "LOD" }),
    { hint: "Uzaklaştıkça kullanılan sade modeller (LOD1, LOD2, …). Boşsa yalnız ana model." },
  ),
  impostor: object(
    {
      albedo: assetRef({ assetType: "forge.texture", hint: "Impostor atlasının renk + alfa dokusu." }),
      normal: assetRef({ assetType: "forge.texture", hint: "Impostor atlasının normal + derinlik dokusu." }),
      views: num({ min: 1, max: 32, default: 8, step: 1, hint: "Atlasın kenar başına görüş sayısı (8 → 8 × 8)." }),
      screenSize: num({ min: 0, max: 1, default: 0.03, hint: "Impostor'a geçilen ekran boyu (yükseklik oranı)." }),
      color: color({ default: null, hint: "Yaprak katmanının ortalama rengi (üretim aracı yazar); uzak ton bunu kullanır." }),
    },
    { hint: "Önceden çizilmiş çok açılı impostor atlası (üretilmiş bitkiler, PG3). Boşsa çalışma anı kartı." },
  ),
};

export const FoliageTypeAssetType = defineJsonAssetType(
  "forge.foliageType",
  1,
  { suffix: ".foliagetype.json", fields: FoliageTypeFields },
  {
    label: "Foliage Type",
    hint: "Foliage türü: model, yerleşim kuralları, uzaklık, gölge ve rüzgâr.",
  },
);

export type FoliageTypeData = FieldValues<typeof FoliageTypeFields>;
export type FoliageTypeDoc = JsonAssetDoc<typeof FoliageTypeFields>;

const LandscapeFoliageRule = object(
  {
    id: text({ hint: "Kuralın kararlı kimliği (World Builder sahipliği bununla izler)." }),
    layer: text({ hint: "Terrain boya katmanının kimliği (ör. forest, meadow)." }),
    foliageType: assetRef({ assetType: "forge.foliageType", hint: "Bu kuralın yerleştirdiği foliage türü." }),
    density: num({ min: 0, max: 10, default: 0.25, slider: [0, 0.1], hint: "Metrekare başına aday örnek; 0 kuralı kapatır." }),
    minWeight: num({ min: 0, max: 1, default: 0.5, hint: "Örnek için gereken en düşük katman ağırlığı." }),
    seed: num({ min: 0, max: 4294967295, default: 1, step: 1, hint: "Kararlı tohum: örnekler kaydedilmez, bundan yeniden kurulur." }),
    height: object(
      {
        enabled: bool({ default: false, hint: "Dünya yüksekliği bandı açık." }),
        min: num({ min: -10000, max: 10000, default: -10000, slider: [-500, 2000], hint: "Bandın alt sınırı, metre." }),
        max: num({ min: -10000, max: 10000, default: 10000, slider: [-500, 2000], hint: "Bandın üst sınırı, metre." }),
        falloff: num({ min: 0, max: 500, default: 0, hint: "Band dışında sıfıra inen geçiş, metre." }),
      },
      { hint: "Yükseklik bandı; kapalıysa açık uçlu." },
    ),
    slope: object(
      {
        min: num({ min: 0, max: 90, default: 0, hint: "Bandın alt eğimi, derece." }),
        max: num({ min: 0, max: 90, default: 90, hint: "Bandın üst eğimi, derece." }),
        falloff: num({ min: 0, max: 45, default: 0, hint: "Band dışında sıfıra inen geçiş, derece." }),
      },
      { hint: "Eğim bandı. Foliage türünün kendi eğim sınırı ayrıca uygulanır." },
    ),
    noise: object(
      {
        amount: num({ min: 0, max: 1, default: 0, hint: "Yoğunluğu yamalara bölen gürültü (0 kapalı)." }),
        scale: num({ min: 1, max: 500, default: 20, hint: "Gürültü yamalarının boyu, metre." }),
      },
      { hint: "Yoğunluk gürültüsü." },
    ),
    edgeScale: num({ min: 0, max: 1, default: 1, hint: "Band ve boya kenarında ölçek çarpanı (1 değişmez; ör. ağaç sınırında bodur ağaçlar)." }),
    groundRadius: num({ min: 0, max: 5, default: 0, hint: "Dik duran gövdenin taban yarıçapı, metre. Eğimde tabanın aşağı kenarını zemine oturtur." }),
    edge: object(
      {
        fadeIn: num({ min: 0, max: 1, default: 0, hint: "Boya ağırlığı en düşük değerin bu kadar üstüne çıkınca yoğunluk tam olur (0 keskin kenar)." }),
        maxWeight: num({ min: 0, max: 1, default: 1, hint: "Boya bu ağırlığı aşınca kural seyrelir (1 kapalı; ör. yalnız orman kenarında çalı)." }),
        fadeOut: num({ min: 0, max: 1, default: 0, hint: "En yüksek ağırlıktan sonra sıfıra inen geçiş." }),
      },
      { hint: "Boya katmanının kenarında seyrelme; kalan bitkiler yerinden oynamaz." },
    ),
    stand: object(
      {
        enabled: bool({ default: false, hint: "Aynı tohumlu ve yoğunluklu kurallar tek ızgarayı bölüşür: ağaçlar türleri ne olursa olsun aralıklı durur." }),
        from: num({ min: 0, max: 1, default: 0, hint: "Kuralın meşceredeki payının başı." }),
        to: num({ min: 0, max: 1, default: 1, hint: "Payın sonu; yoğunluk bütün meşcerenindir." }),
        patch: num({ min: 0, max: 1000, default: 0, slider: [0, 200], hint: "Tür yamalarının boyu, metre (0 kapalı); yakın paylar birlikte büyür." }),
        reach: num({ min: 0, max: 5000, default: 0, slider: [0, 1000], hint: "Modeller bu uzaklığa kadar seyrelmeden çizilir, metre (0: türün kendi uzaklıkları). Kalite profili ölçekler." }),
        far: num({ min: 0, max: 20000, default: 0, slider: [0, 5000], hint: "Reach'ten sonra bu uzaklığa kadar kameraya dönük kart, metre (0 kapalı)." }),
        tint: num({ min: 0, max: 1, default: 0, hint: "Reach'ten sonra arazinin bitkinin rengine koyulaşması." }),
        detail: num({ min: 0.1, max: 4, default: 1, slider: [0.25, 2], hint: "Yakın LOD uzaklıklarının çarpanı; küçüldükçe ayrıntılı modeller daha yakında kalır (Reach gerekir)." }),
      },
      { hint: "Meşcere: ortak ızgara, tür payı ve kendi erişimi." },
    ),
  },
  { label: "Rule" },
);

export const LandscapeFoliage = defineComponent(
  "forge.landscapeFoliage",
  1,
  {
    rules: array(LandscapeFoliageRule, {
      hint: "Terrain boya katmanından foliage üreten kurallar. Örnekler kaydedilmez; kamera çevresinde yeniden kurulur.",
    }),
  },
  {
    label: "Landscape Foliage",
    hint: "Bu terrain'in boya katmanlarından prosedürel foliage.",
  },
);

export type LandscapeFoliageData = ComponentData<typeof LandscapeFoliage>;
export type LandscapeFoliageRuleData = LandscapeFoliageData["rules"][number];
