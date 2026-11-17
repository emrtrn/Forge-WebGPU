import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Document as GltfDocument, NodeIO } from "@gltf-transform/core";
import { IDENTITY, openEditor, projectPath, row, shape } from "./support.ts";

const LEVEL = "content/levels/StreamingSmoke";
const LEVEL_ID = `lvl_${"e".repeat(32)}`;
const NEAR = `act_${"a".repeat(32)}`, FAR = `act_${"b".repeat(32)}`;

// These fixtures test streaming and deliberately stale hand-written proxies.
// Production generation has its own end-to-end acceptance in hlod.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((level) => localStorage.setItem(`forge.editor.hlod.auto:Starter/${level}`, "false"), LEVEL);
});

test.beforeAll(() => {
  const folder = projectPath(LEVEL); mkdirSync(join(folder, "cells"), { recursive: true });
  writeFileSync(join(folder, "level.json"), JSON.stringify({ schema: "forge.level/1", id: LEVEL_ID, settings: { cellSize: 128, loadRange: 128, viewDistance: 3000 }, actors: [] }));
  for (const [key, id, x, name] of [["0_0", NEAR, 10, "Near"], ["10_0", FAR, 1300, "Far"]] as const) {
    writeFileSync(join(folder, "cells", `${key}.json`), JSON.stringify({ schema: "forge.levelCell/1", level: LEVEL_ID, cell: key, actors: [
      { id, name, parent: null, class: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [x, 1, 10] }, components: { shape: shape() } },
    ] }));
  }
  writeFileSync(join(folder, "cells.json"), JSON.stringify({ schema: "forge.levelCells/1", level: LEVEL_ID, persistent: "1111111111111111", cells: { "0_0": "2222222222222222", "10_0": "3333333333333333" } }));
});

async function focus(page: Page, x: number, z: number) {
  await page.getByTestId("outliner-wp-tab").click();
  const map = page.getByTestId("world-partition-map");
  await expect(map).toHaveAttribute("data-world-frame", /minX/);
  const frame = JSON.parse((await map.getAttribute("data-world-frame"))!) as { minX: number; maxX: number; minZ: number; maxZ: number };
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: (x - frame.minX) / (frame.maxX - frame.minX) * box.width, y: (z - frame.minZ) / (frame.maxZ - frame.minZ) * box.height } });
}

test("A11 editor: camera streams cells, dirty cell stays, save unloads and reopening reads the saved change", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await expect(row(page, NEAR)).toBeVisible(); await expect(row(page, FAR)).toHaveCount(0);
  await expect(row(page, NEAR)).toHaveAttribute("data-cell", "0_0");
  await row(page, NEAR).click();
  const name = page.getByTestId("detail-name"); await name.fill("Near edited"); await name.press("Tab");
  await focus(page, 1300, 10);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-forge-cells", /"key":"10_0","loaded":true/, { timeout: 30_000 });
  await expect(page.getByTestId("wp-cell").filter({ hasText: /^0_0/ })).toHaveAttribute("data-dirty", "true");
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved /);
  await expect(page.getByTestId("wp-cell").filter({ hasText: /^0_0/ })).toHaveAttribute("data-loaded", "false");
  const stored = JSON.parse(readFileSync(projectPath(`${LEVEL}/cells/0_0.json`), "utf8"));
  expect(stored.actors[0].name).toBe("Near edited");
  await focus(page, 10, 10); await page.getByTestId("outliner-actors-tab").click();
  await expect(row(page, NEAR)).toContainText("Near edited"); await expect(row(page, FAR)).toHaveCount(0);
  await page.reload(); await expect(row(page, NEAR)).toContainText("Near edited", { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("World Partition: explicit Load holds an unloaded cell; Release and Unload remove it, search and HLOD status stay usable", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await page.getByTestId("outliner-wp-tab").click();
  await page.getByTestId("wp-cell-search").fill("10_0");
  const cell = page.getByTestId("wp-cell").filter({ hasText: /^10_0/ });
  await cell.locator('input[type="checkbox"]').check();
  await page.getByTestId("wp-load").click();
  await expect(cell).toHaveAttribute("data-loaded", "true"); await expect(cell).toHaveAttribute("data-held", "true");
  await expect(page.getByTestId("world-partition-panel")).toContainText("index missing");
  await page.getByTestId("wp-unload").click();
  await expect(cell).toHaveAttribute("data-loaded", "false"); await expect(cell).toHaveAttribute("data-held", "false");
  await page.screenshot({ path: ".forge-cache/phase5b/editor-partition.png" });
  expect(errors).toEqual([]);
});

test("editor HLOD: an unloaded cell draws its proxy, Load hides it and reports a stale source", async ({ page }) => {
  const gltf = new GltfDocument(), buffer = gltf.createBuffer();
  const position = gltf.createAccessor().setType("VEC3").setArray(new Float32Array([1280, 0, 0, 1408, 0, 0, 1344, 100, 0])).setBuffer(buffer);
  const color = gltf.createAccessor().setType("VEC3").setArray(new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0])).setBuffer(buffer);
  const primitive = gltf.createPrimitive().setAttribute("POSITION", position).setAttribute("COLOR_0", color);
  gltf.createScene().addChild(gltf.createNode().setMesh(gltf.createMesh().addPrimitive(primitive)));
  mkdirSync(projectPath(`${LEVEL}/hlod`), { recursive: true });
  writeFileSync(projectPath(`${LEVEL}/hlod/10_0.glb`), await new NodeIO().writeBinary(gltf));
  writeFileSync(projectPath(`${LEVEL}/hlod.json`), JSON.stringify({ schema: "forge.levelHlod/1", level: LEVEL_ID, cellSize: 128, cells: [{ key: "10_0", triangles: 1, sourceHash: "deadbeef" }] }));
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  const canvas = page.getByTestId("forge-canvas");
  await expect(canvas).toHaveAttribute("data-forge-hlod", /"visible":1/);
  await page.getByTestId("outliner-wp-tab").click(); await page.getByTestId("wp-cell-search").fill("10_0");
  await page.getByTestId("wp-cell").filter({ hasText: /^10_0/ }).locator("input").check(); await page.getByTestId("wp-load").click();
  await expect(canvas).toHaveAttribute("data-forge-hlod", /"visible":0/);
  await expect(page.getByTestId("world-partition-panel")).toContainText("1 known stale cells: 10_0");
  await page.getByTestId("wp-unload").click(); await expect(canvas).toHaveAttribute("data-forge-hlod", /"visible":1/);
  expect(errors).toEqual([]);
});
