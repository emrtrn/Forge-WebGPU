// Landscape splines in the editor (plan 5d step 5, INV-B06 / G21): a 2 × 2
// tile World Terrain (it streams) and a road model in this run's temporary
// project copy (D14). Draw three points, curve the spline, drag a point with
// the gizmo, give the segments a mesh (drawn as chunks at once), Apply Deform
// and Apply Paint (one undo step each, undone to the exact ground), Split,
// Close Loop; each saved in place; the reopened editor draws the road again
// and the game draws it without a problem.

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataDocument, stringifyDocument, TerrainAssetType, type AssetId } from "../../src/core/index.ts";
import type { ForgeLandscapeSpline } from "../../src/engine/terrain/landscape.ts";
import { encodeTerrainGlobalMap } from "../../src/engine/terrain/terrainGlobalMapFile.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../src/engine/terrain/terrainRenderSource.ts";
import { decodeTerrainTile, encodeTerrainTile } from "../../src/engine/terrain/terrainTileCodec.ts";
import { terrainTileLayerWeight } from "../../src/engine/terrain/terrainTypes.ts";
import { createFlatWorldTerrain } from "../../src/engine/terrain/worldTerrainCreate.ts";
import { cubeGlb } from "./glb.ts";
import { drag, gizmoHandles, IDENTITY, named, openEditor, projectPath, shape, WEBGL_QUERY, writeLevel } from "./support.ts";

const LEVEL = "content/levels/landscape-spline-smoke";
const TERRAIN: AssetId = `ast_${"7".repeat(31)}c`;
const ROAD: AssetId = `ast_${"7".repeat(31)}d`;
const DOCUMENT = "content/terrain/landscape-spline-smoke.terrain.json";
const TILES = ["0_0", "1_0", "0_1", "1_1"];
const tilePath = (key: string): string => `content/terrain/landscape-spline-smoke.tiles/${key}.tile.bin`;

function write(path: string, bytes: string | Uint8Array): void {
  const file = projectPath(path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

const savedSplines = (): (ForgeLandscapeSpline & { coordinateSpace?: string })[] =>
  (JSON.parse(readFileSync(projectPath(DOCUMENT), "utf8")) as { data: { splines?: ForgeLandscapeSpline[] } }).data.splines ?? [];

/** Over the saved tiles: vertices raised above 1 m, and vertices mostly painted with the layer. */
function savedGround(layer: number): { raised: number; painted: number } {
  let raised = 0, painted = 0;
  for (const key of TILES) {
    const tile = decodeTerrainTile(readFileSync(projectPath(tilePath(key))));
    for (let i = 0; i < tile.size * tile.size; i += 1) {
      if (tile.heights[i]! > 1) raised += 1;
      if (terrainTileLayerWeight(tile, layer, i) > 0.5) painted += 1;
    }
  }
  return { raised, painted };
}

test.beforeAll(() => {
  // 2 × 2 tiles of 64 quads at 1 m: 128 m around the origin, flat at 0, all grass.
  const terrain = createFlatWorldTerrain({ name: "landscape-spline-smoke", tilesX: 2, tilesZ: 2, tileQuads: 64, spacing: 1, baseHeight: 0 });
  terrain.def.origin = [-64, 0, -64];
  for (const [key, tile] of terrain.tiles) write(tilePath(key), encodeTerrainTile(tile, { heightMin: terrain.def.heightMin, heightMax: terrain.def.heightMax, heightFormat: "f32" }));
  write("content/terrain/landscape-spline-smoke.global.bin", encodeTerrainGlobalMap(terrain.def, buildTerrainGlobalAttributes(worldTerrainRenderSource(terrain.def, terrain.tiles))));
  write(DOCUMENT, stringifyDocument(dataDocument(TerrainAssetType, TERRAIN, terrain.def as unknown as Record<string, unknown>)));
  write("content/landscape-spline/road.glb", cubeGlb(2, [0.2, 0.2, 0.2, 1]));
  write("content/landscape-spline/road.glb.meta.json", JSON.stringify({
    schema: "forge.assetMeta/1", id: ROAD, type: "forge.model@2", license: "CC0-1.0", source: { origin: "landscape spline smoke" },
  }));
  writeLevel(LEVEL, "lvl_0000000000000000000000000000a5c4", [
    { id: "act_00000000000000000000000000005f01", name: "Ground", class: null, parent: null, spatiallyLoaded: false, transform: IDENTITY, components: { terrain: { type: "forge.terrain@2", data: TERRAIN } } },
    // Two markers at opposite corners: the camera frames them from above, the terrain's centre in the middle of the view.
    { id: "act_00000000000000000000000000005f02", name: "Marker A", class: null, parent: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [-40, 0.5, -40] }, components: { shape: shape() } },
    { id: "act_00000000000000000000000000005f03", name: "Marker B", class: null, parent: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [40, 0.5, 40] }, components: { shape: shape() } },
  ]);
});

