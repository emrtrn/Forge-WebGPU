// Terrain: component schema.
//
// The placed terrain (Forge WebGL's Landscape actor). Its data is a
// `forge.terrain` data document (tile grid, height range, paint layers, road
// splines) with its tiles and global map as parts (`src/core/assets/dataDocument.ts`).
// A terrain is larger than a cell, so its actor is kept in the persistent
// layer (`spatiallyLoaded: false`). Drawn (read only) from phase 3, produced
// and streamed from 5a, collider from phase 6. Version 2 (phase 3 step 4)
// adds `material`, Forge's Landscape material.
//
// `forge.landscapeAutoPaint` (plan 5d step 3, user decision 2026-11-19) sits on
// the terrain's actor: Forge's Auto Paint rules (height / slope / noise bands,
// engine terrainAutoPaint.ts), saved with the level so an agent writes them
// with `forge edit set`. Applying them is a one-shot editor action (Landscape
// Mode > Paint > Apply Auto Paint, one undo step); the result is ordinary paint
// weights in the tiles, and the rules never repaint by themselves.

import { array, assetRef, bool, defineComponent, num, object, text, type ComponentData } from "../../core/index.ts";

export const Terrain = defineComponent(
  "forge.terrain",
  2,
  {
    data: assetRef({
      assetType: "forge.terrain",
      hint: "Arazi verisi: tile ızgarası, yükseklikler, boya katmanları ve yol spline'ları.",
    }),
    material: assetRef({
      assetType: "forge.material",
      hint: "Arazinin materyali (Forge Landscape materyali). Boya katmanları kendi materyalleriyle çizilir.",
    }),
  },
  {
    label: "Terrain",
    hint: "Yükseklik haritalı arazi.",
    spatial: true,
    migrations: { 1: (data) => ({ ...data }) },
  },
);

export type TerrainData = ComponentData<typeof Terrain>;

const AutoPaintRule = object(
  {
    layer: text({ hint: "Kuralın boyadığı terrain boya katmanının kimliği (ör. rock, snow)." }),
    enabled: bool({ default: true, hint: "Kapalı kural uygulanmaz." }),
    strength: num({ min: 0, max: 1, default: 1, hint: "Kuralın tam uygulandığı yerdeki ağırlığı." }),
    heightMin: num({ min: -10000, max: 10000, default: -10000, slider: [-500, 2000], hint: "Yükseklik bandının alt sınırı, dünya metresi." }),
    heightMax: num({ min: -10000, max: 10000, default: 10000, slider: [-500, 2000], hint: "Yükseklik bandının üst sınırı, dünya metresi." }),
    heightFalloff: num({ min: 0, max: 500, default: 0, hint: "Yükseklik bandı dışında sıfıra inen geçiş, metre (0 keskin kenar)." }),
    slopeMin: num({ min: 0, max: 90, default: 0, hint: "Eğim bandının alt sınırı, derece (0 düz)." }),
    slopeMax: num({ min: 0, max: 90, default: 90, hint: "Eğim bandının üst sınırı, derece (90 dikey)." }),
    slopeFalloff: num({ min: 0, max: 45, default: 0, hint: "Eğim bandı dışında sıfıra inen geçiş, derece." }),
    noiseAmount: num({ min: 0, max: 1, default: 0, hint: "Kaplamayı gürültüyle bölme miktarı (0 kapalı)." }),
    noiseScale: num({ min: 1, max: 500, default: 20, hint: "Gürültü deseninin boyu, metre." }),
  },
  { label: "Rule" },
);

export const LandscapeAutoPaint = defineComponent(
  "forge.landscapeAutoPaint",
  1,
  {
    baseLayer: text({ hint: "Hiçbir kuralın kapsamadığı zeminin katmanı; boşsa terrain'in ilk katmanı." }),
    seed: num({ min: 0, max: 2147483647, default: 1, step: 1, slider: [0, 1000], hint: "Bütün kuralların gürültü tohumu." }),
    rules: array(AutoPaintRule, {
      hint: "Sırayla uygulanır; kuralların çakıştığı yerde sonraki kazanır. Uygulama editörde Landscape Mode > Paint > Apply Auto Paint ile.",
    }),
  },
  {
    label: "Landscape Auto Paint",
    hint: "Bu terrain'i yükseklik ve eğime göre bir kerede boyayan kurallar.",
  },
);

export type LandscapeAutoPaintData = ComponentData<typeof LandscapeAutoPaint>;
