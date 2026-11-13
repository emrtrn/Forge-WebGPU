// The level viewer's default camera on the real page (plan phase 3 step 8):
// holding W moves the view, a right-drag turns it. Checked by how far the
// drawn image changes, L03 at its smoke pose: a still view is not byte-stable
// (ambient occlusion and grain noise), so a change must stand well clear of
// the difference between two still frames. The image itself is not compared.

import { expect, test, type Page } from "@playwright/test";
import { SMOKE_SCENES } from "./renderScenes.ts";
import { openSmokeLevel } from "./smokePage.ts";

const L03 = SMOKE_SCENES.find((scene) => scene.id === "l03")!;
/** A camera change differs from a still frame at least this many times the still noise, and by this much (0 - 255). */
const NOISE_FACTOR = 4;
const MIN_CHANGE = 1;

/** Mean absolute luminance difference of two PNG shots, 0 - 255. */
async function difference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([first, second]) => {
    const pixels = async (base64: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const [x, y] = [await pixels(first), await pixels(second)];
    let sum = 0;
    for (let index = 0; index < x.length; index += 4) {
      const lx = 0.2126 * x[index]! + 0.7152 * x[index + 1]! + 0.0722 * x[index + 2]!;
      const ly = 0.2126 * y[index]! + 0.7152 * y[index + 1]! + 0.0722 * y[index + 2]!;
      sum += Math.abs(lx - ly);
    }
    return sum / (x.length / 4);
  }, [a.toString("base64"), b.toString("base64")] as const);
}

test("viewer camera: W moves the view, a right-drag turns it", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openSmokeLevel(page, L03.level, L03.poses[0]!);
  const viewport = page.viewportSize()!;
  const shot = () => page.screenshot({ clip: { x: 0, y: 0, width: viewport.width, height: viewport.height } });
  await page.waitForTimeout(600);
  const still = await shot();
  const noise = await difference(page, still, await shot());
  const threshold = Math.max(MIN_CHANGE, noise * NOISE_FACTOR);

  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(400);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(300);
  const moved = await shot();
  expect(await difference(page, still, moved), `W moved the camera (still noise ${noise.toFixed(3)})`).toBeGreaterThan(threshold);

  await page.mouse.down({ button: "right" });
  await page.mouse.move(viewport.width / 2 + 200, viewport.height / 2, { steps: 10 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(300);
  const turned = await shot();
  expect(await difference(page, moved, turned), `a right-drag turned the camera (still noise ${noise.toFixed(3)})`).toBeGreaterThan(threshold);
  expect(pageErrors).toEqual([]);
});

test("?debug: the readout reports the frame, the pipeline and the scene cost; Scene cost opens its table", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const derekavak = SMOKE_SCENES.find((scene) => scene.id === "derekavak")!;
  await openSmokeLevel(page, derekavak.level, derekavak.poses[0]!, "&debug");
  const readout = page.locator("#debug-stats-readout");
  await expect(readout).toContainText("draw calls", { timeout: 10_000 });
  await expect(readout).toContainText("gpu ");
  await expect(readout).toContainText("pipeline scene");
  await expect(readout).toContainText("shadow casters");
  await expect(readout).toContainText("terrain");
  await page.locator("[data-forge-debug-action='scene-cost']").click();
  const table = page.locator(".forge-debug-table[data-forge-debug-table='Scene cost']");
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr")).not.toHaveCount(0);
  await expect(table).toContainText("staticMesh");
  expect(pageErrors).toEqual([]);
});
