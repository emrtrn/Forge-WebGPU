// The Foliage tools in the editor (plan 5d step 6, INV-B09): a 2 × 2 tile World
// Terrain (it streams) and a Foliage Type in this run's temporary project copy
// (D14). Paint a stroke (one undo step), save the level part, erase and undo,
// lasso and Remove Selected, Fill the terrain; the tool takes the left button
// only while it is on; the reopened editor counts the instances and the game
// draws them.

import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataDocument, stringifyDocument, TerrainAssetType, type AssetId } from "../../src/core/index.ts";
import { decodeFoliageCell } from "../../src/core/level/foliageCells.ts";
import { encodeTerrainGlobalMap } from "../../src/engine/terrain/terrainGlobalMapFile.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../src/engine/terrain/terrainRenderSource.ts";
import { encodeTerrainTile } from "../../src/engine/terrain/terrainTileCodec.ts";
import { createFlatWorldTerrain } from "../../src/engine/terrain/worldTerrainCreate.ts";
import { cubeGlb } from "./glb.ts";
import { IDENTITY, named, openEditor, projectPath, row, shape, WEBGL_QUERY, writeLevel } from "./support.ts";

const LEVEL = "content/levels/foliage-paint-smoke";
const TERRAIN: AssetId = `ast_${"7".repeat(31)}e`;
const MODEL: AssetId = `ast_${"7".repeat(31)}f`;
const TYPE: AssetId = `ast_${"8".repeat(31)}0`;
const GROUND = "act_00000000000000000000000000006001";
const DOCUMENT = "content/terrain/foliage-paint-smoke.terrain.json";

function write(path: string, bytes: string | Uint8Array): void {
  const file = projectPath(path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

/** Instances in the level's saved foliage files, checked against the index; 0 without an index. */
function saved(): number {
  const indexFile = projectPath(`${LEVEL}/foliage.json`);
  if (!existsSync(indexFile)) return 0;
  const index = JSON.parse(readFileSync(indexFile, "utf8")) as { types: string[]; cells: { key: string; counts: number[] }[] };
  expect(index.types).toEqual([TYPE]);
  expect(readdirSync(projectPath(`${LEVEL}/foliage`)).filter((name) => name.endsWith(".bin")).sort()).toEqual(index.cells.map((cell) => `${cell.key}.bin`).sort());
  return index.cells.reduce((sum, cell) => {
    const [list] = decodeFoliageCell(readFileSync(projectPath(`${LEVEL}/foliage/${cell.key}.bin`)), cell.counts);
    return sum + list!.scales.length;
  }, 0);
}

test.beforeAll(() => {
  const terrain = createFlatWorldTerrain({ name: "foliage-paint-smoke", tilesX: 2, tilesZ: 2, tileQuads: 64, spacing: 1, baseHeight: 0 });
  terrain.def.origin = [-64, 0, -64];
  for (const [key, tile] of terrain.tiles) write(`content/terrain/foliage-paint-smoke.tiles/${key}.tile.bin`, encodeTerrainTile(tile, { heightMin: terrain.def.heightMin, heightMax: terrain.def.heightMax, heightFormat: "f32" }));
  write("content/terrain/foliage-paint-smoke.global.bin", encodeTerrainGlobalMap(terrain.def, buildTerrainGlobalAttributes(worldTerrainRenderSource(terrain.def, terrain.tiles))));
  write(DOCUMENT, stringifyDocument(dataDocument(TerrainAssetType, TERRAIN, terrain.def as unknown as Record<string, unknown>)));
  write("content/foliage-paint/bush.glb", cubeGlb(1, [0.2, 0.6, 0.2, 1]));
  write("content/foliage-paint/bush.glb.meta.json", JSON.stringify({ schema: "forge.assetMeta/1", id: MODEL, type: "forge.model@2", license: "CC0-1.0", source: { origin: "foliage paint smoke" } }));
  write("content/foliage-paint/bush.foliagetype.json", JSON.stringify({ schema: "forge.foliageType/1", id: TYPE, mesh: MODEL, radius: 1.5 }));
  writeLevel(LEVEL, "lvl_0000000000000000000000000000a5c5", [
    { id: GROUND, name: "Ground", class: null, parent: null, spatiallyLoaded: false, transform: IDENTITY, components: { terrain: { type: "forge.terrain@2", data: TERRAIN } } },
    // Two markers at opposite corners: the camera frames them from above, the terrain's centre in the middle of the view.
    { id: "act_00000000000000000000000000006002", name: "Marker A", class: null, parent: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [-40, 0.5, -40] }, components: { shape: shape() } },
    { id: "act_00000000000000000000000000006003", name: "Marker B", class: null, parent: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [40, 0.5, 40] }, components: { shape: shape() } },
  ]);
});

