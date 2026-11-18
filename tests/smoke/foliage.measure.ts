// G6 with the levels' own foliage (plan 5c F7 = R10): `npm run measure:foliage`.
// Headed Chrome on the real GPU, the smoke server and profile, 1080p `high`,
// DPR 1. The foliage is the level's (the binding's procedural ring over the
// re-imported Landscape foliage rules, F0-F1), not installed by the smoke.
//
// The frame loop is paused (`window.__forgeDev`, development only) and stepped
// at a fixed 60 Hz, as the phase 5c G6 spike and `measure:gpu-driven` do. Each
// scenario warms 60 frames, then records 300: the host's submission time (cull
// + render + overlay CPU wall time), the frame's CPU time (main thread), the
// GPU time when timestamp queries resolve, and the draws of every view.
// Scenarios:
// - Derekavak P2 without its foliage (taken out of the scene, its binding's per-frame work stopped) and with it;
// - with it plus 20 copies of each type's instances as extra batches (heavy:
//   120 more GPU-driven batches, `measure:gpu-driven`'s stress);
// - a walk from P2 at 15 m/s (the ring builds and drops cells, generated in
//   its worker, F2): the longest frame too;
// - Island P1 with its foliage.
// G6: submission <= 3 ms and main thread <= 6 ms at Derekavak P2. The record goes
// to render-refs/runs/<stamp>-foliage.json; it fails only on a non-WebGPU run,
// a boot error or a ring that does not settle, never on the numbers.

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
const WALK_SPEED = 15;

interface Step { ran: boolean; cpuMs: number; gpuMs: number | null; submitMs: number | null }
interface Ring { rings: number; cells: number; instances: number; pending: number }
interface Dev {
  pause(): void;
  step(ms: number): Promise<Step>;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  host(): { renderer: { info: { autoReset: boolean; reset(): void; render: { drawCalls: number } } }; gpuDriven: { lastDraws: number } } | null;
  gpuDriven: {
    install(types: FoliageSceneType[], cullScale: number, castShadow?: boolean, bundle?: boolean): Promise<unknown>;
    stats(): { batches: number; instances: number; draws: number; views: number } | null;
    remove(): Promise<void>;
    level(): Promise<Ring | null>;
    levelVisible(visible: boolean): Promise<void>;
    levelActive(active: boolean): Promise<void>;
  };
}

const evaluate = <T>(page: Page, run: (dev: Dev, arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => {
    const fn = new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown;
    return fn((window as unknown as { __forgeDev: Dev }).__forgeDev, value);
  }, [run.toString(), arg] as const) as Promise<T>;
const step = (page: Page): Promise<Step> => evaluate(page, (d, ms) => d.step(ms as number), FRAME_MS);

const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? NaN;
};
const round = (value: number): number => Math.round(value * 1000) / 1000;
const summary = (values: readonly number[]) => (values.length ? { mean: round(mean(values)), p95: round(percentile(values, 0.95)), max: round(Math.max(...values)) } : null);

test.use({ viewport: SMOKE_VIEWPORT });

