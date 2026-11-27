// The level viewer's default camera on the real page (plan phase 3 step 8):
// holding W moves the view, a right-drag turns it. Checked by how far the
// drawn image changes, L03 at its smoke pose: a still view is not byte-stable
// (ambient occlusion and grain noise), so a change must stand well clear of
// the difference between two still frames. The image itself is not compared.

import { expect, test } from "@playwright/test";
import { SMOKE_SCENES } from "./renderScenes.ts";
import { difference, openSmokeLevel } from "./smokePage.ts";

const L03 = SMOKE_SCENES.find((scene) => scene.id === "l03")!;
/** A camera change differs from a still frame at least this many times the still noise, and by this much (0 - 255). */
const NOISE_FACTOR = 4;
const MIN_CHANGE = 1;


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
  // Derekavak streams (phase 5a step 4): Forge's streaming lines and the tile map, one square per tile.
  await expect(readout).toContainText(/terrain streaming: loaded:\d+ active:\d+ queued:0 physics:[1-9]\d*/);
  const map = page.locator(".forge-debug-panel-map");
  await expect(map).toBeVisible();
  const tally: Record<string, number> = Object.fromEntries(
    (await map.getAttribute("data-tiles"))!.split(" ").map((entry) => [entry.split(":")[0], Number(entry.split(":")[1])]),
  );
  expect(Object.values(tally).reduce((sum, count) => sum + count, 0)).toBe(64);
  expect(tally.active).toBeGreaterThan(0);
  expect(tally.unloaded).toBeGreaterThan(0);
  await page.locator("[data-forge-debug-action='scene-cost']").click();
  const table = page.locator(".forge-debug-table[data-forge-debug-table='Scene cost']");
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr")).not.toHaveCount(0);
  await expect(table).toContainText("staticMesh");
  expect(pageErrors).toEqual([]);
});
