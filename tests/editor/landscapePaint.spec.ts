// Landscape paint in the editor (plan 5d step 3): a 2 × 2 tile World Terrain
// (it streams, with its far map) and its Auto Paint rules (as an agent would
// write them with `forge edit set`) in this run's temporary project copy
// (D14). Paint a layer with a drag, Apply Auto Paint, Add Layer + Fill Layer
// with undo / redo, each saved in place; the view modes stay out of the level;
// the reopened editor reads the new layer back.

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataDocument, stringifyDocument, TerrainAssetType, type AssetId } from "../../src/core/index.ts";
import { encodeTerrainGlobalMap } from "../../src/engine/terrain/terrainGlobalMapFile.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../src/engine/terrain/terrainRenderSource.ts";
import { decodeTerrainTile, encodeTerrainTile } from "../../src/engine/terrain/terrainTileCodec.ts";
import { terrainTileLayerWeight } from "../../src/engine/terrain/terrainTypes.ts";
import { createFlatWorldTerrain } from "../../src/engine/terrain/worldTerrainCreate.ts";
import { IDENTITY, named, openEditor, projectPath, shape, writeLevel } from "./support.ts";

const LEVEL = "content/levels/landscape-paint-smoke";
const TERRAIN: AssetId = `ast_${"7".repeat(31)}b`;
const DOCUMENT = "content/terrain/landscape-paint-smoke.terrain.json";
const TILES = ["0_0", "1_0", "0_1", "1_1"];
const tilePath = (key: string): string => `content/terrain/landscape-paint-smoke.tiles/${key}.tile.bin`;

function write(path: string, bytes: string | Uint8Array): void {
  const file = projectPath(path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

/** Per saved tile: the layer's highest and lowest weight (0..1) over its vertices. */
function savedWeights(layer: number): { max: number; min: number } {
  let max = 0, min = 1;
  for (const key of TILES) {
    const tile = decodeTerrainTile(readFileSync(projectPath(tilePath(key))));
    for (let i = 0; i < tile.size * tile.size; i += 1) {
      const weight = terrainTileLayerWeight(tile, layer, i);
      max = Math.max(max, weight);
      min = Math.min(min, weight);
    }
  }
  return { max, min };
}

const savedLayers = (): string[] =>
  (JSON.parse(readFileSync(projectPath(DOCUMENT), "utf8")) as { data: { layers: { id: string }[] } }).data.layers.map((layer) => layer.id);

test.beforeAll(() => {
  // 2 × 2 tiles of 64 quads at 1 m: 128 m around the origin, flat at 0, all grass.
  const terrain = createFlatWorldTerrain({ name: "landscape-paint-smoke", tilesX: 2, tilesZ: 2, tileQuads: 64, spacing: 1, baseHeight: 0 });
  terrain.def.origin = [-64, 0, -64];
  for (const [key, tile] of terrain.tiles) write(tilePath(key), encodeTerrainTile(tile, { heightMin: terrain.def.heightMin, heightMax: terrain.def.heightMax, heightFormat: "f32" }));
  write("content/terrain/landscape-paint-smoke.global.bin", encodeTerrainGlobalMap(terrain.def, buildTerrainGlobalAttributes(worldTerrainRenderSource(terrain.def, terrain.tiles))));
  write(DOCUMENT, stringifyDocument(dataDocument(TerrainAssetType, TERRAIN, terrain.def as unknown as Record<string, unknown>)));
  const rule = {
    layer: "snow", enabled: true, strength: 1, heightMin: -10000, heightMax: 10000, heightFalloff: 0,
    slopeMin: 0, slopeMax: 90, slopeFalloff: 0, noiseAmount: 0, noiseScale: 20,
  };
  writeLevel(LEVEL, "lvl_0000000000000000000000000000a5c2", [
    {
      id: "act_00000000000000000000000000005d01", name: "Ground", class: null, parent: null, spatiallyLoaded: false, transform: IDENTITY,
      components: {
        terrain: { type: "forge.terrain@2", data: TERRAIN },
        autoPaint: { type: "forge.landscapeAutoPaint@1", baseLayer: "grass", seed: 1, rules: [rule] },
      },
    },
    // Two markers at opposite corners: the camera frames them from above, the terrain's centre in the middle of the view.
    { id: "act_00000000000000000000000000005d02", name: "Marker A", class: null, parent: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [-40, 0.5, -40] }, components: { shape: shape() } },
    { id: "act_00000000000000000000000000005d03", name: "Marker B", class: null, parent: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [40, 0.5, 40] }, components: { shape: shape() } },
  ]);
});

