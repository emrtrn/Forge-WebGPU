// Terrain: component schema.
//
// The placed terrain (Forge WebGL's Landscape actor). Its data is a
// `forge.terrain` data document (tile grid, height range, paint layers, road
// splines) with its tiles and global map as parts (`src/core/assets/dataDocument.ts`).
// A terrain is larger than a cell, so its actor is kept in the persistent
// layer (`spatiallyLoaded: false`). Schema only for now (plan 2b, user
// decision 2026-11-12); drawn and streamed from 5a, collider from Faz 6.

import { assetRef, defineComponent, type ComponentData } from "../../core/index.ts";

export const Terrain = defineComponent(
  "forge.terrain",
  1,
  {
    data: assetRef({
      assetType: "forge.terrain",
      hint: "Arazi verisi: tile ızgarası, yükseklikler, boya katmanları ve yol spline'ları.",
    }),
  },
  {
    label: "Terrain",
    hint: "Yükseklik haritalı arazi.",
    spatial: true,
  },
);

export type TerrainData = ComponentData<typeof Terrain>;