test("foliage: G6 with the levels' own foliage", async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text());
    if (message.text().includes("Foliage worker failed")) errors.push(message.text());
  });
  const results: unknown[] = [];

  const open = async (sceneId: string, poseId: string) => {
    const scene = SMOKE_SCENES.find((entry) => entry.id === sceneId)!;
    const pose = scene.poses.find((entry) => entry.id === poseId)!;
    await openSmokeLevel(page, scene.level, pose);
    await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
    await expect.poll(() => evaluate(page, (d) => d.gpuDriven.level()), { timeout: 60_000, message: `${sceneId}: the ring settles` })
      .toMatchObject({ pending: 0 });
    await page.waitForTimeout(1500);
    await evaluate(page, (d) => d.pause());
    return { scene, pose };
  };

  const measure = async (id: string, perFrame?: (frame: number) => Promise<void>) => {
    for (let i = 0; i < WARM_FRAMES; i += 1) { await perFrame?.(i - WARM_FRAMES); await step(page); }
    if (process.env.FORGE_PROFILE === id) await profile(id, perFrame);
    const steps: Step[] = [];
    for (let i = 0; i < FRAMES; i += 1) { await perFrame?.(i); steps.push(await step(page)); }
    const ring = await evaluate(page, (d) => d.gpuDriven.level());
    const stats = await evaluate(page, (d) => d.gpuDriven.stats());
    // One more frame's draws as `?debug` counts them (the renderer's calls in every view plus the indirect ones).
    const sceneDraws = await evaluate(page, async (d, ms) => {
      const host = d.host();
      if (!host) return null;
      const info = host.renderer.info;
      info.autoReset = false;
      info.reset();
      try { await d.step(ms as number); return info.render.drawCalls + host.gpuDriven.lastDraws; } finally { info.autoReset = true; }
    }, FRAME_MS);
    const result = {
      id, ring, batches: stats?.batches ?? 0, instances: stats?.instances ?? 0, gpuDrivenDraws: stats?.draws ?? 0, views: stats?.views ?? 0, sceneDraws,
      submitMs: summary(steps.map((s) => s.submitMs ?? NaN).filter(Number.isFinite)),
      cpuMs: summary(steps.map((s) => s.cpuMs)),
      gpuMs: summary(steps.map((s) => s.gpuMs ?? NaN).filter(Number.isFinite)),
    };
    results.push(result);
    console.log(`${id}: submit ${result.submitMs?.mean} / p95 ${result.submitMs?.p95} / max ${result.submitMs?.max} ms, main ${result.cpuMs?.mean} / p95 ${result.cpuMs?.p95} / max ${result.cpuMs?.max} ms, gpu ${result.gpuMs?.mean ?? "-"} ms, draws ${sceneDraws}, ring ${ring?.cells ?? 0} cells / ${ring?.instances ?? 0} instances`);
    return result;
  };

  /** `FORGE_PROFILE=<scenario>`: a 60-frame CPU profile, self time by function, to `FORGE_PROFILE_OUT` (default profile.txt). */
  const profile = async (id: string, perFrame?: (frame: number) => Promise<void>) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await cdp.send("Profiler.start");
    for (let i = 0; i < 60; i += 1) { await perFrame?.(i); await step(page); }
    const { profile: data } = await cdp.send("Profiler.stop");
    const self = new Map<string, number>();
    const byId = new Map(data.nodes.map((node) => [node.id, node]));
    const counts = new Map<number, number>();
    for (const sample of data.samples ?? []) counts.set(sample, (counts.get(sample) ?? 0) + 1);
    for (const [node, n] of counts) {
      const frame = byId.get(node)!.callFrame;
      const key = `${frame.functionName || "(anon)"} ${frame.url.split("/").pop()}:${frame.lineNumber}`;
      self.set(key, (self.get(key) ?? 0) + n);
    }
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    writeFileSync(process.env.FORGE_PROFILE_OUT ?? "profile.txt", `${id}\n${[...self].sort((a, b) => b[1] - a[1]).slice(0, 60)
      .map(([key, n]) => `${(100 * n / total).toFixed(1)}%  ${key}`).join("\n")}\n`);
  };

  // Derekavak P2: without (out of the scene and its binding stopped), with, with the stress.
  const { pose: p2 } = await open("derekavak", "p2");
  await evaluate(page, (d) => d.gpuDriven.levelVisible(false));
  await evaluate(page, (d) => d.gpuDriven.levelActive(false));
  await measure("derekavak-p2-no-foliage");
  await evaluate(page, (d) => d.gpuDriven.levelActive(true));
  await evaluate(page, (d) => d.gpuDriven.levelVisible(true));
  await measure("derekavak-p2-foliage");
  const node = derekavakFoliage([p2.position![0], p2.position![2]]);
  const stress = node.types.flatMap((type) => Array.from({ length: STRESS_COPIES }, (_, copy) => ({ ...type, name: `${type.name}#${copy}` })));
  await evaluate(page, (d, arg) => { const [types, scale] = arg as [FoliageSceneType[], number]; return d.gpuDriven.install(types, scale, true, false); }, [stress, node.cullScale]);
  await measure(`derekavak-p2-foliage-stress-x${STRESS_COPIES}`);
  await evaluate(page, (d) => d.gpuDriven.remove());

  // A walk from P2 along the view direction (level ground height ignored: the camera flies).
  const [x, y, z] = p2.position!;
  const [tx, , tz] = p2.target ?? [x, y, z + 1];
  const length = Math.hypot(tx - x, tz - z) || 1;
  const dir = [(tx - x) / length, (tz - z) / length] as const;
  await measure("derekavak-walk-15mps", async (frame) => {
    const at = Math.max(0, frame + WARM_FRAMES) * WALK_SPEED * FRAME_MS / 1000;
    const px = x + dir[0] * at, pz = z + dir[1] * at;
    await evaluate(page, (d, arg) => { const [a, b, c, e, f] = arg as number[]; d.moveCamera(a!, b!, c!, [e!, b! - 5, f!]); }, [px, y, pz, px + dir[0] * 50, pz + dir[1] * 50]);
  });

  // Island P1: its own foliage.
  await open("island", "p1");
  await measure("island-p1-foliage");
  expect(errors).toEqual([]);

  const record = {
    schema: 1,
    kind: "phase 5c F7 (R10) G6 with the levels' own foliage",
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    viewport: SMOKE_VIEWPORT, frameMs: FRAME_MS, warmFrames: WARM_FRAMES, frames: FRAMES,
    g6: { submitMs: 3, mainMs: 6, at: "derekavak-p2-foliage" },
    scenarios: results,
  };
  const stamp = record.date.replace(/[:.]/g, "-");
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${stamp}-foliage.json`), `${JSON.stringify(record, null, 2)}\n`);
});
