// Details from the schema (plan phase 4 step 5b; INV-A13, A14; Forge's
// `details-panel` smoke and the multi-selection intents): a component's form,
// Add / Remove Component, several actors with "Multiple Values" and one undo
// step for an edit of all, a class actor's override with its reset arrow and
// Reset All, a slider drag as one undo step, and the transform fields
// following a gizmo drag before the release. The level is written into this
// run's temporary project copy (D14); the class is the starter pack's
// Exponential Height Fog.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const LEVEL = "content/levels/details-smoke";
const id = (n: number): string => `act_${n.toString(16).padStart(32, "0")}`;
const CUBE_A = id(0xd1);
const CUBE_B = id(0xd2);
const FOG = id(0xd3);
const FOG_CLASS = "ast_d01ad35f291add6b77e6eb9737e62b69";
const IDENTITY = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
const webgl = process.env.FORGE_EDITOR_WEBGPU === "1" ? "" : "&forceWebGL";

const cube = (actorId: string, name: string, x: number, color: string) => ({
  id: actorId,
  name,
  class: null,
  parent: null,
  spatiallyLoaded: false,
  transform: { p: [x, 1, 0], r: [0, 0, 0, 1], s: [2, 2, 2] },
  components: { shape: { type: "forge.shape@2", parent: null, local: IDENTITY, primitive: "cube", color, castShadow: true, collision: true } },
});