async function save(page: Page): Promise<void> {
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
  await expect(page.getByTestId("landscape-unsaved-tiles")).toHaveText("0");
}

/** The overlay's points in client pixels (`spline-1/point-1`). */
async function markers(page: Page): Promise<Record<string, [number, number]>> {
  const canvas = page.getByTestId("forge-canvas");
  await expect(canvas).toHaveAttribute("data-forge-spline-points", /point-1/);
  return JSON.parse((await canvas.getAttribute("data-forge-spline-points"))!) as Record<string, [number, number]>;
}

const meshes = (page: Page) => page.getByTestId("landscape-spline-meshes");

test("Landscape splines: draw, curve, drag a point, mesh, Apply Deform / Paint with undo, split, close, save, reopen, play", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await named(page, "Ground").click();
  await page.getByTestId("landscape-mode").selectOption("splines");
  await expect(page.getByTestId("landscape-tool-draw")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("landscape-spline-new").click();
  await expect(page.getByTestId("landscape-spline-spline-1")).toHaveAttribute("aria-pressed", "true");

  // Draw: three clicks on the ground.
  const box = (await page.getByTestId("forge-canvas").boundingBox())!;
  for (const [index, [x, y]] of ([[0.35, 0.5], [0.5, 0.62], [0.62, 0.5]] as const).entries()) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await expect(page.getByTestId(`landscape-spline-point-point-${index + 1}`)).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByTestId("landscape-spline-segment-segment-2")).toBeVisible();
  await page.getByTestId("landscape-spline-smooth").check();
  await expect(page.getByTestId("landscape-spline-smoothness")).toBeVisible();
  await save(page);
  expect(savedSplines()).toMatchObject([{ id: "spline-1", smooth: true, coordinateSpace: "world" }]);
  expect(savedSplines()[0]!.points.map((point) => point.position[1])).toEqual([0, 0, 0]);

  // Edit: a marker selects its point; the gizmo on it moves it (one step); the terrain's actor stays.
  await page.getByTestId("landscape-tool-edit").click();
  const at = (await markers(page))["spline-1/point-2"]!;
  await page.mouse.click(at[0], at[1]);
  await expect(page.getByTestId("landscape-spline-point-point-2")).toHaveAttribute("aria-pressed", "true");
  const handles = await gizmoHandles(page.getByTestId("forge-canvas"));
  const before = savedSplines()[0]!.points[1]!.position;
  await drag(page, handles["move:xyz"]!, [0, 30]);
  // One step: one undo puts it back, redo moves it again.
  const x = page.getByTestId("landscape-spline-position[0]"), z = page.getByTestId("landscape-spline-position[2]");
  const shown = async (): Promise<number> => Math.hypot(Number(await x.inputValue()) - before[0], Number(await z.inputValue()) - before[2]);
  await expect.poll(shown).toBeGreaterThan(0.5);
  await page.getByTestId("editor-undo").click();
  await expect.poll(shown).toBeLessThan(0.01);
  await page.getByTestId("editor-redo").click();
  await expect.poll(shown).toBeGreaterThan(0.5);
  await page.getByTestId("landscape-spline-point-snap").click();
  await save(page);
  const moved = savedSplines()[0]!.points[1]!.position;
  expect(Math.hypot(moved[0] - before[0], moved[2] - before[2])).toBeGreaterThan(0.5);
  expect(moved[1]).toBe(0);
  expect(JSON.parse(readFileSync(projectPath(`${LEVEL}/level.json`), "utf8")).actors[0].transform.p).toEqual([0, 0, 0]);

  // Every segment: a mesh (drawn at once), raised ground and paint.
  await page.getByTestId("landscape-spline-segments-all").click();
  await page.getByTestId("landscape-spline-meshAsset").locator("..").getByRole("button", { name: "Browse", exact: true }).click();
  await page.locator(`[data-testid="asset-picker-item"][data-id="${ROAD}"]`).click();
  await expect(meshes(page)).toHaveText(/^[1-9]\d* chunks, 0 pieces, [1-9]\d* tris$/);
  await page.getByTestId("landscape-spline-deformEnabled").check();
  await page.getByTestId("landscape-spline-deformOffset").fill("2");
  await page.getByTestId("landscape-spline-deformOffset").press("Enter");
  await page.getByTestId("landscape-spline-apply-deform").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Spline deform applied \(\d+ tiles?\)\.$/);
  await page.getByTestId("landscape-spline-paintEnabled").check();
  await page.getByTestId("landscape-spline-paintLayer").selectOption("rock");
  await page.getByTestId("landscape-spline-apply-paint").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Spline paint applied \(\d+ tiles?\)\.$/);
  await save(page);
  const baked = savedGround(2);
  expect(baked.raised).toBeGreaterThan(20);
  expect(baked.painted).toBeGreaterThan(20);
  expect(savedSplines()[0]!.segments.map((segment) => segment.mesh)).toEqual(Array(2).fill({ enabled: true, assetId: ROAD, alignToTerrain: true, deform: true }));

  // Undo the paint, the layer, the paint switch and the deform: the exact ground; redo brings it all back.
  for (let i = 0; i < 4; i += 1) await page.getByTestId("editor-undo").click();
  await save(page);
  expect(savedGround(2)).toEqual({ raised: 0, painted: 0 });
  for (let i = 0; i < 4; i += 1) await page.getByTestId("editor-redo").click();
  await save(page);
  expect(savedGround(2)).toEqual(baked);

  // Split the first segment, close the loop.
  await page.getByTestId("landscape-spline-segment-segment-1").click();
  await page.getByTestId("landscape-spline-segment-split").click();
  await expect(page.getByTestId("landscape-spline-segment-segment-3")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("landscape-spline-close").click();
  await expect(page.getByTestId("landscape-spline-segment-segment-4")).toBeVisible();
  await save(page);
  expect([savedSplines()[0]!.points.length, savedSplines()[0]!.segments.length]).toEqual([4, 4]);

  await openEditor(page, { level: LEVEL, drawn: true });
  await named(page, "Ground").click();
  await page.getByTestId("landscape-mode").selectOption("splines");
  await expect(meshes(page)).toHaveText(/^[1-9]\d* chunks, 0 pieces, [1-9]\d* tris$/);
  await page.getByTestId("landscape-spline-spline-1").click();
  await expect(page.getByTestId("landscape-spline-segment-segment-4")).toBeVisible();
  await expect(page.getByTestId("landscape-unsaved-tiles")).toHaveText("0");

  // The game makes the same meshes from the definition.
  await page.goto(`/?level=${encodeURIComponent(LEVEL)}${WEBGL_QUERY}`);
  await page.waitForFunction(() => {
    const dev = (window as unknown as { __forgeDev?: { host(): { world: { root: { getObjectByName(name: string): { children: unknown[] } | undefined } } | null } | null } }).__forgeDev;
    return (dev?.host()?.world?.root.getObjectByName("Ground/terrain/roads")?.children.length ?? 0) > 0;
  }, undefined, { timeout: 60_000 });
  expect(errors).toEqual([]);
});
