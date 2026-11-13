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
// day): the hour is fixed; a timed transition (`transitionTo`) comes in phase
// 3 step 7. Forge's `dayLengthMinutes` has no field. Not here yet: the visual
// snow / wetness cover (`surface`, phase 5a) and the sway wind (`wind`, 5c).

import { color, defineComponent, enumOf, num, object, type ComponentData } from "../../core/index.ts";

/** Forge's seasons and weather presets (engine/environment/worldEnvironment.ts). */
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const WEATHER_PRESETS = ["clear", "cloudy", "rain", "snow", "fog"] as const;

const hour = (fallback: number, min: number, max: number, hint: string) =>
  num({ min, max, default: fallback, step: 0.25, hint });

export const WorldEnvironment = defineComponent(
  "forge.worldEnvironment",
  1,
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
  },
);

export type WorldEnvironmentData = ComponentData<typeof WorldEnvironment>;
