// GPU-driven drawing with and without render bundles (plan 5c R3 / step 5.3):
// `npm run measure:gpu-driven`. Headed Chrome on the real GPU, the smoke
// server and profile, Derekavak P2 at 1080p `high`, DPR 1.
//
// The page's frame loop is paused (`window.__forgeDev`, development only) and
// stepped at a fixed 60 Hz, as the phase 5c G6 spike measured. Each scenario
// installs GPU-driven foliage batches (`gpuFoliageScene.ts`: Derekavak's
// 1,640 instances in 6 types; the stress scenario repeats every type 20
// times, 120 batches, standing in for the statics of step 5.5), warms for
// 60 frames, then records 300: the host's submission time (cull + render +
// overlay CPU wall time), the frame's CPU time, the GPU time when timestamp
// queries resolve, the draws of every view and the bundle re-record marks.
// The record goes to render-refs/runs/<stamp>-gpu-driven.json. Not a pass /
// fail gate: it fails only on a non-WebGPU run or a boot error, or when a
// steady window re-records a bundle. `FORGE_PROFILE=<scenario id>` (and
// `FORGE_PROFILE_OUT=<file>`) also writes a 60-frame CPU profile summary of
// that scenario (self time by function).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { derekavakFoliage, type FoliageSceneType } from "./gpuFoliageScene.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

const FRAME_MS = 1000 / 60;
const WARM_FRAMES = 60;
const FRAMES = 300;
const STRESS_COPIES = 20;

interface Step { ran: boolean; cpuMs: number; gpuMs: number | null; submitMs: number | null }
interface Stats { batches: number; instances: number; draws: number; views: number; bundleUpdates: number }
interface Dev {
  pause(): void;
  step(ms: number): Promise<Step>;
  host(): { renderer: { info: { autoReset: boolean; reset(): void; render: { drawCalls: number } } }; gpuDriven: { lastDraws: number } } | null;
  gpuDriven: {
    install(types: FoliageSceneType[], cullScale: number, castShadow?: boolean, bundle?: boolean): Promise<unknown>;
    stats(): Stats | null;
    bundleRecords(): Promise<number>;
    remove(): Promise<void>;
  };
}
const dev = <T>(page: Page, run: (dev: Dev, arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => {
    const fn = new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown;
    return fn((window as unknown as { __forgeDev: Dev }).__forgeDev, value);
  }, [run.toString(), arg] as const) as Promise<T>;

const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? NaN;
};
const round = (value: number): number => Math.round(value * 1000) / 1000;

test.use({ viewport: SMOKE_VIEWPORT });

