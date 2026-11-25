// The weather's cost (plan phase W, HV-03 / HV-11): `npm run measure:weather`.
// Headed Chrome on the real GPU, the smoke server and profile, 1080p `high`,
// DPR 1, the frame loop paused and stepped at a fixed 60 Hz.
//
// Derekavak P2 (terrain, foliage) and L03 (static meshes, no terrain), each in
// the same states: clear and dry, rain, snow, and the covered surface (wet,
// snow). The states are measured in interleaved rounds, because one GPU time
// drifts by a few tenths of a millisecond between two runs, and a whole round can
// jump: a state's GPU number is the median of its rounds' means, recorded with
// every round. Every
// later step of phase W is compared with the W0 record (the states before
// anything falls). Each switch also counts the pipelines and shader modules it
// made: a weather change must make none once the state has been drawn.
//
// Spawns a World Environment where the level has none (development hook; the
// reference project is not written). Record: render-refs/runs/<stamp>-weather.json.
// Fails on a non-WebGPU run, a boot error or a page error, never on a number.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { gpuMemory, installGpuMemory } from "./gpuMemory.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

const FRAME_MS = 1000 / 60;
const WARM_FRAMES = 30;
const FRAMES = 120;
const ROUNDS = 5;

interface Step { ran: boolean; cpuMs: number; gpuMs: number | null; submitMs: number | null }
interface State { id: string; weather: string; intensity: number; surface: Record<string, number> }
interface Dev {
  pause(): void;
  step(ms: number): Promise<Step>;
  spawn(raw: unknown[]): string[];
  setWeather(preset: string, intensity: number): void;
  setSurface(surface: Record<string, number>): void;
  environmentState(): unknown;
  gpuDriven: { level(): Promise<{ pending: number } | null> };
}

const DRY = { snowCoverage: 0, wetness: 0, puddleFill: 0, snowDepth: 0 };
const STATES: readonly State[] = [
  { id: "clear", weather: "clear", intensity: 1, surface: DRY },
  { id: "rain", weather: "rain", intensity: 1, surface: DRY },
  { id: "snow", weather: "snow", intensity: 1, surface: DRY },
  { id: "rain-wet", weather: "rain", intensity: 1, surface: { ...DRY, wetness: 1, puddleFill: 1 } },
  { id: "snow-covered", weather: "snow", intensity: 1, surface: { ...DRY, snowCoverage: 1, snowDepth: 0.4 } },
];
const SCENES = [{ scene: "derekavak", pose: "p2" }, { scene: "l03", pose: "p1" }] as const;

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

test.use({ viewport: SMOKE_VIEWPORT });

test("weather: cost of each state, pipelines made by the switches", async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  await installGpuMemory(page);
  const results: unknown[] = [];

  for (const { scene: sceneId, pose: poseId } of SCENES) {
    const scene = SMOKE_SCENES.find((entry) => entry.id === sceneId)!;
    await openSmokeLevel(page, scene.level, scene.poses.find((entry) => entry.id === poseId)!);
    await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
    await expect.poll(async () => (await evaluate(page, (d) => d.gpuDriven.level()))?.pending ?? 0, { timeout: 60_000, message: `${sceneId}: the ring settles` }).toBe(0);
    if ((await evaluate(page, (d) => d.environmentState())) === null) {
      await evaluate(page, (d) => d.spawn([{ id: "act_ffffffffffffffffffffffffffffffa7", spatiallyLoaded: false,
        components: { environment: { type: "forge.worldEnvironment@3", hour: 12 } } }]));
    }
    await page.waitForTimeout(1500);
    await evaluate(page, (d) => d.pause());

    const set = (state: State) => evaluate(page, (d, arg) => {
      const next = arg as State;
      d.setWeather(next.weather, next.intensity);
      d.setSurface(next.surface);
    }, state);
    const rounds = new Map(STATES.map((state) => [state.id, [] as { submit: number[]; cpu: number[]; gpu: number[]; pipelines: number; shaderModules: number }[]]));
    for (let i = 0; i < ROUNDS; i += 1) {
      for (const state of STATES) {
        const before = await gpuMemory(page);
        await set(state);
        for (let frame = 0; frame < WARM_FRAMES; frame += 1) await step(page);
        const made = await gpuMemory(page);
        const steps: Step[] = [];
        for (let frame = 0; frame < FRAMES; frame += 1) steps.push(await step(page));
        rounds.get(state.id)!.push({
          submit: steps.map((s) => s.submitMs ?? NaN).filter(Number.isFinite),
          cpu: steps.map((s) => s.cpuMs),
          gpu: steps.map((s) => s.gpuMs ?? NaN).filter(Number.isFinite),
          pipelines: made.pipelines - before.pipelines,
          shaderModules: made.shaderModules - before.shaderModules,
        });
      }
    }
    const memory = await gpuMemory(page);
    for (const state of STATES) {
      const list = rounds.get(state.id)!;
      const gpuMeans = list.map((r) => mean(r.gpu)).filter(Number.isFinite);
      const result = {
        scene: sceneId, pose: poseId, state: state.id,
        submitMs: { mean: round(mean(list.flatMap((r) => r.submit))), p95: round(percentile(list.flatMap((r) => r.submit), 0.95)) },
        cpuMs: { mean: round(mean(list.flatMap((r) => r.cpu))), p95: round(percentile(list.flatMap((r) => r.cpu), 0.95)) },
        gpuMs: gpuMeans.length ? { median: round(percentile(gpuMeans, 0.5)), min: round(Math.min(...gpuMeans)), max: round(Math.max(...gpuMeans)), rounds: gpuMeans.map(round) } : null,
        // First round: the state's own first use. Later rounds must be 0.
        pipelines: list.map((r) => r.pipelines), shaderModules: list.map((r) => r.shaderModules),
      };
      results.push(result);
      console.log(`${sceneId} ${state.id}: submit ${result.submitMs.mean} / p95 ${result.submitMs.p95} ms, main ${result.cpuMs.mean} / p95 ${result.cpuMs.p95} ms, `
        + `gpu ${result.gpuMs?.median ?? "-"} ms (rounds ${result.gpuMs?.min ?? "-"}..${result.gpuMs?.max ?? "-"}), pipelines +${result.pipelines.join(" +")}`);
    }
    results.push({ scene: sceneId, gpuMemoryMiB: Math.round(memory.liveBytes / 1048576 * 10) / 10 });
  }
  expect(errors).toEqual([]);

  const record = {
    schema: 1,
    kind: "phase W weather cost",
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    viewport: SMOKE_VIEWPORT, frameMs: FRAME_MS, warmFrames: WARM_FRAMES, frames: FRAMES, rounds: ROUNDS,
    results,
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${record.date.replace(/[:.]/g, "-")}-weather.json`), `${JSON.stringify(record, null, 2)}\n`);
});
