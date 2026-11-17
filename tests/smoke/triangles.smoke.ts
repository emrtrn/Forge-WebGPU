import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { REPO_ROOT, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";
import type * as Probe from "./fixtures/triangles.ts";

test.use({ viewport: SMOKE_VIEWPORT });
for (const backend of ["webgpu", "webgl"] as const) test(`R7 triangles (${backend}): automatic LOD, MRT, cascades and bundles`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!, pose = scene.poses.find((entry) => entry.id === "p2")!;
  await openSmokeLevel(page, scene.level, pose, backend === "webgl" ? "&forceWebGL" : "");
  await expect(page.locator(`canvas[data-forge-backend='${backend === "webgpu" ? "webgpu" : "webgl2"}']`)).toBeVisible();
  // A dynamic module URL is necessary for the real browser's Vite server.
  const moduleUrl = "/tests/smoke/fixtures/triangles.ts";
  const records = [];
  for (const bundle of [false, true]) {
    await page.evaluate(() => (window as unknown as { __forgeDev: { resume(): void } }).__forgeDev.resume());
    const selection = await page.evaluate(async ([url, bundled]) => (await import(url) as typeof Probe).install(bundled), [moduleUrl, bundle] as const);
    expect(selection.every((item) => item.path === (backend === "webgpu" ? "gpu" : "cpu"))).toBe(true);
    expect(selection.slice(0, 3).every((item) => item.lods > 1)).toBe(true);
    expect(selection[3]!.lods).toBe(1);
    const timings = await page.evaluate(async (url) => (await import(url) as typeof Probe).measure(), moduleUrl);
    const checks = await page.evaluate(async (url) => (await import(url) as typeof Probe).check(), moduleUrl);
    expect(checks.views).toBe(4);
    if (backend === "webgpu") {
      expect(checks.reversed).toBe(true);
      expect(timings[0]!.indirectDraws).toBeGreaterThan(0);
      expect(timings.every((row) => row.reportedDraws === row.nativeDraws), JSON.stringify(timings[0])).toBe(true);
      if (bundle) { expect(timings[0]!.bundleReplays).toBeGreaterThan(0); expect(timings.every((row) => row.bundleRecords === 0)).toBe(true); }
    }
    for (const fallback of checks.fallback) for (const view of fallback.views) view.gpu.forEach((count, lod) => {
      expect(count).toBeGreaterThanOrEqual(view.cpu.certain[lod]!); expect(count).toBeLessThanOrEqual(view.cpu.possible[lod]!);
    });
    records.push({ bundle, selection, timings, checks });
    await page.screenshot({ path: join(REPO_ROOT, `.forge-cache/r7/${backend}-${bundle ? "bundle" : "direct"}.png`) });
    const moved = await page.evaluate(async (url) => (await import(url) as typeof Probe).move(), moduleUrl);
    expect(moved.fallback[0]!.views.every((view) => view.gpu.every((count) => count === 0))).toBe(true);
  }
  await page.evaluate(async (url) => (await import(url) as typeof Probe).remove(), moduleUrl);
  expect(errors).toEqual([]);
  const out = join(REPO_ROOT, ".forge-cache/r7"); mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${backend}.json`), `${JSON.stringify({ backend, method: "separate RAF before every 60Hz engine step; GPU render and compute resolved separately; native pass + indirect + bundle replay draws", records, errors }, null, 2)}\n`);
});