test("gpu-driven drawing: submission with and without render bundles", async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  const p2 = scene.poses.find((pose) => pose.id === "p2")!;
  const foliage = derekavakFoliage([p2.position![0], p2.position![2]]);
  const stress = foliage.types.flatMap((type) => Array.from({ length: STRESS_COPIES }, (_, copy) => ({ ...type, name: `${type.name}#${copy}` })));

  await openSmokeLevel(page, scene.level, p2);
  await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
  await page.waitForTimeout(1500);
  await dev(page, (d) => d.pause());

  const measureWindow = async (): Promise<Step[]> => {
    const steps: Step[] = [];
    for (let i = 0; i < FRAMES; i += 1) steps.push(await dev(page, (d, ms) => d.step(ms as number), FRAME_MS));
    return steps;
  };
  const scenarios: Array<{ id: string; types: FoliageSceneType[] | null; bundle: boolean }> = [
    { id: "no-batches", types: null, bundle: true },
    { id: "foliage-direct", types: foliage.types, bundle: false },
    { id: "foliage-bundle", types: foliage.types, bundle: true },
    { id: `stress-x${STRESS_COPIES}-direct`, types: stress, bundle: false },
    { id: `stress-x${STRESS_COPIES}-bundle`, types: stress, bundle: true },
  ];
  const results = [];
  for (const scenario of scenarios) {
    await dev(page, (d) => d.gpuDriven.remove());
    if (scenario.types) {
      await dev(page, (d, arg) => {
        const [types, scale, bundle] = arg as [FoliageSceneType[], number, boolean];
        return d.gpuDriven.install(types, scale, true, bundle);
      }, [scenario.types, foliage.cullScale, scenario.bundle]);
    }
    for (let i = 0; i < WARM_FRAMES; i += 1) await dev(page, (d, ms) => d.step(ms as number), FRAME_MS);
    if (process.env.FORGE_PROFILE === scenario.id) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
      await cdp.send("Profiler.start");
      for (let i = 0; i < 60; i += 1) await dev(page, (d, ms) => d.step(ms as number), FRAME_MS);
      const { profile } = await cdp.send("Profiler.stop");
      const self = new Map<string, number>();
      const byId = new Map(profile.nodes.map((node) => [node.id, node]));
      const counts = new Map<number, number>();
      for (const sample of profile.samples ?? []) counts.set(sample, (counts.get(sample) ?? 0) + 1);
      for (const [id, n] of counts) {
        const frame = byId.get(id)!.callFrame;
        const key = `${frame.functionName || "(anon)"} ${frame.url.split("/").pop()}:${frame.lineNumber}`;
        self.set(key, (self.get(key) ?? 0) + n);
      }
      const total = [...self.values()].reduce((a, b) => a + b, 0);
      writeFileSync(process.env.FORGE_PROFILE_OUT ?? "profile.txt", [...self].sort((a, b) => b[1] - a[1]).slice(0, 60)
        .map(([key, n]) => `${(100 * n / total).toFixed(1)}%  ${key}`).join("\n"));
    }
    const before = await dev(page, (d) => d.gpuDriven.stats());
    const recordsBefore = await dev(page, (d) => d.gpuDriven.bundleRecords());
    const steps = await measureWindow();
    const after = await dev(page, (d) => d.gpuDriven.stats());
    const recorded = (await dev(page, (d) => d.gpuDriven.bundleRecords())) - recordsBefore;
    // One more frame's draws as `?debug` counts them: the renderer's calls (every view) plus indirect
    // batches (plan 5c R8). three's own animation loop resets the counter each RAF, so it is held for the step.
    const sceneDraws = await dev(page, async (d, ms) => {
      const host = d.host();
      if (!host) return null;
      const info = host.renderer.info;
      info.autoReset = false;
      info.reset();
      try {
        await d.step(ms as number);
        return info.render.drawCalls + host.gpuDriven.lastDraws;
      } finally {
        info.autoReset = true;
      }
    }, FRAME_MS);
    const submit = steps.map((step) => step.submitMs ?? NaN).filter(Number.isFinite);
    const cpu = steps.map((step) => step.cpuMs);
    const gpu = steps.map((step) => step.gpuMs ?? NaN).filter(Number.isFinite);
    const steadyUpdates = (after?.bundleUpdates ?? 0) - (before?.bundleUpdates ?? 0);
    results.push({
      id: scenario.id, bundle: scenario.bundle, batches: after?.batches ?? 0, instances: after?.instances ?? 0,
      draws: after?.draws ?? 0, sceneDraws, views: after?.views ?? 0, bundleUpdatesTotal: after?.bundleUpdates ?? 0, steadyBundleUpdates: steadyUpdates, steadyBundleRecords: recorded,
      submitMs: { mean: round(mean(submit)), p95: round(percentile(submit, 0.95)), max: round(Math.max(...submit)) },
      cpuMs: { mean: round(mean(cpu)), p95: round(percentile(cpu, 0.95)) },
      gpuMs: gpu.length ? { mean: round(mean(gpu)), p95: round(percentile(gpu, 0.95)), samples: gpu.length } : null,
    });
    expect(steadyUpdates, `${scenario.id}: a steady view re-records no bundle`).toBe(0);
  }
  await dev(page, (d) => d.gpuDriven.remove());
  expect(errors).toEqual([]);

  const record = {
    schema: 1,
    kind: "phase 5c R3 (step 5.3) GPU-driven submission, render bundles on / off",
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    level: scene.level, pose: p2.id, viewport: SMOKE_VIEWPORT, frameMs: FRAME_MS, warmFrames: WARM_FRAMES, frames: FRAMES,
    foliage: { cells: foliage.cells, instances: foliage.instances, types: foliage.types.length },
    scenarios: results,
  };
  const stamp = record.date.replace(/[:.]/g, "-");
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${stamp}-gpu-driven.json`), `${JSON.stringify(record, null, 2)}\n`);
  for (const result of results) console.log(`${result.id}: submit ${result.submitMs.mean} / p95 ${result.submitMs.p95} ms, cpu ${result.cpuMs.mean} ms, gpu ${result.gpuMs?.mean ?? "-"} ms, draws ${result.draws} (${result.views} views), scene draws ${result.sceneDraws ?? "-"}, bundle updates ${result.bundleUpdatesTotal}, records in window ${result.steadyBundleRecords}`);
});
