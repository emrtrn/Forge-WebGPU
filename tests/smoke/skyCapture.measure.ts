// Sky Light capture during a time-of-day transition (plan phase 3 step 7):
// `npm run measure:sky-capture`. Headed Chrome on the real GPU, the smoke
// server and profile, L03 (sky, Sky Light and World Environment).
//
// The page's frame loop is paused (`window.__forgeDev`, development only) and
// stepped at a fixed 60 Hz. First the capture on its own (`captureBench`):
// one at a time and twenty back to back, GPU and CPU ms per capture: this is
// the capture's cost. Then each transition frame by frame: the frames, the
// Sky Light captures (PMREM) and the longest run of frames that captured,
// the CPU time of the frames and of the captures, and the frames' GPU time
// as resolved after each step. That GPU time is recorded but does not carry
// the captures (frames that captured read ~0.1 ms against the bench's
// ~3.4 ms: the timestamp queries are not attributed per stepped frame), so
// it is not split by capture. The record goes to
// render-refs/runs/<stamp>-sky-capture.json; the summary to the console.
// Not a pass / fail gate: it fails only on a non-WebGPU run, a boot error or a
// transition that does not reach its hour.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { RENDER_REFS, REPO_ROOT, SMOKE_QUALITY } from "./renderScenes.ts";
import { git, openSmokeLevel } from "./smokePage.ts";

const LEVEL = "content/levels/L03";
const POSE = { id: "p1", position: [5, 3.5, 6], target: [0, 0.5, 0] } as const;
const FRAME_MS = 1000 / 60;
const STILL_FRAMES = 120;
const SETTLE_FRAMES = 30;

interface Scenario {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly seconds: number;
}

const SCENARIOS: readonly Scenario[] = [
  { id: "day-to-night-5s", from: 10, to: 22, seconds: 5 },
  { id: "night-to-day-5s", from: 22, to: 10, seconds: 5 },
  { id: "day-to-night-2s", from: 10, to: 22, seconds: 2 },
  { id: "day-to-night-10s", from: 10, to: 22, seconds: 10 },
  { id: "high-sun-5s", from: 10, to: 14, seconds: 5 },
];

interface Step {
  ran: boolean;
  cpuMs: number;
  gpuMs: number | null;
  captures: number;
  captureCpuMs: number;
  hour: number | null;
  transitioning: boolean;
}

interface DevHook {
  pause(): void;
  resume(): void;
  step(ms: number): Promise<Step>;
  transitionTo(request: { hour: number; seconds: number }): number;
  transitions: { reached: boolean | null }[];
  setHour(hour: number): void;
  captureBench(count: number): Promise<{ count: number; gpuMs: number | null; cpuMs: number } | null>;
}

const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
const quantile = (values: readonly number[], q: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
};
const round = (value: number | null): number | null => (value === null ? null : Math.round(value * 1000) / 1000);

