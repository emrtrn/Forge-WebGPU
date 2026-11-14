// The editor viewport (plan phase 4 step 3): the editor's own render host and
// camera draw the level (the canvas's ready signal), the Camera menu and the
// preset keys (1 Top, 2 Front, 3 Left, 4 Perspective) switch the view and the
// menu follows either, a technical view switches to Wireframe (Forge), the
// View Mode, Show and Quality menus work, and the drawing layer runs without
// an error. Pixels are the render smoke's (real WebGPU); here the editor draws
// with WebGL forced (CI has no GPU).

import { expect, test } from "@playwright/test";

const QUERY = process.env.FORGE_EDITOR_WEBGPU === "1" ? "/?editor" : "/?editor&forceWebGL";

test("the viewport draws the level; Camera (and keys 1-4), View Mode, Show and Quality menus", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(QUERY);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  const canvas = page.getByTestId("forge-canvas");
  await expect(canvas).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  await expect(canvas).toHaveAttribute("data-forge-resource-errors", "0");

  const camera = page.getByTestId("camera-button");
  await expect(camera).toHaveText("Perspective");
  await page.locator("body").press("Digit1");
  await expect(camera).toHaveText("Top");
  await page.locator("body").press("Digit2");
  await expect(camera).toHaveText("Front");
  await page.locator("body").press("Digit3");
  await expect(camera).toHaveText("Left");

  await camera.hover();
  const perspective = page.locator('[data-camera-choice="perspective"]');
  await expect(perspective).toBeVisible();
  await perspective.click();
  await expect(camera).toHaveText("Perspective");
  await expect(perspective).toHaveClass(/active/);

  // Forge: a technical view reads as Wireframe, Perspective comes back Lit.
  const mode = page.getByTestId("viewmode-button");
  await expect(mode).toHaveText("Lit");
  await page.locator("body").press("Digit1");
  await expect(mode).toHaveText("Wireframe");
  await page.locator("body").press("Digit4");
  await expect(mode).toHaveText("Lit");
  await mode.hover();
  await page.locator('[data-viewmode-choice="wireframe"]').click();
  await expect(mode).toHaveText("Wireframe");
  await page.waitForTimeout(300);
  await mode.hover();
  await page.locator('[data-viewmode-choice="lit"]').click();
  await expect(mode).toHaveText("Lit");

  // Show: Grid is on and toggles; Stats opens the ?debug panel inside the viewport.
  await page.getByTestId("show-button").hover();
  const grid = page.locator('[data-show-choice="grid"]');
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await grid.click();
  await expect(grid).toHaveAttribute("aria-pressed", "false");
  await grid.click();
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-show-choice="stats"]').click();
  await expect(page.locator(".editor-viewport-host #debug-stats")).toBeVisible();
  await expect(page.locator("#debug-stats-readout")).toContainText(/\S/);
  await page.locator('[data-show-choice="stats"]').click();
  await expect(page.locator("#debug-stats")).toHaveCount(0);

  // Quality: a profile is the player's manual choice (the game page reads the same settings).
  const quality = page.getByTestId("quality-button");
  await expect(quality).toHaveText("Quality: Auto");
  await quality.hover();
  await page.locator('[data-quality-choice="high"]').click();
  await expect(quality).toHaveText("Quality: High");
  const graphics = await page.evaluate(() => JSON.parse(localStorage.getItem("forge.userSettings") ?? "null")?.payload?.graphics ?? null);
  expect(graphics).toMatchObject({ selectedQualityLevel: "high", manuallySelected: true });

  // A few frames in every view, then no error.
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
