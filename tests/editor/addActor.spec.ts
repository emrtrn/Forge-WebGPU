// The Add Actor menu (plan phase 4 step 5d; INV-A11, Forge's `add-actor-menu`
// smoke): a click places at the middle of the viewport (a cube's base on the
// ground), search + Enter, a one-per-level entry selecting the one the level
// has, a class from the project (one this run writes: the starter pack's fog
// is offered only under Visual Effects), and a drag into
// the viewport placing on the drop, each one undo step. The level is written
// into this run's temporary project copy (D14).

import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { named, openEditor, projectPath, shape, writeLevel } from "./support.ts";

const LEVEL = "content/levels/add-actor-smoke";
const CRATE = "ast_0000000000000000000000000000c7a7";
const FOG_CLASS = "ast_d01ad35f291add6b77e6eb9737e62b69";

test.beforeAll(() => {
  writeLevel(LEVEL, "lvl_0000000000000000000000000000f001", []);
  mkdirSync(projectPath("content/add-actor-smoke"), { recursive: true });
  writeFileSync(projectPath("content/add-actor-smoke/crate.actor.json"), JSON.stringify({
    schema: "forge.actorClass/1", id: CRATE, name: "Smoke Crate", components: { shape: shape() },
  }));
});

async function open(page: Page): Promise<string[]> {
  return openEditor(page, { level: LEVEL, drawn: true });
}

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

test("a puddle: placed 5 cm above the drop, its Details from the schema with the fill's outcome below", async ({ page }) => {
  const errors = await open(page);
  await category(page, "Visual Effects");
  await page.locator('[data-add-key="forge.puddle"]').first().click();
  await expect(named(page, "Puddle")).toHaveClass(/active/);
  await expect(page.getByTestId("detail-transform.p[1]")).toHaveValue("0.05");
  const section = page.getByTestId("detail-component-puddle");
  await expect(section).toContainText("Working Area (m)");
  await expect(section).toContainText("Reflection Mode");
  // The starter level has no terrain: the binding says so, through Details.
  await expect(page.getByTestId("puddle-status")).toHaveAttribute("data-puddle-status", "no-terrain");
  await undo(page);
  await expect(named(page, "Puddle")).toHaveCount(0);
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
  // The fog's class is offered only under Visual Effects.
  await expect(page.locator(`[data-add-key="class:${FOG_CLASS}"]`)).toHaveCount(0);
  await page.locator(`[data-add-key="class:${CRATE}"]`).click();
  await expect(named(page, "Smoke Crate")).toHaveClass(/active/);
  await expect(page.getByTestId("detail-class")).toHaveText("Smoke Crate");
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

// Forge's add-actor-menu smoke: in a narrow window the menu stays open while the pointer travels
// from the button to a category and on into its flyout, and the entry there places.
test("a narrow window: the menu stays open from the button to a category's flyout, and the entry places", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  const errors = await open(page);
  const centre = async (locator: Locator): Promise<[number, number]> => {
    const box = (await locator.boundingBox())!;
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  await page.getByTestId("add-actor-button").hover();
  const label = page.locator(".add-actor-category-label", { hasText: "Shapes" });
  await expect(label).toBeVisible();
  const [lx, ly] = await centre(label);
  await page.mouse.move(lx, ly, { steps: 12 });
  const cube = page.getByTestId("add-shape-cube");
  await expect(cube).toBeVisible();
  const [cx, cy] = await centre(cube);
  expect(cx).toBeLessThan(1100);
  await page.mouse.move(cx, cy, { steps: 12 });
  await expect(cube).toBeVisible();
  await page.mouse.click(cx, cy);
  await expect(named(page, "Cube")).toHaveClass(/active/);
  expect(errors).toEqual([]);
});
