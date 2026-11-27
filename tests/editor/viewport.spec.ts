// The editor viewport (plan phase 4 step 3): the editor's own render host and
// camera draw the level (the canvas's ready signal), the Camera menu and the
// preset keys (1 Top, 2 Front, 3 Left, 4 Perspective) switch the view and the
// menu follows either, a technical view switches to Wireframe (Forge), the
// View Mode, Show and Quality menus work, and the drawing layer runs without
// an error. Pixels are the render smoke's (real WebGPU); here the editor draws
// with WebGL forced (CI has no GPU).

import { expect, test } from "@playwright/test";
import { openEditor } from "./support.ts";

test("the viewport draws the level; Camera (and keys 1-4), View Mode, Show and Quality menus", async ({ page }) => {
  const errors = await openEditor(page, { drawn: true });
  const canvas = page.getByTestId("forge-canvas");
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
  for (const id of ["collision", "navigation"]) {
    const overlay = page.locator(`[data-show-choice="${id}"]`);
    await expect(overlay).toHaveAttribute("aria-pressed", "false");
    await overlay.click();
    await expect(overlay).toHaveAttribute("aria-pressed", "true");
  }
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

// Forge's toolbar-layout and editor-viewport-panel smokes: Stats starts closed; a narrower window
// keeps every toolbar control inside the top bar and the window, and the canvas follows the
// viewport panel (its drawing buffer too) there and back.
test("Stats starts closed; after resizing, the toolbar stays inside and the canvas follows the panel", async ({ page }) => {
  const errors = await openEditor(page, { drawn: true });
  await expect(page.locator("#debug-stats")).toHaveCount(0);
  const layout = () =>
    page.evaluate(() => {
      const box = (element: Element) => element.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number; width: number; height: number };
      const bar = box(document.querySelector(".editor-topbar")!);
      const controls = [...document.querySelectorAll(".editor-topbar button")]
        .filter((button) => (button as HTMLElement).offsetParent !== null)
        .map((button) => ({ id: (button as HTMLElement).dataset.testid ?? button.textContent ?? "", ...box(button) }));
      // The canvas fills the panel inside its border: its client box.
      const panel = document.querySelector<HTMLElement>(".editor-viewport-host")!;
      const host = { width: panel.clientWidth, height: panel.clientHeight };
      const view = document.querySelector<HTMLCanvasElement>('[data-testid="forge-canvas"]')!;
      return { width: window.innerWidth, bar, controls, host, canvas: box(view), buffer: view.width / Math.max(1, view.clientWidth) };
    });
  const check = async (): Promise<void> => {
    await expect
      .poll(async () => {
        const now = await layout();
        const outside = now.controls.filter((control) => control.left < now.bar.left - 0.5 || control.right > Math.min(now.bar.right, now.width) + 0.5).map((control) => control.id);
        const fits = Math.abs(now.canvas.width - now.host.width) < 1 && Math.abs(now.canvas.height - now.host.height) < 1;
        return { outside, fits };
      })
      .toEqual({ outside: [], fits: true });
  };
  await check();
  const before = await layout();
  await page.setViewportSize({ width: 1100, height: 700 });
  await check();
  const narrow = await layout();
  expect(narrow.canvas.width).toBeLessThan(before.canvas.width);
  await expect.poll(async () => Math.abs((await layout()).buffer - before.buffer)).toBeLessThan(0.02);
  await page.setViewportSize({ width: 1600, height: 900 });
  await check();
  await expect.poll(async () => Math.abs((await layout()).canvas.width - before.canvas.width)).toBeLessThan(1);
  expect(errors).toEqual([]);
});
