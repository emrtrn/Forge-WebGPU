import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { cubeGlb } from "./glb.ts";
import { IDENTITY, openEditor, projectPath, row } from "./support.ts";

const LEVEL = "content/levels/HlodAuthoringSmoke";
const LEVEL_ID = `lvl_${"d".repeat(32)}`;
const MODEL = `ast_${"c".repeat(32)}`;
const ACTOR = `act_${"d".repeat(32)}`;
const modelFile = "content/hlod-smoke/house.glb";
const cellFile = `${LEVEL}/cells/0_0.json`;

test.beforeAll(() => {
  mkdirSync(projectPath(`${LEVEL}/cells`), { recursive: true });
  mkdirSync(projectPath("content/hlod-smoke"), { recursive: true });
  writeFileSync(projectPath(modelFile), cubeGlb(8));
  writeFileSync(projectPath(`${modelFile}.meta.json`), JSON.stringify({ schema: "forge.assetMeta/1", id: MODEL, type: "forge.model@2", license: "CC0-1.0", source: { origin: "HLOD editor smoke" }, import: {} }));
  writeFileSync(projectPath(`${LEVEL}/level.json`), JSON.stringify({ schema: "forge.level/1", id: LEVEL_ID, settings: { cellSize: 128, loadRange: 128, viewDistance: 2000 }, actors: [] }));
  writeFileSync(projectPath(cellFile), JSON.stringify({ schema: "forge.levelCell/1", level: LEVEL_ID, cell: "0_0", actors: [{
    id: ACTOR, name: "House", parent: null, class: null, spatiallyLoaded: true,
    transform: { ...IDENTITY, p: [16, 4, 16] },
    components: { mesh: { type: "forge.staticMesh@2", parent: null, local: IDENTITY, mesh: MODEL, materials: [], color: null, castShadow: true } },
  }] }));
  writeFileSync(projectPath(`${LEVEL}/cells.json`), JSON.stringify({ schema: "forge.levelCells/1", level: LEVEL_ID, persistent: "1111111111111111", cells: { "0_0": "2222222222222222" } }));
});

async function open(page: Page) {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await page.getByTestId("outliner-wp-tab").click();
  await expect(page.getByTestId("hlod-state")).toHaveAttribute("data-state", "current", { timeout: 90_000 });
  await expect(page.getByTestId("hlod-detail")).toContainText("1 proxy cells");
  return errors;
}
async function state(page: Page) {
  const response = await page.request.get(`/__forge/hlod?level=${encodeURIComponent(LEVEL)}`, { headers: { "X-Forge-Request": "1" } });
  expect(response.ok()).toBe(true); return response.json() as Promise<{ publication: string; state: string }>;
}

test("HLOD: first open generates, edits remain unsaved, Save updates proxies and keeps selection/Undo", async ({ page }) => {
  const before = readFileSync(projectPath(cellFile), "utf8");
  const errors = await open(page);
  expect(existsSync(projectPath(`${LEVEL}/hlod/0_0.glb`))).toBe(true);
  expect(readFileSync(projectPath(cellFile), "utf8")).toBe(before);
  const publication = (await state(page)).publication;
  await page.getByTestId("outliner-actors-tab").click(); await row(page, ACTOR).click();
  const x = page.getByTestId("detail-transform.p[0]"); await x.fill("24"); await x.press("Tab");
  await page.getByTestId("outliner-wp-tab").click();
  await expect(page.getByTestId("hlod-state")).toHaveAttribute("data-state", "stale");
  await expect(page.getByTestId("hlod-generate")).toHaveText("Save and Generate HLOD");
  expect(readFileSync(projectPath(cellFile), "utf8")).toBe(before);
  await page.getByTestId("editor-save").click();
  await expect.poll(async () => (await state(page)).publication, { timeout: 90_000 }).not.toBe(publication);
  await expect(page.getByTestId("hlod-state")).toHaveAttribute("data-state", "current", { timeout: 30_000 });
  await page.getByTestId("outliner-actors-tab").click();
  await expect(row(page, ACTOR)).toHaveAttribute("aria-selected", "true"); await expect(x).toHaveValue("24");
  await page.getByTestId("editor-undo").click(); await expect(x).toHaveValue("16");
  expect(errors).toEqual([]);
});

test("HLOD: auto off persists, explicit Save and Generate builds, same-GUID model changes rebuild when auto resumes", async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId("hlod-auto").uncheck();
  const publication = (await state(page)).publication;
  await page.getByTestId("outliner-actors-tab").click(); await row(page, ACTOR).click();
  const x = page.getByTestId("detail-transform.p[0]"); await x.fill("32"); await x.press("Tab");
  await page.getByTestId("outliner-wp-tab").click(); await page.getByTestId("hlod-generate").click();
  await expect.poll(async () => (await state(page)).publication, { timeout: 90_000 }).not.toBe(publication);
  await expect(page.getByTestId("hlod-state")).toHaveAttribute("data-state", "current", { timeout: 30_000 });
  await page.reload(); await expect(page.getByTestId("hlod-auto")).not.toBeChecked();
  await page.getByTestId("outliner-wp-tab").click();
  const beforeModel = (await state(page)).publication;
  writeFileSync(projectPath(modelFile), cubeGlb(10, [.2, .7, .3, 1]));
  await expect(page.getByTestId("hlod-state")).toHaveAttribute("data-state", "stale", { timeout: 30_000 });
  expect((await state(page)).publication).toBe(beforeModel);
  await page.getByTestId("hlod-auto").check();
  await expect.poll(async () => (await state(page)).publication, { timeout: 90_000 }).not.toBe(beforeModel);
  await expect(page.getByTestId("hlod-state")).toHaveAttribute("data-state", "current", { timeout: 30_000 });
  expect(errors).toEqual([]);
});
