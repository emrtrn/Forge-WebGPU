// World Environment: component schema (plan phase 3 step 5, architecture
// §4.9; phase 3 decision 8).
//
// Forge WebGL's World Environment (WES, engine/environment/worldEnvironment.ts
// and its Details panel): the level's hour, the art-directed sun path, the
// night (moon, stars, night fill), the season and the weather. Defaults and
// ranges are Forge's; the groups keep Forge's shape (`sunPath`, `night`,
// `weather`). The level stores defaults only: the live hour and weather are
// runtime state (the `forge.worldEnvironment` service) and are never written
// back.
//
// No continuous day cycle (phase 3 decision 8, the user's event-based time of
// day): the hour is fixed; gameplay moves it with a timed transition
// (`transitionTo`, phase 3 step 7). Forge's `dayLengthMinutes` has no field.
// V2 (5a step 7) adds independent cover targets/rates, A7 live state and wind;
// vegetation consumes the common state in 5c.
// V3 (plan phase W): the live surface also has standing water (`puddleFill`)
// and snow depth. Version 3 stays open while phase W runs: its steps add
// fields with neutral defaults (no new version), each with the step that
// draws it.
// W2b: `weatherSky`, how each weather changes the clouds and the sky.
// W4: `surface.verticalWetting` / `windwardWetting`, how wet a standing face gets.
// W2: a weather change saved mid-way (live `weatherFrom` / `weatherProgress` /
// `weatherSeconds`) goes on from where it was.

import { bool, color, defineComponent, enumOf, num, object, WindFields, type ComponentData } from "../../core/index.ts";

/** Forge's seasons and weather presets (engine/environment/worldEnvironment.ts). */
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const WEATHER_PRESETS = ["clear", "cloudy", "rain", "snow", "fog"] as const;

const hour = (fallback: number, min: number, max: number, hint: string) =>
  num({ min, max, default: fallback, step: 0.25, hint });

const amounts = () => ({
  snowCoverage: num({ min: 0, max: 1, default: 0, step: .05, hint: "Görsel kar örtüsü (0–1); mevsimden bağımsız." }),
  wetness: num({ min: 0, max: 1, default: 0, step: .05, hint: "Görsel ıslaklık (0–1). Boya, yükseklik ve fizik materyali değişmez." }),
});
const weatherFields = () => ({
  preset: enumOf(WEATHER_PRESETS, { default: "clear" }),
  intensity: num({ min: 0, max: 1, default: 1 }),
});

/**
 * How one weather changes the clouds and the sky (plan phase W2b). The
 * defaults repeat engine/environment/weatherPresets.ts WEATHER_SKY_DEFAULTS
 * (a schema imports only core; a test keeps them equal).
 */
const skyResponse = (name: string, d: { cloudCoverage: number; cloudDensity: number; cloudColor: string; cloudColorMix: number; cloudShade: number; skyOvercast: number }) => object({
  cloudCoverage: num({ min: 0, max: 1, default: d.cloudCoverage, step: 0.05, hint: "Bulut örtüsü en az bu orana çıkar (0–1). 0 level'ınkini bırakır." }),
  cloudDensity: num({ min: 0, max: 1, default: d.cloudDensity, step: 0.05, hint: "Bulut opaklığı en az bu değere çıkar (0–1). 0 level'ınkini bırakır." }),
  cloudColor: color({ default: d.cloudColor, hint: "Bu havada bulutların rengi; kapalı gökyüzü de bu renge döner." }),
  cloudColorMix: num({ min: 0, max: 1, default: d.cloudColorMix, step: 0.05, hint: "Bulut renginin bu renge ne kadar döndüğü (0 level'ın rengi)." }),
  cloudShade: num({ min: 0, max: 1, default: d.cloudShade, step: 0.05, hint: "Kalın bulut gövdeleri koyulaşır, güneşe bakan kenarlar aydınlanır. 0 düz renk." }),
  skyOvercast: num({ min: 0, max: 1, default: d.skyOvercast, step: 0.05, hint: "Gökyüzü kendi parlaklığında bulut rengine döner, güneş diski söner; Sky Light da bu gökyüzünü yakalar." }),
}, { hint: `${name} havasında bulutlar ve gökyüzü.` });