async function stroke(page: Page, from = 0.4, to = 0.6): Promise<void> {
  const box = (await page.getByTestId("forge-canvas").boundingBox())!;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * from, y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) await page.mouse.move(box.x + box.width * (from + ((to - from) * step) / 12), y);
  await page.mouse.up();
}

const typeRow = (page: Page) => page.locator(`[data-testid="foliage-type-row"][data-guid="${TYPE}"]`);
const counted = async (page: Page): Promise<number> => Number((await typeRow(page).getByTestId("foliage-type-count").textContent()) || 0);
const tool = (page: Page, name: string) => page.getByTestId(`foliage-tool-${name}`);

async function save(page: Page): Promise<void> {
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
  await expect(page.getByTestId("editor-save")).toBeDisabled();
}

test("Foliage tools: paint, save, erase with undo, lasso and remove, fill, tool off selects again, reopen, play", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await page.getByTestId("foliage-tab").click();
  await typeRow(page).click();
  await expect(tool(page, "paint")).toHaveAttribute("aria-pressed", "false");
  await tool(page, "paint").click();
  await expect(tool(page, "paint")).toHaveAttribute("aria-pressed", "true");

  // Paint: one stroke, one undo step; saved as the level part.
  await stroke(page);
  await expect.poll(() => counted(page)).toBeGreaterThan(10);
  const painted = await counted(page);
  await page.getByTestId("editor-undo").click();
  await expect.poll(() => counted(page)).toBe(0);
  await page.getByTestId("editor-redo").click();
  await expect.poll(() => counted(page)).toBe(painted);
  await save(page);
  expect(saved()).toBe(painted);

  // Erase a part, undo brings it back; nothing is left to save.
  await tool(page, "erase").click();
  await stroke(page, 0.4, 0.45);
  await expect.poll(() => counted(page)).toBeLessThan(painted);
  await page.getByTestId("editor-undo").click();
  await expect.poll(() => counted(page)).toBe(painted);
  await expect(page.getByTestId("editor-save")).toBeDisabled();

  // Lasso selects, Remove Selected takes them (one step), Escape first drops a selection, then the tool.
  await tool(page, "lasso").click();
  await stroke(page, 0.4, 0.5);
  await expect(page.getByTestId("foliage-tools")).not.toHaveAttribute("data-selected", "0");
  const picked = Number(await page.getByTestId("foliage-tools").getAttribute("data-selected"));
  await page.getByTestId("foliage-remove-selected").click();
  await expect.poll(() => counted(page)).toBe(painted - picked);
  await expect(page.getByTestId("foliage-tools")).toHaveAttribute("data-selected", "0");
  await stroke(page, 0.55, 0.6);
  await expect(page.getByTestId("foliage-tools")).not.toHaveAttribute("data-selected", "0");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("foliage-tools")).toHaveAttribute("data-selected", "0");
  await page.keyboard.press("Escape");
  await expect(tool(page, "lasso")).toHaveAttribute("aria-pressed", "false");

  // No tool: a click selects the terrain again; nothing is painted.
  const box = (await page.getByTestId("forge-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7);
  await expect(row(page, GROUND)).toHaveAttribute("aria-selected", "true");
  expect(await counted(page)).toBe(painted - picked);

  // Fill covers the terrain (every tile is loaded for it).
  await page.getByTestId("foliage-tab").click();
  await tool(page, "fill").click();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7);
  await expect(page.getByTestId("editor-status")).toHaveText(/^Filled \d+ foliage instances\.$/);
  await expect.poll(() => counted(page)).toBeGreaterThan(1000);
  const filled = await counted(page);
  await save(page);
  expect(saved()).toBe(filled);
  // Leaving the tab turns the tool off.
  await page.getByTestId("details-tab").click();
  await page.getByTestId("foliage-tab").click();
  await expect(tool(page, "fill")).toHaveAttribute("aria-pressed", "false");

  await openEditor(page, { level: LEVEL, drawn: true });
  await page.getByTestId("foliage-tab").click();
  await expect.poll(() => counted(page)).toBe(filled);
  await expect(named(page, "Ground")).toBeVisible();

  // The game streams and draws the same cells.
  await page.goto(`/?level=${encodeURIComponent(LEVEL)}&debug${WEBGL_QUERY}`);
  await expect(page.locator("body")).toContainText(/foliage painted: [1-9]\d* \/ [1-9]\d* cells active, .*, [1-9][\d,. ]* instances/, { timeout: 60_000 });
  expect(errors).toEqual([]);
});
