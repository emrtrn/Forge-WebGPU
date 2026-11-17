// Static batches: instanced vs the GPU-driven automatic LOD path (plan 5c
// R9.0 / R9.5): `npm run measure:static-path`. Headed Chrome on the real GPU,
// the smoke server and profile, 1080p `high`, DPR 1.
//
// Each reference level opens at its first Phase 0 pose (Derekavak at P2) once
// per path (`?staticPath=instanced|gpu|auto`, development only). The frame
// loop is paused (`window.__forgeDev`) and stepped at 60 Hz: 60 warm frames,
// then 300 recorded: submission (cull + render CPU wall time), frame CPU, GPU
// (timestamp queries), the scene's draws (three's count plus the indirect
// draws three does not count), the GPU-driven batches and instances, and the
// automatic LOD loads served from the derived cache versus produced by the
// worker. The record goes to render-refs/runs/<stamp>-static-path.json. Not a
// pass / fail gate: it fails only on a non-WebGPU run or a boot error.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

const FRAME_MS = 1000 / 60;
const WARM_FRAMES = 60;
const FRAMES = 300;
const PATHS = ["instanced", "gpu", "auto"] as const;
const LEVELS: ReadonlyArray<{ id: string; pose: string }> = [
  { id: "derekavak", pose: "p2" }, { id: "wb-pilot", pose: "p1" }, { id: "island", pose: "p1" }, { id: "open-world", pose: "p1" },
];

interface Step { ran: boolean; cpuMs: number; gpuMs: number | null; submitMs: number | null }
interface Dev {
  pause(): void;
  step(ms: number): Promise<Step>;
  host(): {
    renderer: { info: { autoReset: boolean; reset(): void; render: { drawCalls: number; triangles: number } } };
    gpuDriven: { lastDraws: number; stats(): { batches: number; instances: number; draws: number; views: number } };
    triangleCache(): { hits: number; generated: number };
  } | null;
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

test("static batches: instanced vs GPU-driven automatic LOD", async ({ page }) => {
  test.setTimeout(1_200_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(`${message.text()}`); });
  const results = [];
  for (const level of LEVELS) {
    const scene = SMOKE_SCENES.find((entry) => entry.id === level.id)!;
    const pose = scene.poses.find((entry) => entry.id === level.pose) ?? scene.poses[0]!;
    for (const path of PATHS) {
      const opened = Date.now();
      await openSmokeLevel(page, scene.level, pose, `&staticPath=${path}`);
      const readyMs = Date.now() - opened;
      await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
      await page.waitForTimeout(1500);
      await dev(page, (d) => d.pause());
      for (let i = 0; i < WARM_FRAMES; i += 1) await dev(page, (d, ms) => d.step(ms as number), FRAME_MS);
      const steps: Step[] = [];
      for (let i = 0; i < FRAMES; i += 1) steps.push(await dev(page, (d, ms) => d.step(ms as number), FRAME_MS));
      // One more frame's draws and triangles as `?debug` counts them (three's RAF would reset the counter).
      const frame = await dev(page, async (d, ms) => {
        const host = d.host();
        if (!host) return null;
        const info = host.renderer.info;
        info.autoReset = false; info.reset();
        try {
          await d.step(ms as number);
          return { draws: info.render.drawCalls + host.gpuDriven.lastDraws, threeTriangles: info.render.triangles, gpu: host.gpuDriven.stats(), cache: host.triangleCache() };
        } finally { info.autoReset = true; }
      }, FRAME_MS);
      const submit = steps.map((step) => step.submitMs ?? NaN).filter(Number.isFinite);
      const cpu = steps.map((step) => step.cpuMs);
      const gpu = steps.map((step) => step.gpuMs ?? NaN).filter(Number.isFinite);
      results.push({
        level: level.id, pose: pose.id, path, readyMs, ...frame,
        submitMs: { mean: round(mean(submit)), p95: round(percentile(submit, 0.95)) },
        cpuMs: { mean: round(mean(cpu)), p95: round(percentile(cpu, 0.95)) },
        gpuMs: gpu.length ? { mean: round(mean(gpu)), p95: round(percentile(gpu, 0.95)), samples: gpu.length } : null,
      });
      const last = results.at(-1)!;
      console.log(`${level.id}/${pose.id} ${path}: ready ${readyMs} ms, submit ${last.submitMs.mean} ms, cpu ${last.cpuMs.mean} ms, gpu ${last.gpuMs?.mean ?? "-"} ms, draws ${frame?.draws ?? "-"}, gpu batches ${frame?.gpu.batches ?? "-"} / ${frame?.gpu.instances ?? "-"} inst, LOD cache ${frame?.cache.hits ?? "-"} hit / ${frame?.cache.generated ?? "-"} generated`);
    }
  }
  expect(errors).toEqual([]);
  const record = {
    schema: 1,
    kind: "phase 5c R9.0 static batches: instanced vs GPU-driven automatic LOD",
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    viewport: SMOKE_VIEWPORT, frameMs: FRAME_MS, warmFrames: WARM_FRAMES, frames: FRAMES,
    results,
  };
  const stamp = record.date.replace(/[:.]/g, "-");
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${stamp}-static-path.json`), `${JSON.stringify(record, null, 2)}\n`);
});