/** A drag across the middle of the viewport, over the terrain between the markers. */
async function stroke(page: Page): Promise<void> {
  const box = (await page.getByTestId("forge-canvas").boundingBox())!;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * 0.35, y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) await page.mouse.move(box.x + box.width * (0.35 + step * 0.025), y);
  await page.mouse.up();
}

async function save(page: Page): Promise<void> {
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
  await expect(page.getByTestId("landscape-unsaved-tiles")).toHaveText("0");
}

test("Landscape paint: paint, Auto Paint, add and fill a layer, view modes, save in place, reopen", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await named(page, "Ground").click();
  await expect(page.getByTestId("landscape-panel")).toBeVisible();
  await page.getByTestId("landscape-mode").selectOption("paint");
  await expect(page.getByTestId("landscape-tool-paint")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("landscape-tool-erase").click();
  await expect(page.getByTestId("landscape-tool-erase")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("landscape-tool-paint").click();
  // Layers: grass, dirt, rock, snow (the default Landscape layers); the first is active.
  await expect(page.getByTestId("landscape-layer-grass-select")).toHaveAttribute("aria-pressed", "true");

  // Paint dirt with a drag.
  await page.getByTestId("landscape-layer-dirt-select").click();
  await expect(page.getByTestId("landscape-layer-dirt-select")).toHaveAttribute("aria-pressed", "true");
  await stroke(page);
  await expect(page.getByTestId("landscape-unsaved-tiles")).not.toHaveText("0");
  await save(page);
  expect(savedWeights(1).max).toBeGreaterThan(0.05);

  // Auto Paint from the actor's rules: snow everywhere over the grass base.
  await page.getByTestId("landscape-auto-paint-apply").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Auto Paint applied to 4 tiles\.$/);
  await expect(page.getByTestId("landscape-unsaved-tiles")).toHaveText("4");
  await save(page);
  expect(savedWeights(3).min).toBe(1);

  // Add Layer, then fill it: one undo step each.
  await page.getByTestId("landscape-layer-add").click();
  await expect(page.getByTestId("landscape-layer-layer-1-select")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("landscape-fill-layer").click();
  await expect(page.getByTestId("editor-status")).toHaveText("Filled layer layer-1.");
  await page.getByTestId("editor-undo").click();
  await page.getByTestId("editor-redo").click();
  await save(page);
  expect(savedLayers()).toEqual(["grass", "dirt", "rock", "snow", "layer-1"]);
  expect(savedWeights(4).min).toBe(1);
  expect(savedWeights(3).max).toBe(0);

  // The view modes are an editor preview: switching them changes nothing to save.
  for (const mode of ["height", "slope", "layer", "lit"]) await page.getByTestId("landscape-viewMode").selectOption(mode);
  expect(readFileSync(projectPath(`${LEVEL}/level.json`), "utf8")).not.toContain("viewMode");

  await openEditor(page, { level: LEVEL, drawn: true });
  await named(page, "Ground").click();
  await page.getByTestId("landscape-mode").selectOption("paint");
  await expect(page.getByTestId("landscape-layer-layer-1-select")).toBeVisible();
  await expect(page.getByTestId("landscape-unsaved-tiles")).toHaveText("0");
  expect(errors).toEqual([]);
});
