// Puddle: component schema (plan phase 5a step 6, decision 2; user decisions
// 2026-11-15).
//
// Forge WebGL's authored Puddle (`engine/scene/puddleWater.ts` and its Details
// panels) as a spatial component:
// - Where: the component's world position is the seed (X / Z) and the water
//   level (Y), so the gizmo moves and raises it; `size` is the working area,
//   a square around the seed on the terrain's grid (Forge's
//   puddleRegionAroundSeed). The bed is the terrain under the seed, found
//   automatically (Forge's `terrainRef` is not stored).
// - Fields, defaults and ranges are Forge's; a new puddle reflects planar
//   (Forge's NEW_PUDDLE_APPEARANCE). The wind ripples read the World
//   Environment's wind (phase 5a step 7); the wheel ripples' settings are kept
//   here, their behaviour comes with vehicles (phase 6 / 8).
//
// - `followWeather` (user decision 2026-11-26): the authored level is the
//   full puddle; the World Environment's live standing water (`puddleFill`,
//   rain fills it, drying empties it) lowers the water by (1 - fill) x its
//   deepest point, so the shallow edges dry first. No World Environment: full.
//
// The fill's outcome (ready, dry, open boundary, ...) is published by the
// render binding as `PuddleStatusKey`, which the editor's Details reads.

import { assetRef, bool, color, createServiceKey, defineComponent, enumOf, num, type ActorId, type ComponentData } from "../../core/index.ts";

export const Puddle = defineComponent(
  "forge.puddle",
  1,
  {
    size: num({ min: 1, max: 128, default: 12, step: 0.5, label: "Working Area (m)", hint: "Suyun dolabileceği kare alanın kenarı, metre. Terrain ızgarasına oturtulur; en çok 128 hücre ve 128 m." }),
    followWeather: bool({
      default: true, label: "Follow Weather",
      hint: "Su, World Environment'ın birikinti doluluğunu (Puddle Fill) izler: yağmurda dolar, kurudukça çekilir, önce sığ kenarlar kurur. Yazılan seviye tam doluluktur. World Environment yoksa su hep doludur; kapalıyken de.",
    }),
    color: color({ default: "#504a35", hint: "Suyun rengi." }),
    opacity: num({ min: 0, max: 1, default: 0.82, step: 0.01, hint: "Bulanıklığın derinlikle ne kadar hızlı arttığını ölçekler." }),
    roughness: num({ min: 0.04, max: 1, default: 0.13, step: 0.01, hint: "Yüzeyin pürüzlülüğü; yansımanın ne kadar dağıldığı." }),
    reflectionStrength: num({ min: 0, max: 3, default: 1.4, step: 0.01, label: "Reflection Strength", hint: "Ortam yansımasının gücü." }),
    reflectionMode: enumOf(["environment", "planar"], {
      default: "planar",
      labels: { environment: "Environment", planar: "Planar" },
      label: "Reflection Mode",
      hint: "Environment yalnız gökyüzü ışığını yansıtır; Planar sahneyi düzlem yansımasıyla yansıtır (kalite profili izin verirse).",
    }),
    reflectionQuality: enumOf(["low", "medium", "high"], {
      default: "medium",
      labels: { low: "Low", medium: "Medium", high: "High" },
      label: "Reflection Quality",
      hint: "Planar yansımanın çözünürlüğü. Low yansımayı kapatır; kalite profili bunun üstüne çıkmaz.",
    }),
    planarReflectionStrength: num({ min: 0, max: 1, default: 1, step: 0.01, label: "Planar Strength", hint: "Düzlem yansımasının ortam yansımasının yerini ne kadar aldığı." }),
    mudDensity: num({ min: 0, max: 80, default: 12, step: 0.1, label: "Mud Density", hint: "Askıdaki çamurun yoğunluğu: derin su tabanı bu hızla gizler." }),
    mudColor: color({ default: "#695039", label: "Mud Color", hint: "Askıdaki çamurun rengi." }),
    windRipplesEnabled: bool({ default: true, label: "Wind Ripples", hint: "Rüzgârın yüzeyde dalgacık oluşturması." }),
    windNormal: assetRef({ assetType: "forge.texture", label: "Wind Normal", hint: "Rüzgâr dalgacıklarının normal dokusu. Boşsa rüzgâr dalgacığı çizilmez." }),
    windNormalStrength: num({ min: 0, max: 0.6, default: 0.16, step: 0.01, label: "Wind Normal Strength", hint: "Rüzgâr dalgacıklarının eğim gücü." }),
    windWorldScale: num({ min: 0.1, max: 4, default: 0.7, step: 0.01, label: "Wind World Scale", hint: "Dalgacık dokusunun dünyadaki boyu, metre." }),
    windSpeedResponse: num({ min: 0, max: 3, default: 1, step: 0.01, label: "Wind Speed Response", hint: "Dalgacıkların rüzgâr hızına tepkisi. 0 dalgacığı durdurur." }),
    windInfluence: num({ min: 0, max: 4, default: 1.6, step: 0.01, label: "Wind Influence", hint: "Level rüzgârının bu birikintiye etkisi." }),
    wheelRipplesEnabled: bool({ default: true, label: "Wheel Ripples", hint: "Tekerleklerin suda halka dalga bırakması (araçlarla gelir)." }),
    wheelRippleStrength: num({ min: 0, max: 6, default: 1.5, step: 0.01, label: "Wheel Ripple Strength", hint: "Tekerlek dalgasının gücü." }),
    wheelRippleSpeed: num({ min: 0.1, max: 3, default: 0.65, step: 0.01, label: "Wheel Ripple Speed", hint: "Halkanın yayılma hızı, m/sn." }),
    wheelRippleWidth: num({ min: 0.02, max: 0.6, default: 0.135, step: 0.005, label: "Wheel Ripple Width", hint: "Halkanın genişliği, metre." }),
    wheelRippleWavelength: num({ min: 0.05, max: 1.5, default: 0.21, step: 0.01, label: "Wheel Ripple Wavelength", hint: "Halkadaki dalga boyu, metre." }),
    wheelRippleLifetime: num({ min: 0.2, max: 4, default: 2, step: 0.05, label: "Wheel Ripple Lifetime", hint: "Bir halkanın sönme süresi, saniye." }),
    wheelRippleInterval: num({ min: 0.04, max: 0.5, default: 0.14, step: 0.01, label: "Wheel Ripple Interval", hint: "Dönen bir tekerleğin iki halkası arasındaki süre, saniye." }),
  },
  {
    label: "Puddle",
    hint: "Terrain çukurunu belirli bir seviyeye dolduran su birikintisi. Konumu tohum noktası ve su seviyesidir.",
    spatial: true,
  },
);

export type PuddleData = ComponentData<typeof Puddle>;

/** Forge's fill outcomes, plus the time before it is known. */
export type PuddleStatus = "loading" | "ready" | "dry" | "open-boundary" | "missing-terrain" | "no-terrain" | "error";

export interface PuddleResult {
  readonly status: PuddleStatus;
  /** Wet area, square metres. */
  readonly area: number;
  readonly message: string;
}

/** The render binding's fill outcomes for the editor: by actor and component key. */
export interface PuddleStatusService {
  result(actor: ActorId, key: string): PuddleResult | undefined;
}

export const PuddleStatusKey = createServiceKey<PuddleStatusService>("forge.puddle.status");
