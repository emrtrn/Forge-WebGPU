// The editor viewport (plan phase 4 step 3): the editor's own render host and
// camera draw the level (the canvas's ready signal), the Camera menu and the
// preset keys (1 Top, 2 Front, 3 Left, 4 Perspective) switch the view and the
// menu follows either, and the drawing layer runs without an error. Pixels
// are the render smoke's (real WebGPU); here the editor draws with WebGL
// forced (CI has no GPU).

import { expect, test } from "@playwright/test";

const QUERY = process.env.FORGE_EDITOR_WEBGPU === "1" ? "/?editor" : "/?editor&forceWebGL";

test("the viewport draws the level; the Camera menu and the 1-4 keys switch the view", async ({ page }) => {
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

  // A few frames in every view, then no error.
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
