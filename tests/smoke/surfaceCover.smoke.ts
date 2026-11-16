// Terrain's visual WES cover on the actual GPU. Dev-only state, no reference
// project changes and no snapshot updates. Round-trip back to the base image.
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RENDER_REFS, SMOKE_SCENES } from "./renderScenes.ts";
import { difference, openSmokeLevel } from "./smokePage.ts";

interface Dev {
  spawn(raw: unknown[]): string[];
  pause(): void;
  step(ms: number): Promise<unknown>;
  setSurface(surface: { snowCoverage: number; wetness: number }): void;
}

test("terrain: WES snow and wetness draw without rebuilding the surface; zero restores the base", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((scene) => scene.id === "derekavak")!;
  await openSmokeLevel(page, scene.level, scene.poses[0]!);
  await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
  await page.evaluate(() => {
    const dev = (window as unknown as { __forgeDev: Dev }).__forgeDev;
    dev.spawn([{ id: "act_ffffffffffffffffffffffffffffffa7", spatiallyLoaded: false,
      components: { environment: { type: "forge.worldEnvironment@1", hour: 12 } } }]);
    dev.pause();
  });
  await page.waitForTimeout(250);
  const set = async (snowCoverage: number, wetness: number) => {
    await page.evaluate(async (surface) => {
      const dev = (window as unknown as { __forgeDev: Dev }).__forgeDev;
      dev.setSurface(surface);
      await dev.step(0);
    }, { snowCoverage, wetness });
    await page.waitForTimeout(100);
    return page.screenshot();
  };
  const dry = await set(0, 0);
  const wet = await set(0, 1);
  const snow = await set(1, 0);
  const restored = await set(0, 0);
  const wetChange = await difference(page, dry, wet);
  const snowChange = await difference(page, dry, snow);
  const zeroChange = await difference(page, dry, restored);
  console.log(`terrain cover: wet ${wetChange.toFixed(4)}, snow ${snowChange.toFixed(4)}, restored ${zeroChange.toFixed(5)}`);
  expect(wetChange, "wetness changes terrain colour and roughness").toBeGreaterThan(.3);
  expect(snowChange, "snow coverage is visible on the terrain").toBeGreaterThan(1);
  expect(zeroChange, "cover removal restores the authored terrain").toBeLessThan(.01);
  await info.attach("terrain-snow.png", { body: snow, contentType: "image/png" });
  await info.attach("terrain-wet.png", { body: wet, contentType: "image/png" });
  const candidates = join(RENDER_REFS, "candidates");
  mkdirSync(candidates, { recursive: true });
  for (const [name, shot] of [["dry", dry], ["wet", wet], ["snow", snow]] as const) {
    writeFileSync(join(candidates, `terrain-cover-${name}.png`), shot);
  }
  expect(errors).toEqual([]);
});
