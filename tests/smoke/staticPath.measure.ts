// Static batches: instanced vs the GPU-driven automatic LOD path (plan 5c
// R9.0 / R9.5): `npm run measure:static-path`. Headed Chrome, the smoke
// server and profile, 1080p `high`, DPR 1. WebGPU by default; set
// FORGE_STATIC_PATH_BACKEND=webgl2 for the CPU twin regression run.
//
// Each reference level opens at its first Phase 0 pose (Derekavak at P2) once
// per path (`?staticPath=instanced|gpu|auto`, development only). The frame
// loop is paused (`window.__forgeDev`) and stepped at 60 Hz: 60 warm frames,
// then 300 recorded: submission (cull + render CPU wall time), frame CPU, GPU
// (timestamp queries), the scene's draws (three's count plus the indirect
// draws three does not count), the GPU-driven batches and instances, and the
// automatic LOD loads served from the derived cache versus produced by the
// worker. The record goes to render-refs/runs/<stamp>-static-path.json. Not a
// pass / fail gate: it checks the requested renderer and successful boot.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";
import { citySettle } from "./cityPage.ts";

const FRAME_MS = 1000 / 60;
const WARM_FRAMES = 60;
const FRAMES = 300;
const BACKEND = process.env.FORGE_STATIC_PATH_BACKEND ?? "webgpu";
if (BACKEND !== "webgpu" && BACKEND !== "webgl2") throw new Error(`Unknown static path backend: ${BACKEND}`);
const ALL_PATHS = ["instanced", "gpu", "auto"] as const;
// `FORGE_STATIC_PATHS=auto,instanced` runs a subset in that order.
const PATHS = process.env.FORGE_STATIC_PATHS ? process.env.FORGE_STATIC_PATHS.split(",").filter((path): path is typeof ALL_PATHS[number] => (ALL_PATHS as readonly string[]).includes(path)) : ALL_PATHS;
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

// three's post-process scene pass runs once per real renderer animation frame.
// Advancing only the engine clock can reuse that pass and count just its quad.
const stepFrame = (page: Page): Promise<Step> => dev(page, async (d, ms) => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return d.step(ms as number);
}, FRAME_MS);

const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? NaN;
};
const round = (value: number): number => Math.round(value * 1000) / 1000;

test.use({ viewport: SMOKE_VIEWPORT });

test("static batches: instanced vs GPU-driven automatic LOD", async ({ context }) => {
  test.setTimeout(1_200_000);
  const errors: string[] = [];
  const results = [];
  for (const level of LEVELS) {
    const scene = SMOKE_SCENES.find((entry) => entry.id === level.id)!;
    const pose = scene.poses.find((entry) => entry.id === level.pose) ?? scene.poses[0]!;
    for (const path of PATHS) {
      // Each open installs pose/profile init scripts. Fresh pages keep scripts
      // from earlier levels from competing to set the same camera pose.
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
      const opened = Date.now();
      const { cameraPose } = await openSmokeLevel(page, scene.level, pose, `&staticPath=${path}${BACKEND === "webgl2" ? "&forceWebGL" : ""}`);
      const readyMs = Date.now() - opened;
      await expect(page.locator(`canvas[data-forge-backend='${BACKEND}']`)).toBeVisible();
      const settleMs = await citySettle(page, false);
      const camera = await page.evaluate(() => {
        const current = window.__forgeDev.host()!.camera;
        return { position: current.position.toArray(), quaternion: current.quaternion.toArray() };
      });
      cameraPose?.position.forEach((value, i) => expect(camera.position[i]).toBeCloseTo(value, 4));
      cameraPose?.quaternion.forEach((value, i) => expect(camera.quaternion[i]).toBeCloseTo(value, 4));
      for (let i = 0; i < WARM_FRAMES; i += 1) await stepFrame(page);
      const steps: Step[] = [];
      for (let i = 0; i < FRAMES; i += 1) steps.push(await stepFrame(page));
      expect(steps.every(step => step.ran)).toBe(true);
      // One more frame's draws and triangles as `?debug` counts them (three's RAF would reset the counter).
      const frame = await dev(page, async (d, ms) => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
        level: level.id, pose: pose.id, camera, path, readyMs, settleMs, ...frame,
        submitMs: { mean: round(mean(submit)), p95: round(percentile(submit, 0.95)) },
        cpuMs: { mean: round(mean(cpu)), p95: round(percentile(cpu, 0.95)) },
        gpuMs: gpu.length ? { mean: round(mean(gpu)), p95: round(percentile(gpu, 0.95)), samples: gpu.length } : null,
      });
      const last = results.at(-1)!;
      console.log(`${level.id}/${pose.id} ${path}: ready ${readyMs} ms, submit ${last.submitMs.mean} ms, cpu ${last.cpuMs.mean} ms, gpu ${last.gpuMs?.mean ?? "-"} ms, draws ${frame?.draws ?? "-"}, gpu batches ${frame?.gpu.batches ?? "-"} / ${frame?.gpu.instances ?? "-"} inst, LOD cache ${frame?.cache.hits ?? "-"} hit / ${frame?.cache.generated ?? "-"} generated`);
      await page.close();
    }
  }
  expect(errors).toEqual([]);
  const record = {
    schema: 1,
    kind: "phase 5c R9.0 static batches: instanced vs GPU-driven automatic LOD",
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    backend: BACKEND, viewport: SMOKE_VIEWPORT, frameMs: FRAME_MS, warmFrames: WARM_FRAMES, frames: FRAMES,
    results,
  };
  const stamp = record.date.replace(/[:.]/g, "-");
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  const suffix = BACKEND === "webgl2" ? "-webgl2" : "";
  const output = join(RENDER_REFS, "runs", `${stamp}-static-path${suffix}.json`);
  writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Static path measurements: ${output}`);
});
