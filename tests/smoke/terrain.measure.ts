// Phase 5a step 8: §2.10 production terrain measurement, all Phase 0 poses.
// `npm run measure:terrain`, real headed WebGPU; not in gate/CI.
// Cold = fresh browser context + cleared HTTP cache, warm = same-page reload.
// OS file cache and driver shader cache are not cleared. Shader/pipeline API
// latency is recorded separately from GPU execution; GPU bytes are unavailable.
// Current imported terrain scenes lack foliage/water/gameplay: this is a terrain
// slice, never a claim of full G1 equivalence or final G2/G3/G6 world acceptance.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { RENDER_REFS, REPO_ROOT, SMOKE_QUALITY, SMOKE_SCENES } from "./renderScenes.ts";
import { git, openSmokeLevel } from "./smokePage.ts";
import { frameWindow, installLoadTiming, loadTiming } from "./measurementPage.ts";

const WARMUP_MS = 10_000;
const MEASURE_MS = 15_000;
const records: Record<string, unknown>[] = [];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = join(RENDER_REFS, "runs", `${stamp}-terrain-measure.json`);
const three = (JSON.parse(readFileSync(join(REPO_ROOT, "node_modules/three/package.json"), "utf8")) as { version: string }).version;
const driver = (() => {
  try {
    return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command",
      "Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion | ConvertTo-Json -Compress"], { encoding: "utf8" })) as unknown;
  } catch { return null; }
})();

function summary(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
  return { samples: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: quantile(0.5), p95: quantile(0.95), max: sorted.at(-1)! };
}

