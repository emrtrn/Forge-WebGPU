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
// - in rain its water takes rain rings (plan phase W6: ring strength 2 moves
//   it more than 0 under the same rain and wind), and rain and ring settings
//   compile nothing (WebGPU pipelines +0);
// - nothing errors on the page.
// A close look is attached and written to render-refs/candidates/ for the eye;
// no reference image is compared.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Quaternion, Vector3 } from "three";
import sharp from "sharp";
import { gpuMemory, installGpuMemory } from "./gpuMemory.ts";
import { RENDER_REFS, SMOKE_SCENES } from "./renderScenes.ts";
import { difference, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface Dev {
  pause(): void;
  step(ms: number): Promise<unknown>;
  spawn(raw: unknown[]): string[];
  terrainHeights(points: [number, number][]): Promise<(number | null)[]>;
  puddleResult(actor: string): Promise<{ status: string; area: number; message: string } | undefined>;
  environmentState(): unknown;
  setWeather(preset: string, intensity: number): void;
  setSurfaceSettings(settings: Record<string, number>): void;
  setLateVisible(visible: boolean): void;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
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
  page.on("console", (message) => { if (message.type() === "warning" && message.text().includes("puddle")) console.log(message.text()); });
  const gpuErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) gpuErrors.push(`${message.text()} (${message.location().url})`); });
  // A test-only repeating normal: exercise the actual texture loader and
  // both TSL wind samples without adding assets to the reference project.
  const normalId = "ast_fffffffffffffffffffffffffffffff7";
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
    const i = (y * 32 + x) * 4;
    pixels[i] = 128 + Math.round(Math.sin(x * Math.PI / 4) * 30);
    pixels[i + 1] = 128 + Math.round(Math.cos(y * Math.PI / 4) * 30);
    pixels[i + 2] = 250;
    pixels[i + 3] = 255;
  }
  const normal = await sharp(pixels, { raw: { width: 32, height: 32, channels: 4 } }).png().toBuffer();
  let normalRequests = 0;
  await page.route("**/__forge/asset-files", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.assets[normalId] = { type: "forge.texture", file: "project/smoke-puddle-normal.png", import: { mipmaps: true } };
    await route.fulfill({ response, json: body });
  });
  await page.route(/\/__forge\/read\?path=.*smoke-puddle-normal\.png/, async (route) => {
    normalRequests += 1;
    await route.fulfill({ contentType: "image/png", body: normal });
  });
  await installGpuMemory(page);
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
      components: { puddle: { type: "forge.puddle@1", size: 32, followWeather: false, reflectionQuality: "high", windNormal: normalId, windNormalStrength: .2 } },
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
  console.log(`image change ${change.toFixed(3)} (still noise ${noise.toFixed(3)}); draw calls ${callsBefore} -> ${callsAfter}`);
  expect(change, "the puddle is drawn").toBeGreaterThan(Math.max(0.05, noise * 4));
  expect(callsAfter - callsBefore, "the planar reflection draws the scene again").toBeGreaterThan(10);
  expect(normalRequests, "the wind normal was requested and sampled by the water").toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.pause());
  // pause holds the *next* request; allow the already queued rAF to finish.
  await page.waitForTimeout(200);
  const waterShot = () => page.screenshot({ clip: { x: viewport.width * .4, y: viewport.height * .3, width: viewport.width * .4, height: viewport.height * .5 } });
  const windBefore = await waterShot();
  await page.waitForTimeout(150);
  expect(await difference(page, windBefore, await waterShot()), "pause freezes the water").toBe(0);
  for (let i = 0; i < 20; i += 1) await page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.step(100));
  const windChange = await difference(page, windBefore, await waterShot());
  console.log(`wind normal requests ${normalRequests}; 2 simulation seconds image change ${windChange.toFixed(5)}`);
  expect(windChange, "the textured wind ripples animate on the actual GPU").toBeGreaterThan(.001);

  // Plan phase W6: rain rings on the water, seen from 3 m (they fade with distance). The same rain and wind with the
  // rings at 0 and at 2 (the late layer hidden).
  const forge = (run: (d: Dev, arg: unknown) => unknown, arg?: unknown) => page.evaluate(([source, value]) => {
    const fn = new Function("d", "arg", `return (${source})(d, arg);`) as (d: Dev, arg: unknown) => unknown;
    return fn((window as unknown as { __forgeDev: Dev }).__forgeDev, value);
  }, [run.toString(), arg] as const);
  if ((await forge((d) => d.environmentState())) === null) {
    await dev(page).spawn([{ id: "act_ffffffffffffffffffffffffffffffa7", spatiallyLoaded: false, components: { environment: { type: "forge.worldEnvironment@3", hour: 12 } } }]);
  }
  const step = async (count: number) => { for (let i = 0; i < count; i += 1) await forge((d, ms) => d.step(ms as number), 1000 / 60); };
  await forge((d, at) => { const [x, y, z, l] = at as [number, number, number, [number, number, number]]; d.moveCamera(x, y, z, l); },
    [basin.x - forward.x * 3, basin.y + 2.5, basin.z - forward.z * 3, [basin.x, basin.y, basin.z]]);
  await step(6);
  const before = await gpuMemory(page);
  await forge((d) => { d.setLateVisible(false); d.setWeather("rain", 1); });
  const ringMotion = async (strength: number): Promise<number> => {
    await forge((d, s) => d.setSurfaceSettings({ rippleStrength: s as number, rippleDensity: 1 }), strength);
    await step(6);
    await page.waitForTimeout(60);
    const first = await waterShot();
    await step(7);
    await page.waitForTimeout(60);
    const second = await waterShot();
    if (strength > 0) writeFileSync(join(RENDER_REFS, "candidates", "puddle-derekavak-rain.png"), await shot());
    return difference(page, first, second);
  };
  const withoutRings = await ringMotion(0);
  const withRings = await ringMotion(2);
  await forge((d) => { d.setWeather("clear", 1); d.setSurfaceSettings({ rippleStrength: 1, rippleDensity: 0.6 }); d.setLateVisible(true); });
  await step(3);
  const after = await gpuMemory(page);
  const pipelines = before && after ? after.pipelines - before.pipelines : null;
  console.log(`rain rings: water change ${withRings.toFixed(5)} with rings, ${withoutRings.toFixed(5)} without; pipelines +${pipelines ?? "-"}`);
  expect(withRings, "rain rings move the water").toBeGreaterThan(withoutRings * 1.5);
  if (pipelines !== null) expect(pipelines, "rain and ring settings compile nothing").toBe(0);
  expect(pageErrors).toEqual([]);
  expect(gpuErrors).toEqual([]);
  // The readout is useful evidence, but it covers half the basin in the
  // acceptance gallery. Keep the debug attachment and publish a clean view too.
  await page.locator("#debug-stats").evaluate((element) => { (element as HTMLElement).style.display = "none"; });
  const clean = await shot();
  await testInfo.attach("puddle-clean.png", { body: clean, contentType: "image/png" });
  writeFileSync(join(RENDER_REFS, "candidates", "puddle-derekavak.png"), clean);
});
