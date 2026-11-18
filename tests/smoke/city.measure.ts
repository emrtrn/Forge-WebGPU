// R9c baseline: static city poses at 1080p DPR 1, 60 Hz stepped WebGPU,
// with separate diagnostic snapshots and a continuous street–room–street walk.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { writeCityLevel } from "../../tools/bench-city-level.ts";
import { cityDraws, cityFrames, cityHeap, citySettle, cityWalk, CITY_FRAME_MS } from "./cityPage.ts";
import { RENDER_REFS, SMOKE_VIEWPORT } from "./renderPaths.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

const PROFILES = ["high", "ultra"] as const;
const ALLOWED_PATHS = ["auto", "instanced", "gpu"] as const;
const paths = (process.env.FORGE_CITY_PATHS ?? "auto").split(",");
if (paths.some(path => !ALLOWED_PATHS.some(allowed => allowed === path)) || new Set(paths).size !== paths.length) {
  throw new Error("FORGE_CITY_PATHS must list distinct paths from auto,instanced,gpu.");
}
const focus = process.env.FORGE_CITY_POSES?.split(",").map(pose => pose.trim());
if (focus && (focus.some(pose => !pose) || new Set(focus).size !== focus.length)) {
  throw new Error("FORGE_CITY_POSES must list distinct, non-empty pose IDs.");
}
const WARM_FRAMES = 60;
const FRAMES = 300;
const WALK_SPEED = 4;

async function requireCityGpu(page: Page, profile: string) {
  const { proof, ratio, quality, fallback } = await page.evaluate(() => {
    const host = window.__forgeDev.host()!;
    const backend = host.renderer.backend as unknown as { device?: { adapterInfo?: { isFallbackAdapter?: boolean } } };
    return { proof: host.proof, ratio: host.renderer.getPixelRatio(), quality: host.quality.level,
      fallback: backend.device?.adapterInfo?.isFallbackAdapter ?? null };
  });
  const adapter = Object.values(proof.adapter ?? {}).join(" ");
  expect(proof.backend, "city backend").toBe("webgpu");
  expect(adapter.trim(), "WebGPU adapter identity").not.toBe("");
  expect(fallback, "WebGPU fallback adapter").not.toBe(true);
  expect(adapter, "Use a hardware WebGPU adapter").not.toMatch(/swiftshader|llvmpipe|lavapipe|software|fallback|\bwarp\b/i);
  expect(proof.timestampQuery, "GPU timestamp queries").toBe(true);
  expect(ratio).toBe(1);
  expect(quality).toBe(profile);
  return { ...proof, fallback };
}

test("city draw budget baseline", async ({ context, browser }, info) => {
  // The six poses and walk run serially for both profiles. A hardware RTX 3060
  // run reached the final pose at the previous 20-minute limit.
  test.setTimeout(1_800_000 * paths.length);
  const folder = process.env.FORGE_CITY_TEMP_PROJECT;
  if (!folder) throw new Error("City fixture path is missing.");
  const fixture = JSON.parse(await readFile(join(folder, ".forge-cache", "city.json"), "utf8")) as Awaited<ReturnType<typeof writeCityLevel>>;
  const poses = focus ? focus.map(id => {
    const pose = fixture.poses.find(candidate => candidate.id === id);
    if (!pose) throw new Error(`Unknown city pose: ${id}.`);
    return pose;
  }) : fixture.poses;
  const results = [];
  const walks = [];
  const startup = (path: string) => `&staticPath=${path}&buildingStreaming=off`;
  for (const profile of PROFILES) {
    for (const path of paths) {
      for (const pose of poses) {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => {
          if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text());
        });
        try {
          await openSmokeLevel(page, fixture.level, pose, startup(path), profile);
          const proof = await requireCityGpu(page, profile);
          await citySettle(page);
          await cityFrames(page, WARM_FRAMES);
          const timing = await cityFrames(page, FRAMES);
          const withShadows = await cityDraws(page);
          const jsHeap = await cityHeap(page);
          expect(timing.gpuRenderMs?.samples).toBe(FRAMES);
          expect(timing.gpuTotalMs?.samples).toBe(FRAMES);
          expect(withShadows.perView.main?.draws).toBeGreaterThan(0);
          const shadowViews = Object.entries(withShadows.perView).filter(([key]) => key.startsWith("shadow-"));
          expect(shadowViews.length).toBe(profile === "high" ? 3 : 4);
          if (focus && profile === "high" && path === "auto") {
            await page.getByTestId("forge-canvas").screenshot({ path: info.outputPath(`${pose.id}.png`) });
          }

          await page.evaluate(() => {
            const host = window.__forgeDev.host()!;
            host.setQuality({ ...host.quality, settings: { ...host.quality.settings, shadowsEnabled: false } });
          });
          await cityFrames(page, WARM_FRAMES);
          const withoutTiming = await cityFrames(page, FRAMES);
          const withoutShadows = await cityDraws(page);
          expect(withoutTiming.gpuRenderMs?.samples).toBe(FRAMES);
          expect(withoutTiming.gpuTotalMs?.samples).toBe(FRAMES);
          expect(Object.keys(withoutShadows.perView).some(key => key.startsWith("shadow-"))).toBe(false);
          expect(errors).toEqual([]);

          results.push({
            profile, path, pose, proof, jsHeap, timing, withShadows,
            withoutShadows: { timing: withoutTiming, counters: withoutShadows },
            shadowGpuRenderDeltaMs: timing.gpuRenderMs!.mean - withoutTiming.gpuRenderMs!.mean,
            shadowGpuTotalDeltaMs: timing.gpuTotalMs!.mean - withoutTiming.gpuTotalMs!.mean,
          });
          console.log(`${profile}/${path}/${pose.id}: ${withShadows.draws} draws, ${timing.gpuTotalMs!.mean.toFixed(2)} ms GPU, ${withShadows.dispatches} dispatches`);
        } finally {
          await page.close();
        }
      }

      if (focus) continue;
      const page = await context.newPage();
      try {
        const [start, target] = fixture.walk;
        await openSmokeLevel(page, fixture.level, { id: "walk", position: start!, target: target! }, startup(path), profile);
        await requireCityGpu(page, profile);
        const startSettleMs = await citySettle(page);
        const before = { ...await page.evaluate(() => window.__forgeDev.streaming()), jsHeap: await cityHeap(page) };
        const timing = await cityWalk(page, fixture.walk, WALK_SPEED);
        expect(timing.frameMs?.samples).toBeGreaterThan(0);
        const endSettleMs = await citySettle(page);
        const after = { ...await page.evaluate(() => window.__forgeDev.streaming()), jsHeap: await cityHeap(page) };
        walks.push({ profile, path, ...timing, waypoints: fixture.walk, startSettleMs, endSettleMs, before, after });
      } finally {
        await page.close();
      }
    }
  }

  const date = new Date().toISOString();
  const stamp = date.replace(/[:.]/g, "-");
  const dir = join(RENDER_REFS, "runs");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${stamp}-city.json`), JSON.stringify({
    schema: 1, date, commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "",
    browser: browser.version(), viewport: SMOKE_VIEWPORT, devicePixelRatio: 1, frameMs: CITY_FRAME_MS,
    methods: {
      gpuTotalMs: "sum of render and compute timestamps", directInstanceDraws: "instances summed across direct draw commands",
      draws: "one diagnostic frame per pose and shadow setting; indirect commands with zero instances still count",
    },
    warmFrames: WARM_FRAMES, frames: FRAMES, fixture, results, walks,
    ...(focus ? { focusedPoses: focus } : {}),
  }, null, 2) + "\n", { flag: "wx" });
});
