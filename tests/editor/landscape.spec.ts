// Landscape sculpt in the editor (plan 5d step 2): a 2 × 2 tile World Terrain
// (it streams, with its far map) is written into this run's temporary project
// copy (D14). Select it, raise it with a drag, undo is one step, Save writes
// the edited tiles in place with the far map and the definition, and the
// reopened editor reads them back.

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataDocument, stringifyDocument, TerrainAssetType, type AssetId } from "../../src/core/index.ts";
import { encodeTerrainGlobalMap } from "../../src/engine/terrain/terrainGlobalMapFile.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../src/engine/terrain/terrainRenderSource.ts";
import { decodeTerrainTile, encodeTerrainTile } from "../../src/engine/terrain/terrainTileCodec.ts";
import { createFlatWorldTerrain } from "../../src/engine/terrain/worldTerrainCreate.ts";
import { IDENTITY, named, openEditor, projectPath, shape, writeLevel } from "./support.ts";

const LEVEL = "content/levels/landscape-smoke";
const TERRAIN: AssetId = `ast_${"7".repeat(31)}a`;
const DOCUMENT = "content/terrain/landscape-smoke.terrain.json";
const TILES = ["0_0", "1_0", "0_1", "1_1"];
const tilePath = (key: string): string => `content/terrain/landscape-smoke.tiles/${key}.tile.bin`;

function write(path: string, bytes: string | Uint8Array): void {
  const file = projectPath(path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

/** The highest height in the saved tiles (metres above the datum). */
function savedPeak(): number {
  return Math.max(...TILES.map((key) => Math.max(...decodeTerrainTile(readFileSync(projectPath(tilePath(key)))).heights)));
}

test.beforeAll(() => {
  // 2 × 2 tiles of 64 quads at 1 m: 128 m around the origin, flat at 0.
  const terrain = createFlatWorldTerrain({ name: "landscape-smoke", tilesX: 2, tilesZ: 2, tileQuads: 64, spacing: 1, baseHeight: 0 });
  terrain.def.origin = [-64, 0, -64];
  for (const [key, tile] of terrain.tiles) write(tilePath(key), encodeTerrainTile(tile, { heightMin: terrain.def.heightMin, heightMax: terrain.def.heightMax, heightFormat: "f32" }));
  write("content/terrain/landscape-smoke.global.bin", encodeTerrainGlobalMap(terrain.def, buildTerrainGlobalAttributes(worldTerrainRenderSource(terrain.def, terrain.tiles))));
  write(DOCUMENT, stringifyDocument(dataDocument(TerrainAssetType, TERRAIN, terrain.def as unknown as Record<string, unknown>)));
  writeLevel(LEVEL, "lvl_0000000000000000000000000000a5c1", [
    { id: "act_00000000000000000000000000005c01", name: "Ground", class: null, parent: null, spatiallyLoaded: false, transform: IDENTITY, components: { terrain: { type: "forge.terrain@2", data: TERRAIN } } },
    // Two markers at opposite corners: the camera frames them from above, the terrain's centre in the middle of the view.
    { id: "act_00000000000000000000000000005c02", name: "Marker A", class: null, parent: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [-40, 0.5, -40] }, components: { shape: shape() } },
    { id: "act_00000000000000000000000000005c03", name: "Marker B", class: null, parent: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [40, 0.5, 40] }, components: { shape: shape() } },
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

test("Landscape sculpt: raise, undo, save in place, reopen", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await named(page, "Ground").click();
  const panel = page.getByTestId("landscape-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("landscape-tool-raise")).toHaveAttribute("aria-pressed", "true");
  // A tool actor: no transform or placement in its Details (Forge's layout).
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveCount(0);
  await expect(page.getByTestId("detail-placement-toolbar")).toBeHidden();
  await expect(page.getByTestId("landscape-unsaved-tiles")).toHaveText("0");

  await stroke(page);
  await expect(page.getByTestId("landscape-unsaved-tiles")).not.toHaveText("0");
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
  await expect(page.getByTestId("landscape-unsaved-tiles")).toHaveText("0");
  const raised = savedPeak();
  expect(raised).toBeGreaterThan(0.1);

  // A second stroke, taken back: Save writes the first stroke's heights again.
  await stroke(page);
  await page.getByTestId("editor-undo").click();
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
  expect(savedPeak()).toBeCloseTo(raised, 4);

  await openEditor(page, { level: LEVEL, drawn: true });
  await named(page, "Ground").click();
  await expect(page.getByTestId("landscape-tiles-in-memory")).toContainText("/ 4");
  await expect(page.getByTestId("landscape-unsaved-tiles")).toHaveText("0");
  expect(errors).toEqual([]);
});
