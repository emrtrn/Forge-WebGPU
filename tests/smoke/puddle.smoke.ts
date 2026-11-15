// The puddle on the real GPU (plan phase 5a step 6; user decision 2026-11-15:
// the reference content has no puddle, so the smoke adds one through the
// development hooks and leaves the reference project alone).
//
// At Derekavak's first Phase 0 pose a basin is found on the terrain ahead of
// the camera (the lowest point of a 1 m grid, followed until it is inside the
// grid), the deepest puddle it holds of 20, 10, 5 and 2.5 cm is spawned there, and:
// - its fill is ready, with a wet area;
// - the drawn image changes well beyond the still frame's noise;
// - its planar reflection renders the scene again (the frame's draw calls grow);
// - nothing errors on the page.
// A close look is attached and written to render-refs/candidates/ for the eye;
// no reference image is compared.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Quaternion, Vector3 } from "three";
import { RENDER_REFS, SMOKE_SCENES } from "./renderScenes.ts";
import { difference, openSmokeLevel } from "./smokePage.ts";

interface Dev {
  spawn(raw: unknown[]): string[];
  terrainHeights(points: [number, number][]): Promise<(number | null)[]>;
  puddleResult(actor: string): Promise<{ status: string; area: number; message: string } | undefined>;
}

const dev = (page: Page) => ({
  heights: (points: [number, number][]) => page.evaluate((list) => (window as unknown as { __forgeDev: Dev }).__forgeDev.terrainHeights(list), points),
  spawn: (raw: unknown[]) => page.evaluate((list) => (window as unknown as { __forgeDev: Dev }).__forgeDev.spawn(list), raw),
  result: (actor: string) => page.evaluate((id) => (window as unknown as { __forgeDev: Dev }).__forgeDev.puddleResult(id), actor),
});

/** Draw calls in the `?debug` readout. */
async function drawCalls(page: Page): Promise<number> {
  const text = (await page.locator("#debug-stats-readout").textContent()) ?? "";
  const match = /([\d,.\s]+) draw calls/.exec(text);
  return match ? Number(match[1]!.replace(/[^\d]/g, "")) : NaN;
}

/** The lowest point of a 1 m grid around `centre`, followed until it is inside the grid. */
async function findBasin(page: Page, centre: [number, number]): Promise<{ x: number; z: number; y: number }> {
  const half = 16;
  let [cx, cz] = [Math.round(centre[0]), Math.round(centre[1])];
  for (let round = 0; round < 8; round += 1) {
    const points: [number, number][] = [];
    for (let dz = -half; dz <= half; dz += 1) for (let dx = -half; dx <= half; dx += 1) points.push([cx + dx, cz + dz]);
    const heights = await dev(page).heights(points);
    let best = -1;
    heights.forEach((h, i) => {
      if (h !== null && (best < 0 || h < heights[best]!)) best = i;
    });
    expect(best, "the terrain ahead is loaded").toBeGreaterThanOrEqual(0);
    const [x, z] = points[best]!;
    if (Math.abs(x - cx) < half && Math.abs(z - cz) < half) return { x, z, y: heights[best]! };
    [cx, cz] = [x, z];
  }
  throw new Error("no basin found ahead of the camera");
}

test("puddle: a basin ahead of the camera fills, draws and reflects the scene", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  const pose = scene.poses[0]!;
  const opened = await openSmokeLevel(page, scene.level, pose);
  const camera = opened.cameraPose!;
  const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(...camera.quaternion));
  forward.y = 0;
  forward.normalize();
  const basin = await findBasin(page, [camera.position[0] + forward.x * 20, camera.position[2] + forward.z * 20]);
  // Opened again looking at the basin from 16 m away and 9 m up, the way it came.
  const eye: [number, number, number] = [basin.x - forward.x * 16, basin.y + 9, basin.z - forward.z * 16];
  await openSmokeLevel(page, scene.level, { id: "basin", position: eye, target: [basin.x, basin.y, basin.z] }, "&debug");

  const viewport = page.viewportSize()!;
  const shot = () => page.screenshot({ clip: { x: 0, y: 0, width: viewport.width, height: viewport.height } });
  await page.waitForTimeout(800);
  const still = await shot();
  const noise = await difference(page, still, await shot());
  const callsBefore = await drawCalls(page);

  // The deepest of 20, 10, 5 and 2.5 cm the basin holds (deeper ones overflow its rim: Forge's open boundary, nothing drawn).
  let result: { status: string; area: number; message: string } | undefined;
  for (const [index, depth] of [0.2, 0.1, 0.05, 0.025].entries()) {
    const [id] = await dev(page).spawn([{
      id: `act_${"0".repeat(30)}${(0xa0 + index).toString(16)}`,
      name: `Smoke Puddle ${depth}`,
      class: null,
      parent: null,
      spatiallyLoaded: true,
      transform: { p: [basin.x, basin.y + depth, basin.z], r: [0, 0, 0, 1], s: [1, 1, 1] },
      components: { puddle: { type: "forge.puddle@1", size: 32, reflectionQuality: "high" } },
    }]);
    await expect.poll(async () => (await dev(page).result(id!))?.status, { timeout: 30_000 }).not.toBe("loading");
    result = (await dev(page).result(id!))!;
    console.log(`puddle at ${basin.x}, ${basin.z} (bed ${basin.y.toFixed(2)} m) ${depth} m deep: ${result.status}, ${result.area.toFixed(2)} m², ${result.message}`);
    if (result.status === "ready") break;
  }
  expect(result!.status).toBe("ready");
  expect(result!.area).toBeGreaterThan(1);

  // The readout is rebuilt every 0.5 s.
  await page.waitForTimeout(1200);
  const drawn = await shot();
  const change = await difference(page, still, drawn);
  const callsAfter = await drawCalls(page);
  await testInfo.attach("puddle.png", { body: drawn, contentType: "image/png" });
  // For the eye only: never a reference.
  mkdirSync(join(RENDER_REFS, "candidates"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "candidates", "puddle-derekavak.png"), drawn);
  console.log(`image change ${change.toFixed(3)} (still noise ${noise.toFixed(3)}); draw calls ${callsBefore} -> ${callsAfter}`);
  expect(change, "the puddle is drawn").toBeGreaterThan(Math.max(0.05, noise * 4));
  expect(callsAfter - callsBefore, "the planar reflection draws the scene again").toBeGreaterThan(10);
  expect(pageErrors).toEqual([]);
});