function save() {
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ schema: 1, date: new Date().toISOString(), commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "", three, driver, uncapped: true,
    warmupMs: WARMUP_MS, measureMs: MEASURE_MS, scope: "imported terrain slice; foliage, water bodies and gameplay deferred",
    coldDefinition: "fresh context and cleared HTTP cache; OS/driver cache retained",
    gpuMethod: "timestamp-query rolling means (120 samples), witness every 500 ms",
    compileMethod: "WebGPU shader/pipeline API wall latency; async calls may overlap; not isolated compiler time",
    gpuMemoryBytes: null, gpuMemoryReason: "browser does not expose allocated GPU bytes", records }, null, 2)}\n`);
}

for (const scene of SMOKE_SCENES.filter((entry) => ["derekavak", "open-world", "island", "wb-pilot"].includes(entry.id))) {
  for (const pose of scene.poses) {
    for (const resolution of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
      test(`terrain ${scene.id} ${pose.id} ${resolution.height}p`, async ({ page, browser, context }) => {
        test.setTimeout(180_000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setViewportSize(resolution);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.clearBrowserCache");
        await installLoadTiming(page);
        const { cameraPose } = await openSmokeLevel(page, scene.level, pose);
        const cold = await loadTiming(page);
        await page.reload();
        await expect(page.locator("canvas[data-forge-ready='1']")).toBeVisible({ timeout: 120_000 });
        const warm = await loadTiming(page);
        await page.waitForTimeout(WARMUP_MS);
        const before = await loadTiming(page);
        const window = await frameWindow(page, MEASURE_MS);
        const after = await loadTiming(page);
        const canvas = page.locator("canvas[data-forge-ready='1']");
        const proof = JSON.parse((await canvas.getAttribute("data-forge-backend-proof")) ?? "null") as { isWebGPUBackend: boolean; timestampQuery: boolean; adapter: unknown } | null;
        const frameMs = summary(window.intervals);
        const numbers = (field: string) => window.witnesses.flatMap((sample) => typeof sample[field] === "number" ? [sample[field] as number] : []);
        const gpuRollingMs = summary(numbers("gpuMs"));
        const limit = resolution.height === 1080 ? { mean: 14, p95: 16.6 } : { mean: 16.6, p95: 20 };
        const withinTerrainBudget = frameMs !== null && frameMs.mean <= limit.mean && frameMs.p95 <= limit.p95;
        const record = { scene: scene.id, level: scene.level, pose: cameraPose, poseId: pose.id,
          browser: `chrome ${browser.version()}`, backend: proof, gpu: proof?.adapter ?? null,
          resolution, devicePixelRatio: await page.evaluate(() => devicePixelRatio), profile: SMOKE_QUALITY,
          cold, warm, compilationAfterWarmup: before.pipelines, compilationAfterMeasurement: after.pipelines,
          frameMs, gpuRollingMs, drawCalls: summary(numbers("drawCalls")), renderSubmitMs: summary(numbers("renderSubmitMs")), triangles: summary(numbers("triangles")),
          geometries: summary(numbers("geometries")), textures: summary(numbers("textures")), jsHeapBytes: summary(numbers("jsHeapBytes")),
          limit, withinTerrainBudget, errors, ...window };
        records.push(record); save();
        console.log(`${scene.id} ${pose.id} ${resolution.height}p: frame ${JSON.stringify(frameMs)}, GPU rolling ${JSON.stringify(gpuRollingMs)}, load cold/warm ${cold.readyMs}/${warm.readyMs}; budget ${withinTerrainBudget}`);
        expect(proof?.isWebGPUBackend, "real WebGPU").toBe(true);
        expect(window.visible, "foreground throughout measurement").toBe(true);
        expect(window.intervals.length, "enough steady frames").toBeGreaterThan(300);
        expect(window.witnesses.every((sample) => sample.quality === SMOKE_QUALITY && sample.adaptive === false)).toBe(true);
        expect(window.witnesses.length).toBeGreaterThan(10);
        expect(Number(await canvas.getAttribute("data-forge-resource-errors"))).toBe(0);
        expect(errors).toEqual([]);
        expect(withinTerrainBudget, "terrain slice within 1080p / 1440p frame budgets; not full-world G2/G3 acceptance").toBe(true);
      });
    }
  }
}

test("terrain editor Play: cold device in a new tab", async ({ page, context, browser }) => {
  test.setTimeout(180_000);
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installLoadTiming(context);
  await openSmokeLevel(page, scene.level, scene.poses[0]!, "&editor");
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1");
  const errors: string[] = [];
  context.on("page", (opened) => opened.on("pageerror", (error) => errors.push(error.message)));
  const opened = context.waitForEvent("page");
  const clickEpochMs = await page.evaluate(() => performance.timeOrigin + performance.now());
  await page.getByTestId("editor-play").click();
  const game = await opened;
  await game.waitForURL(/[?&]play=/);
  await expect(game.locator("canvas[data-forge-ready='1']")).toBeVisible({ timeout: 120_000 });
  const load = await loadTiming(game);
  const timeOrigin = await game.evaluate(() => performance.timeOrigin);
  const id = new URL(game.url()).searchParams.get("play")!;
  const info = await context.request.get(`/__forge/play?id=${id}`, { headers: { "X-Forge-Request": "1" } });
  expect(info.ok()).toBe(true);
  const session = await info.json() as { camera: unknown };
  const proof = JSON.parse((await game.locator("canvas").getAttribute("data-forge-backend-proof")) ?? "null") as { isWebGPUBackend: boolean } | null;
  const perf = JSON.parse((await game.locator("canvas").getAttribute("data-forge-perf")) ?? "null") as { quality: string } | null;
  records.push({ scene: scene.id, kind: "editor-play-cold-device", browser: `chrome ${browser.version()}`,
    backend: proof, level: scene.level, pose: session.camera, resolution: game.viewportSize(),
    profile: perf?.quality ?? null, perf,
    devicePixelRatio: await game.evaluate(() => devicePixelRatio), load,
    clickToReadyMs: load.readyMs === null ? null : timeOrigin + load.readyMs - clickEpochMs,
    cache: "editor-warmed HTTP and driver caches; new tab, module graph and GPU device", errors });
  save();
  expect(proof?.isWebGPUBackend).toBe(true);
  expect(perf?.quality).toBe(SMOKE_QUALITY);
  expect(load.readyMs).not.toBeNull();
  expect(Number(await game.locator("canvas").getAttribute("data-forge-resource-errors"))).toBe(0);
  expect(errors).toEqual([]);
  await game.close();
});

test.afterAll(() => { if (records.length > 0) console.log(`terrain measurement: ${out}`); });
