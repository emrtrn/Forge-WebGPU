// Terrain: component schema.
//
// The placed terrain (Forge WebGL's Landscape actor). Its data is a
// `forge.terrain` data document (tile grid, height range, paint layers, road
// splines) with its tiles and global map as parts (`src/core/assets/dataDocument.ts`).
// A terrain is larger than a cell, so its actor is kept in the persistent
// layer (`spatiallyLoaded: false`). Drawn (read only) from phase 3, produced
// and streamed from 5a, collider from phase 6. Version 2 (phase 3 step 4)
// adds `material`, Forge's Landscape material.

import { assetRef, defineComponent, type ComponentData } from "../../core/index.ts";

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
