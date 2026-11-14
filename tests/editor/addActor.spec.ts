// The Add Actor menu (plan phase 4 step 5d; INV-A11, Forge's `add-actor-menu`
// smoke): a click places at the middle of the viewport (a cube's base on the
// ground), search + Enter, a one-per-level entry selecting the one the level
// has, a class from the project (the starter pack's fog), and a drag into
// the viewport placing on the drop, each one undo step. The level is written
// into this run's temporary project copy (D14).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const LEVEL = "content/levels/add-actor-smoke";
const webgl = process.env.FORGE_EDITOR_WEBGPU === "1" ? "" : "&forceWebGL";

test.beforeAll(() => {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) throw new Error("FORGE_EDITOR_SMOKE_PROJECT is not set (the editor smoke config sets it).");
  const folder = join(project, ...LEVEL.split("/"));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "level.json"), `${JSON.stringify({ schema: "forge.level/1", id: "lvl_0000000000000000000000000000f001", settings: { cellSize: 128 }, actors: [] }, null, 2)}\n`);
});

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/?editor&level=${encodeURIComponent(LEVEL)}${webgl}`);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  await expect(page.getByTestId("forge-canvas")).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  return errors;
}

const named = (page: Page, name: string): Locator => page.getByTestId("outliner-row").filter({ has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }) });
/** Opens the hover menu and a category's flyout. */
async function category(page: Page, label: string): Promise<void> {
  await page.getByTestId("add-actor-button").hover();
  await page.locator(".add-actor-category-label", { hasText: label }).hover();
}
const undo = (page: Page) => page.getByTestId("editor-undo").click();

test("a click places at the middle of the viewport: a cube's base on the ground, a light 1,5 m up; search + Enter", async ({ page }) => {
  const errors = await open(page);
  await category(page, "Shapes");
  await page.getByTestId("add-shape-cube").click();
  await expect(named(page, "Cube")).toHaveClass(/active/);
  await expect(page.getByTestId("detail-transform.p[1]")).toHaveValue("0.25");
  await expect(page.getByTestId("detail-component-shape")).toHaveCount(1);
  await undo(page);
  await expect(named(page, "Cube")).toHaveCount(0);

  await page.getByTestId("add-actor-button").hover();
  await page.getByTestId("add-actor-search").fill("point");
  await page.getByTestId("add-actor-search").press("Enter");
  await expect(named(page, "Point Light")).toHaveClass(/active/);
  await expect(page.getByTestId("detail-transform.p[1]")).toHaveValue("1.5");
  expect(errors).toEqual([]);
});

test("one per level: a second click selects the one there is; a class from the project", async ({ page }) => {
  const errors = await open(page);
  await category(page, "Visual Effects");
  await page.locator('[data-add-key="forge.worldEnvironment"]').first().click();
  const environment = named(page, "World Environment");
  await expect(environment).toHaveClass(/active/);
  await page.getByTestId("outliner-summary").click();
  await page.keyboard.press("Escape");
  await category(page, "Visual Effects");
  await page.locator('[data-add-key="forge.worldEnvironment"]').first().click();
  await expect(environment).toHaveClass(/active/);
  await expect(page.getByTestId("editor-toast")).toContainText("already has a World Environment");
  await expect(page.getByTestId("outliner-summary")).toHaveText("1 actors (1 selected)");

  await category(page, "Classes");
  await page.locator('[data-add-key="class:ast_d01ad35f291add6b77e6eb9737e62b69"]').click();
  await expect(named(page, "Exponential Height Fog")).toHaveClass(/active/);
  await expect(page.getByTestId("detail-class")).toHaveText("Exponential Height Fog");
  expect(errors).toEqual([]);
});

test("a drag into the viewport places on the drop, one undo step", async ({ page }) => {
  const errors = await open(page);
  const canvas = page.getByTestId("forge-canvas");
  const box = (await canvas.boundingBox())!;
  await category(page, "Shapes");
  // The browser's drag as events (Forge's smoke does the same): start on the entry, over and drop on the viewport.
  const cube = page.getByTestId("add-shape-cube");
  await expect(cube).toBeVisible();
  const data = await page.evaluateHandle(() => new DataTransfer());
  const at = { clientX: box.x + box.width / 2 + 120, clientY: box.y + box.height / 2 + 60 };
  await cube.dispatchEvent("dragstart", { dataTransfer: data });
  await expect(page.getByTestId("editor-status")).toHaveText("Dragging Cube - drop in the viewport to place.");
  await canvas.dispatchEvent("dragover", { dataTransfer: data, ...at });
  // A real drag spans frames: the preview is drawn, then measured (its base) on a later drag over.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await canvas.dispatchEvent("dragover", { dataTransfer: data, ...at });
  await expect(page.getByTestId("outliner-summary")).toHaveText("0 actors (0 selected)");
  await canvas.dispatchEvent("drop", { dataTransfer: data, ...at });
  await cube.dispatchEvent("dragend", { dataTransfer: data });
  await expect(named(page, "Cube")).toHaveClass(/active/);
  await expect(page.getByTestId("outliner-summary")).toHaveText("1 actors (1 selected)");
  await expect(page.getByTestId("detail-transform.p[1]")).toHaveValue("0.25");
  await undo(page);
  await expect(page.getByTestId("outliner-summary")).toHaveText("0 actors (0 selected)");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  expect(errors).toEqual([]);
});
