// World Terrains in the editor (plan 5d step 4): Add Actor > Terrain > World
// Terrain… writes a one-tile terrain asset at once and adds its actor; Expand
// makes it 2 × 2 (undo / redo, Save writes the new tiles and deletes what an
// undone Expand left); Import Heightmap takes a 16-bit PNG; Export downloads
// one; moving the actor in Details moves the definition's origin; the reopened
// editor reads it all back. In this run's temporary project copy (D14).

import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { encodeHeightmapPng16 } from "../../src/engine/terrain/heightmapPng.ts";
import { decodeTerrainTile } from "../../src/engine/terrain/terrainTileCodec.ts";
import { IDENTITY, named, openEditor, projectPath, shape, writeLevel } from "./support.ts";

const LEVEL = "content/levels/landscape-world-smoke";
const DOCUMENT = "content/terrain/Smoke_Ground.terrain.json";
const tilePath = (key: string): string => `content/terrain/Smoke_Ground.tiles/${key}.tile.bin`;
const definition = (): { tilesX: number; tilesZ: number; origin: number[]; tiles: { key: string }[] } =>
  (JSON.parse(readFileSync(projectPath(DOCUMENT), "utf8")) as { data: ReturnType<typeof definition> }).data;

test.beforeAll(() => {
  writeLevel(LEVEL, "lvl_0000000000000000000000000000a5c3", [
    // Two markers at opposite corners: the camera frames them from above, the terrain's centre in the middle of the view.
    { id: "act_00000000000000000000000000005e02", name: "Marker A", class: null, parent: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [-40, 0.5, -40] }, components: { shape: shape() } },
    { id: "act_00000000000000000000000000005e03", name: "Marker B", class: null, parent: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [40, 0.5, 40] }, components: { shape: shape() } },
  ]);
});

async function save(page: Page): Promise<void> {
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
}

test("World Terrain: create, expand with undo / redo, import and export a heightmap, move, save in place, reopen", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });

  // Add Actor > Terrain > World Terrain…: one tile of 64 quads.
  await page.getByTestId("add-actor-button").hover();
  await page.locator(".add-actor-category-label", { hasText: "Terrain" }).hover();
  await page.locator("[data-testid='add-action-forge.worldTerrain']:visible").click();
  const create = page.getByTestId("terrain-create");
  await expect(create).toBeVisible();
  await page.getByTestId("terrain-create-name").fill("Smoke Ground");
  await page.getByTestId("terrain-create-name").press("Tab");
  await page.getByTestId("terrain-create-tileQuads").selectOption("64");
  await page.getByTestId("terrain-create-confirm").click();
  await expect(page.getByTestId("editor-status")).toHaveText(`Created ${DOCUMENT} (1 × 1 tiles).`);
  expect(existsSync(projectPath(tilePath("0_0")))).toBe(true);
  await expect(named(page, "Smoke Ground")).toBeVisible();
  await expect(page.getByTestId("landscape-tiles-in-memory")).toHaveText("1 / 1");
  await save(page);

  // Expand to 2 × 2 with the original tile at 0, 0.
  await page.getByTestId("landscape-expand").click();
  await page.getByTestId("terrain-expand-confirm").click();
  await expect(page.getByTestId("landscape-unsaved-tiles")).toHaveText("4");
  await save(page);
  expect(definition()).toMatchObject({ tilesX: 2, tilesZ: 2 });
  expect(existsSync(projectPath(tilePath("1_1")))).toBe(true);
  // Undo: one tile again; Save deletes the new tiles. Redo brings them back.
  await page.getByTestId("editor-undo").click();
  await save(page);
  expect(definition()).toMatchObject({ tilesX: 1, tilesZ: 1 });
  expect(existsSync(projectPath(tilePath("1_1")))).toBe(false);
  await page.getByTestId("editor-redo").click();
  await save(page);
  expect(definition().tiles).toHaveLength(4);

  // Import a 129 × 129 PNG: a ramp along X from 0 to 10 m above the datum.
  const samples = new Uint16Array(129 * 129);
  for (let z = 0; z < 129; z += 1) for (let x = 0; x < 129; x += 1) samples[z * 129 + x] = Math.round((x / 128) * 65535);
  const png = join(tmpdir(), `forge-smoke-heightmap-${process.pid}.png`);
  mkdirSync(dirname(png), { recursive: true });
  writeFileSync(png, await encodeHeightmapPng16(129, 129, samples));
  await page.getByTestId("landscape-heightmap-import").click();
  await page.getByTestId("terrain-heightmap-file").setInputFiles(png);
  await page.getByTestId("terrain-heightmap-heightMin").fill("0");
  await page.getByTestId("terrain-heightmap-heightMin").press("Tab");
  await page.getByTestId("terrain-heightmap-heightMax").fill("10");
  await page.getByTestId("terrain-heightmap-heightMax").press("Tab");
  await page.getByTestId("terrain-heightmap-confirm").click();
  await expect(page.getByTestId("editor-status")).toHaveText("Imported 129 × 129 PNG heightmap (4 tiles).");
  await save(page);
  const peak = Math.max(...decodeTerrainTile(readFileSync(projectPath(tilePath("1_0")))).heights);
  expect(peak).toBeCloseTo(10, 1);

  // Export: a PNG download.
  const download = page.waitForEvent("download");
  await page.getByTestId("landscape-heightmap-export-png").click();
  expect((await download).suggestedFilename()).toBe("Smoke_Ground-heightmap.png");

  // Move the actor 16 m along X in Details: the definition's origin follows.
  const origin = definition().origin;
  const x = page.getByTestId("detail-transform.p[0]");
  await x.fill(String(Number(await x.inputValue()) + 16));
  await x.press("Tab");
  await expect(page.getByTestId("editor-save")).toBeEnabled();
  await save(page);
  expect(definition().origin[0]).toBeCloseTo(origin[0]! + 16, 4);

  await openEditor(page, { level: LEVEL, drawn: true });
  await named(page, "Smoke Ground").click();
  await expect(page.getByTestId("landscape-tiles-in-memory")).toContainText("/ 4");
  await expect(page.getByTestId("landscape-unsaved-tiles")).toHaveText("0");
  expect(errors).toEqual([]);
});