function summarize(steps: readonly Step[]) {
  const gpu = steps.flatMap((step) => (step.gpuMs === null ? [] : [step.gpuMs]));
  let run = 0;
  let longest = 0;
  for (const step of steps) {
    run = step.captures > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const captureSteps = steps.filter((step) => step.captures > 0);
  return {
    frames: steps.length,
    captures: steps.reduce((sum, step) => sum + step.captures, 0),
    captureFrames: captureSteps.length,
    longestCaptureRun: longest,
    // Not split by capture (see the header).
    frameGpuMs: { mean: round(mean(gpu)), p95: round(quantile(gpu, 0.95)), max: round(gpu.length ? Math.max(...gpu) : null) },
    cpuMs: {
      captureMean: round(mean(captureSteps.map((step) => step.captureCpuMs / step.captures))),
      captureMax: round(captureSteps.length ? Math.max(...captureSteps.map((step) => step.captureCpuMs)) : null),
      frameCapturingMean: round(mean(captureSteps.map((step) => step.cpuMs))),
      frameOtherMean: round(mean(steps.filter((step) => step.captures === 0).map((step) => step.cpuMs))),
    },
  };
}

test("sky light capture during time-of-day transitions", async ({ page, browser }) => {
  test.setTimeout(600_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openSmokeLevel(page, LEVEL, POSE);
  const canvas = page.locator("canvas[data-forge-ready='1']");
  const proof = JSON.parse((await canvas.getAttribute("data-forge-backend-proof")) ?? "null") as { isWebGPUBackend: boolean; timestampQuery: boolean; adapter: unknown } | null;
  expect(proof?.isWebGPUBackend, "a WebGPU run").toBe(true);
  expect(proof?.timestampQuery, "timestamp queries on this device").toBe(true);
  // Shader warm-up: let the level draw on its own for a moment.
  await page.waitForTimeout(1500);
  const perf = JSON.parse((await canvas.getAttribute("data-forge-perf")) ?? "null") as { quality?: string } | null;
  expect(perf?.quality, "the smoke profile").toBe(SMOKE_QUALITY);

  await page.evaluate(() => (window as unknown as { __forgeDev: DevHook }).__forgeDev.pause());
  await page.waitForTimeout(100);
  const steps = (count: number) =>
    page.evaluate(async ({ count, ms }) => {
      const dev = (window as unknown as { __forgeDev: DevHook }).__forgeDev;
      const out: Step[] = [];
      for (let i = 0; i < count; i += 1) out.push(await dev.step(ms));
      return out;
    }, { count, ms: FRAME_MS });

  // The capture alone: one at a time and twenty back to back, GPU and CPU ms per capture.
  const bench: Record<string, unknown> = {};
  for (const count of [1, 20]) {
    const samples = await page.evaluate(async ({ count, runs }) => {
      const dev = (window as unknown as { __forgeDev: DevHook }).__forgeDev;
      const out: { gpuMs: number | null; cpuMs: number }[] = [];
      for (let i = 0; i < runs; i += 1) {
        const result = await dev.captureBench(count);
        if (result) out.push({ gpuMs: result.gpuMs === null ? null : result.gpuMs / count, cpuMs: result.cpuMs / count });
      }
      return out;
    }, { count, runs: count === 1 ? 30 : 10 });
    const gpu = samples.flatMap((sample) => (sample.gpuMs === null ? [] : [sample.gpuMs]));
    bench[`x${count}`] = {
      runs: samples.length,
      gpuMsPerCapture: { median: round(quantile(gpu, 0.5)), p95: round(quantile(gpu, 0.95)), min: round(gpu.length ? Math.min(...gpu) : null) },
      cpuMsPerCapture: { median: round(quantile(samples.map((sample) => sample.cpuMs), 0.5)) },
    };
  }

  const stillSteps = await steps(STILL_FRAMES);
  expect(stillSteps.every((step) => step.ran), "the paused loop steps").toBe(true);
  const results: Record<string, unknown> = { bench, still: summarize(stillSteps) };
  const raw: Record<string, Step[]> = { still: stillSteps };

  for (const scenario of SCENARIOS) {
    await page.evaluate((hour) => (window as unknown as { __forgeDev: DevHook }).__forgeDev.setHour(hour), scenario.from);
    await steps(SETTLE_FRAMES);
    const index = await page.evaluate(
      (request) => (window as unknown as { __forgeDev: DevHook }).__forgeDev.transitionTo(request),
      { hour: scenario.to, seconds: scenario.seconds },
    );
    const frames = Math.round(scenario.seconds * 60) + 2;
    const recorded = await steps(frames);
    const reached = await page.evaluate((i) => (window as unknown as { __forgeDev: DevHook }).__forgeDev.transitions[i]!.reached, index);
    expect(reached, `${scenario.id} reaches its hour`).toBe(true);
    expect(recorded.at(-1)?.hour, `${scenario.id} ends on its hour`).toBe(scenario.to);
    results[scenario.id] = { ...scenario, ...summarize(recorded) };
    raw[scenario.id] = recorded;
  }
  await page.evaluate(() => (window as unknown as { __forgeDev: DevHook }).__forgeDev.resume());

  const threeVersion = (JSON.parse(readFileSync(join(REPO_ROOT, "node_modules/three/package.json"), "utf8")) as { version: string }).version;
  const record = {
    schema: 1,
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain", "--", "src", "tests/smoke", "index.html"]) !== "",
    three: threeVersion,
    browser: `chrome ${browser.version()}`,
    gpu: proof?.adapter ?? null,
    level: LEVEL,
    pose: POSE,
    resolution: page.viewportSize(),
    profile: perf?.quality ?? null,
    frameMs: FRAME_MS,
    results,
    raw,
    pageErrors,
  };
  const runs = join(RENDER_REFS, "runs");
  mkdirSync(runs, { recursive: true });
  const file = join(runs, `${new Date().toISOString().replace(/[:.]/g, "-")}-sky-capture.json`);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`sky capture record: ${file}`);
  console.log(JSON.stringify(results, null, 2));
  expect(pageErrors, "page errors").toEqual([]);
});