test.beforeAll(() => {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) throw new Error("FORGE_EDITOR_SMOKE_PROJECT is not set (the editor smoke config sets it).");
  const folder = join(project, ...LEVEL.split("/"));
  mkdirSync(folder, { recursive: true });
  const actors = [
    cube(CUBE_A, "Cube A", 0, "#c8c8c8"),
    cube(CUBE_B, "Cube B", 3, "#ff0000"),
    { id: FOG, name: "Fog", class: FOG_CLASS, parent: null, spatiallyLoaded: false, transform: IDENTITY, overrides: { fog: { type: "forge.heightFog@1", density: 0.001 } } },
  ];
  writeFileSync(join(folder, "level.json"), `${JSON.stringify({ schema: "forge.level/1", id: "lvl_0000000000000000000000000000d001", settings: { cellSize: 128 }, actors }, null, 2)}\n`);
});

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/?editor&level=${encodeURIComponent(LEVEL)}${webgl}`);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  return errors;
}

const row = (page: Page, actorId: string): Locator => page.locator(`[data-testid="outliner-row"][data-actor-id="${actorId}"]`);
const undo = (page: Page) => page.getByTestId("editor-undo").click();

test("a plain actor: its component's form, Remove and Add Component, each one undo step", async ({ page }) => {
  const errors = await open(page);
  await row(page, CUBE_A).click();
  await expect(page.getByTestId("detail-name")).toHaveValue("Cube A");
  await expect(page.getByTestId("detail-class")).toHaveText("None");
  const primitive = page.getByTestId("detail-shape-primitive");
  await primitive.selectOption("sphere");
  await expect(row(page, CUBE_A).locator(".outliner-kind")).toHaveAttribute("data-icon", "shapeSphere");
  await undo(page);
  await expect(primitive).toHaveValue("cube");

  await page.getByTestId("detail-component-shape-remove").click();
  await expect(page.getByTestId("detail-component-shape")).toHaveCount(0);
  await undo(page);
  await expect(page.getByTestId("detail-component-shape")).toHaveCount(1);

  await page.getByTestId("detail-add-component").click();
  const picker = page.getByTestId("component-picker");
  await picker.getByRole("searchbox").fill("point");
  await picker.locator('[data-testid="component-picker-item"][data-id="forge.pointLight"]').click();
  await expect(page.getByTestId("detail-component-pointLight")).toHaveCount(1);
  await expect(page.getByTestId("detail-pointLight-local.p[0]")).toHaveValue("0");
  // A singleton the level already has (the fog's class) cannot be added; Escape closes the list.
  await page.getByTestId("detail-add-component").click();
  await expect(picker.locator('[data-id="forge.heightFog"]')).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await undo(page);
  await expect(page.getByTestId("detail-component-pointLight")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("several actors: shared fields, Multiple Values, one field written to all in one undo step", async ({ page }) => {
  const errors = await open(page);
  await row(page, CUBE_A).click();
  await row(page, CUBE_B).click({ modifiers: ["Control"] });
  await expect(page.getByTestId("detail-name")).toBeDisabled();
  const x = page.getByTestId("detail-transform.p[0]");
  const y = page.getByTestId("detail-transform.p[1]");
  await expect(x).toHaveValue("");
  await expect(x).toHaveAttribute("placeholder", "—");
  await expect(y).toHaveValue("1");
  await expect(page.locator('[data-testid="detail-shape-color"]').locator("xpath=..")).toHaveClass(/is-mixed/);

  await y.fill("4");
  await y.press("Enter");
  await expect(y).toHaveValue("4");
  await expect(x).toHaveValue("");
  await row(page, CUBE_B).click();
  await expect(y).toHaveValue("4");
  await expect(x).toHaveValue("3");
  await undo(page);
  await expect(y).toHaveValue("1");
  await row(page, CUBE_A).click();
  await expect(y).toHaveValue("1");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("a class actor: an override with its reset arrow, Reset All, and a slider drag as one undo step", async ({ page }) => {
  const errors = await open(page);
  await row(page, FOG).click();
  await expect(page.getByTestId("detail-class")).toHaveText("Exponential Height Fog");
  await expect(page.getByTestId("detail-component-fog-remove")).toHaveCount(0);
  await expect(page.getByTestId("detail-add-component")).toHaveCount(0);
  const density = page.getByTestId("detail-fog-density");
  await expect(density).toHaveValue("0.001");
  await expect(page.getByTestId("detail-fog-density-reset")).toBeVisible();

  // The slider moves (input, input, input) then lands (change): one undo step back to the override.
  await page.getByTestId("detail-fog-density-slider").evaluate((slider) => {
    const input = slider as HTMLInputElement;
    for (const value of ["0.0012", "0.0015", "0.0018"]) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(density).toHaveValue("0.0018");
  await undo(page);
  await expect(density).toHaveValue("0.001");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();

  await page.getByTestId("detail-fog-density-reset").click();
  await expect(density).toHaveValue("0.0008");
  await expect(page.getByTestId("detail-fog-density-reset")).toHaveCount(0);
  await expect(page.getByTestId("detail-component-fog-reset-all")).toHaveCount(0);
  await undo(page);
  await expect(page.getByTestId("detail-component-fog-reset-all")).toBeVisible();
  await page.getByTestId("detail-component-fog-reset-all").click();
  await expect(density).toHaveValue("0.0008");
  expect(errors).toEqual([]);
});

test("the transform fields follow a gizmo drag before the release", async ({ page }) => {
  const errors = await open(page);
  const canvas = page.getByTestId("forge-canvas");
  await expect(canvas).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  await row(page, CUBE_A).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let notch = 0; notch < 4; notch += 1) await page.mouse.wheel(0, 300);
  await expect(canvas).toHaveAttribute("data-forge-gizmo", /move:x/);
  const points = JSON.parse((await canvas.getAttribute("data-forge-gizmo"))!) as Record<string, [number, number]>;
  const [ox, oy] = points.origin!;
  const [hx, hy] = points["move:x"]!;
  const length = Math.hypot(hx - ox, hy - oy);
  const x = page.getByTestId("detail-transform.p[0]");
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(hx + ((hx - ox) / length) * 30 * step, hy + ((hy - oy) / length) * 30 * step);
  await expect(x).not.toHaveValue("0");
  const during = await x.inputValue();
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  await page.mouse.up();
  await expect(x).toHaveValue(during);
  await expect(page.getByTestId("editor-undo")).toBeEnabled();
  expect(errors).toEqual([]);
});