export const WorldEnvironment = defineComponent(
  "forge.worldEnvironment",
  3,
  {
    hour: num({
      min: 0,
      max: 24,
      default: 12,
      step: 0.25,
      hint: "Level'ın saati (0 - 24). Güneşi gün yolu üzerinde yerleştirir; saat durur, sürekli gün döngüsü yoktur.",
    }),
    season: enumOf(SEASONS, {
      default: "summer",
      labels: { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" },
      hint: "Mevsim. Summer level'daki görünümü korur.",
    }),
    surface: object({
      ...amounts(),
      snowAccumulationRate: num({ min: 0, max: 1, default: .01, step: .001, label: "Snow Accumulation (/s)", hint: "Kar hedefe doğru birikir: 0–1 örtü / simülasyon saniyesi. 0 durdurur." }),
      snowMeltRate: num({ min: 0, max: 1, default: .005, step: .001, label: "Snow Melt (/s)", hint: "Kar hedefe doğru erir: 0–1 örtü / simülasyon saniyesi." }),
      wettingRate: num({ min: 0, max: 1, default: .1, step: .001, label: "Wetting (/s)", hint: "Islanma hızı: 0–1 örtü / simülasyon saniyesi." }),
      dryingRate: num({ min: 0, max: 1, default: .01, step: .001, label: "Drying (/s)", hint: "Kuruma hızı: 0–1 örtü / simülasyon saniyesi." }),
      snowColor: color({ default: "#f2f5fa", hint: "Karın rengi." }),
      snowSlopeStartDeg: num({ min: 0, max: 90, default: 30, step: 1, hint: "Kar örtüsünün eğimle azalmaya başladığı açı (derece)." }),
      snowSlopeEndDeg: num({ min: 0, max: 90, default: 55, step: 1, hint: "Karın tutunmadığı eğim (derece)." }),
      snowAltitudeEnabled: bool({ default: false, hint: "Kar örtüsünü en düşük dünya yüksekliğiyle sınırla." }),
      snowMinAltitude: num({ min: -100000, max: 100000, default: 0, step: 1, hint: "Kar örtüsünün başladığı dünya Y yüksekliği (metre)." }),
      snowAltitudeBlend: num({ min: 0, max: 10000, default: 20, step: 1, hint: "Yükseklik sınırının yumuşak geçişi (metre)." }),
      verticalWetting: num({ min: 0, max: 1, default: .35, step: .01, hint: "Dikey yüzün ıslaklık payı: yukarı bakan yüz tam ıslanır, alta bakan kuru kalır." }),
      windwardWetting: num({ min: 0, max: 1, default: .5, step: .01, hint: "Rüzgârın geldiği yandaki dikey yüzün ek payı (rüzgâr gücü 1'de)." }),
    }, { hint: "Başlangıç örtüsü ve hedefleri. Saat atlamak birikim süresi değildir; mevsim ve hava hedefleri kendiliğinden değiştirmez." }),
    wind: object({
      useLevelWind: bool({ default: true, label: "Use Level Wind", hint: "Level ayarlarındaki rüzgârı kullan. Kapalıyken aşağıdaki değerler geçerli; hava ve mevsim her iki durumda ölçekler." }),
      ...WindFields,
    }, { hint: "Ortak rüzgâr. Terrain boyasına veya fizik nesnelerine yazmaz." }),
    weather: object(
      {
        preset: enumOf(WEATHER_PRESETS, {
          default: "clear",
          labels: { clear: "Clear", cloudy: "Cloudy", rain: "Rain", snow: "Snow", fog: "Fog" },
          hint: "Hava durumu: level'daki gökyüzünü, sisi, bulutları ve güneşi göreli olarak değiştirir. Clear görünümü korur.",
        }),
        intensity: num({
          min: 0,
          max: 1,
          default: 1,
          step: 0.05,
          hint: "Clear (0) ile seçili hava (1) arasındaki karışım.",
        }),
      },
      { hint: "Level'ın başlangıçtaki havası." },
    ),
    precipitation: object(
      {
        windInfluence: num({ min: 0, max: 3, default: 1, step: 0.05, hint: "Rüzgârın yağışı ne kadar sürüklediği. 0 dümdüz yağar." }),
        brightness: num({ min: 0, max: 4, default: 1, step: 0.05, hint: "Yağmur ve karın parlaklığı; rengi havanın (sisin) rengidir." }),
        rain: object(
          {
            amount: num({ min: 0, max: 3, default: 1, step: 0.05, hint: "Damla sayısı çarpanı; hava şiddeti ve kalite ayrıca ölçekler." }),
            opacity: num({ min: 0, max: 2, default: 1, step: 0.05, hint: "Damlaların görünürlüğü." }),
            speed: num({ min: 1, max: 20, default: 9, step: 0.1, label: "Speed (m/s)", hint: "Damlaların düşüş hızı, m/sn." }),
            length: num({ min: 0.1, max: 4, default: 1, step: 0.05, hint: "Damla çizgisinin uzunluk çarpanı." }),
          },
          { hint: "Yağmurun görünüşü (hava Rain iken)." },
        ),
        snow: object(
          {
            amount: num({ min: 0, max: 3, default: 1, step: 0.05, hint: "Kar tanesi sayısı çarpanı; hava şiddeti ve kalite ayrıca ölçekler." }),
            opacity: num({ min: 0, max: 2, default: 1, step: 0.05, hint: "Kar tanelerinin görünürlüğü." }),
            speed: num({ min: 0.2, max: 6, default: 1.3, step: 0.05, label: "Speed (m/s)", hint: "Kar tanelerinin düşüş hızı, m/sn." }),
            size: num({ min: 0.2, max: 4, default: 1, step: 0.05, hint: "Kar tanelerinin boy çarpanı." }),
            flutter: num({ min: 0, max: 4, default: 1, step: 0.05, hint: "Kar tanelerinin düşerken salınması. 0 düz düşer." }),
          },
          { hint: "Karın görünüşü (hava Snow iken)." },
        ),
      },
      { hint: "Yağışın görünüşü. Ne kadar yağdığını hava (Weather) belirler." },
    ),
    weatherSky: object(
      {
        cloudy: skyResponse("Cloudy", { cloudCoverage: 0.7, cloudDensity: 0.7, cloudColor: "#c6ccd3", cloudColorMix: 0.5, cloudShade: 0.35, skyOvercast: 0.35 }),
        rain: skyResponse("Rain", { cloudCoverage: 0.9, cloudDensity: 0.9, cloudColor: "#7f8791", cloudColorMix: 0.85, cloudShade: 0.55, skyOvercast: 0.75 }),
        snow: skyResponse("Snow", { cloudCoverage: 0.9, cloudDensity: 0.85, cloudColor: "#c9cfd7", cloudColorMix: 0.7, cloudShade: 0.3, skyOvercast: 0.65 }),
        fog: skyResponse("Fog", { cloudCoverage: 0, cloudDensity: 0, cloudColor: "#b9c0c8", cloudColorMix: 0, cloudShade: 0, skyOvercast: 0.5 }),
      },
      { label: "Weather Sky", hint: "Her havanın bulutlara ve gökyüzüne etkisi. Değerlere hava tam şiddetteyken ulaşılır; Clear level'ın kendi görünümüdür. Cloud Layer yoksa bulut değişmez." },
    ),
    sunPath: object(
      {
        azimuthDeg: num({
          min: 0,
          max: 360,
          default: 180,
          step: 1,
          label: "Azimuth (°)",
          hint: "Öğle güneşinin pusula yönü, derece (0 = +Z, +X'e doğru artar).",
        }),
        noonElevationDeg: num({
          min: 5,
          max: 90,
          default: 60,
          step: 1,
          label: "Noon Elevation (°)",
          hint: "Öğle güneşinin ufuktan yüksekliği, derece.",
        }),
        sunriseHour: hour(6, 0, 23.5, "Güneşin doğduğu saat."),
        sunsetHour: hour(18, 0.5, 24, "Güneşin battığı saat; doğuştan en az yarım saat sonra olmalı."),
      },
      { hint: "Sanatsal gün yolu: enlem ve tarih yok, yalnız doğuş, batış, öğle yüksekliği ve yönü." },
    ),
    night: object(
      {
        moonIntensity: num({
          min: 0,
          max: 2,
          default: 0.08,
          step: 0.01,
          hint: "Gece yönlü ışığın (ay) şiddet çarpanı.",
        }),
        moonShadowStrength: num({
          min: 0,
          max: 1,
          default: 0.45,
          step: 0.05,
          hint: "Gece gölgelerinin koyuluğu: 0 kapalı, 1 tam kuvvet.",
        }),
        moonColor: color({
          default: "#9fb4ff",
          hint: "Ay ışığının, ay diskinin ve gece dolgu ışığının rengi.",
        }),
        moonAngularDiameterDeg: num({
          min: 0.1,
          max: 10,
          default: 1.2,
          step: 0.1,
          label: "Moon Diameter (°)",
          hint: "Görünür ay diskinin çapı, derece.",
        }),
        moonBrightness: num({
          min: 0,
          max: 10,
          default: 1,
          step: 0.1,
          label: "Moon Disc Brightness",
          hint: "Görünür ay diskinin parlaklığı; ışığı değiştirmez. 0 ayı (ve haleyi) gizler.",
        }),
        moonHaloIntensity: num({
          min: 0,
          max: 5,
          default: 0.5,
          step: 0.1,
          hint: "Ayın çevresindeki parıltının gücü. 0 kapatır.",
        }),
        moonHaloSize: num({
          min: 0.5,
          max: 12,
          default: 4,
          step: 0.5,
          hint: "Halenin disk kenarından kaç ay yarıçapı kadar yayıldığı.",
        }),
        starBrightness: num({
          min: 0,
          max: 5,
          default: 1,
          step: 0.1,
          hint: "Yıldızların parlaklığı; gündüz söner. 0 kapatır.",
        }),
        starDensity: num({
          min: 0,
          max: 1,
          default: 0.5,
          step: 0.05,
          hint: "Yıldızların yoğunluğu.",
        }),
        starSize: num({
          min: 0.5,
          max: 3,
          default: 1,
          step: 0.1,
          hint: "Yıldızların boyutu.",
        }),
        ambientFloor: num({
          min: 0,
          max: 1,
          default: 0.15,
          step: 0.05,
          hint: "Gece Sky Light'ın düz ortam ışığından kalan en düşük oran.",
        }),
        ambientIntensity: num({
          min: 0,
          max: 10,
          default: 1.5,
          step: 0.05,
          label: "Night Fill",
          hint: "Ay renginde bağımsız gece dolgu ışığı; gündüz söner. 0 kapatır.",
        }),
      },
      { hint: "Ay, yıldızlar ve gece ışığı." },
    ),
  },
  {
    label: "World Environment",
    hint: "Günün saati, mevsim ve hava: level'daki güneşi, gökyüzünü, sisi ve bulutları kendi değerlerini değiştirmeden yeniden yorumlar. Level başına bir tane olur.",
    singleton: true,
    // V1 had neither cover nor wind. The normalizer adds their neutral
    // defaults. Identity is deliberately partial-safe for overrides/saves.
    // V2 -> 3 only adds live state with defaults.
    migrations: { 1: (data) => ({ ...data }), 2: (data) => ({ ...data }) },
    state: {
      liveEnvironment: object({
        initialized: bool({ default: false }),
        hour: num({ min: 0, max: 24, default: 12 }),
        season: enumOf(SEASONS, { default: "summer" }),
        // A timed season change (vegetation plan PG2): absent fields read as "reached".
        seasonFrom: enumOf(SEASONS, { default: "summer" }),
        seasonProgress: num({ min: 0, max: 1, default: 1 }),
        seasonSeconds: num({ min: 0, default: 0 }),
        weather: object(weatherFields()),
        // A timed weather change (plan phase W2): the mix it started from (shares
        // of the presets, the rest is clear); absent fields read as "reached".
        weatherFrom: object({
          cloudy: num({ min: 0, max: 1, default: 0 }),
          rain: num({ min: 0, max: 1, default: 0 }),
          snow: num({ min: 0, max: 1, default: 0 }),
          fog: num({ min: 0, max: 1, default: 0 }),
        }),
        weatherProgress: num({ min: 0, max: 1, default: 1 }),
        weatherSeconds: num({ min: 0, default: 0 }),
        surface: object({
          ...amounts(),
          puddleFill: num({ min: 0, max: 1, default: 0 }),
          snowDepth: num({ min: 0, max: 2, default: 0 }),
        }),
        surfaceTarget: object(amounts()),
      }),
    },
  },
);

export type WorldEnvironmentData = ComponentData<typeof WorldEnvironment>;
