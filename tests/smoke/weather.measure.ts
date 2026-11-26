// The weather's cost (plan phase W, HV-03 / HV-11): `npm run measure:weather`.
// Headed Chrome on the real GPU, the smoke server and profile, 1080p `high`,
// DPR 1, the frame loop paused and stepped at a fixed 60 Hz.
//
// Derekavak P2 (terrain, foliage) and L03 (static meshes, no terrain), each in
// the same states: clear and dry, rain and snow (and each without its drops or
// flakes), and the covered surface (wet, snow). The states are measured in
// interleaved rounds, because one GPU time drifts by a few tenths of a
// millisecond between two runs, and a whole round can jump: a state's GPU number
// is the median of its rounds' means, recorded with every round. The W0 record
// holds the states before anything fell. Each switch also counts the pipelines and shader modules it
// made: a weather change must make none once the state has been drawn.
//
// Spawns a World Environment where the level has none (development hook; the
// reference project is not written). After the states, the level's World
// Environment is removed and interleaved rounds compare no World Environment
// with one that only adds clear weather at 12:00 (HV-10: `no-world-environment`,
// `added-world-environment-clear`). Record: render-refs/runs/<stamp>-weather.json.
//
// The second test (plan phase W2, HV-03) runs timed weather changes frame by
// frame: the longest frame, the GPU, the Sky Light captures (during the change
// and after it) and the pipelines / shader modules it made, which must be 0
// once the end states have been drawn. Record: <stamp>-weather-transition.json.
//
// The third (plan phase W3, budget) walks the camera through the rain: the
// GPU time of the frames that redraw the precipitation cover against those
// that do not, and a still stretch that must draw nothing.
// Record: <stamp>-weather-cover.json.
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

interface Step { ran: boolean; cpuMs: number; gpuMs: number | null; submitMs: number | null; captures: number }
/** `late: false` draws the same state without its precipitation: the difference is what rain and snow cost. */
interface State { id: string; weather: string; intensity: number; surface: Record<string, number>; late?: false }
interface Dev {
  pause(): void;
  step(ms: number): Promise<Step>;
  transitionWeather(request: { preset: string; intensity?: number; seconds: number }): number;
  transitions: { reached: boolean | null }[];
  spawn(raw: unknown[]): string[];
  destroy(ids: string[]): void;
  worldEnvironmentActors(): string[];
  setWeather(preset: string, intensity: number): void;
  setSurface(surface: Record<string, number>): void;
  setLateVisible(visible: boolean): void;
  environmentState(): unknown;
  gpuDriven: { level(): Promise<{ pending: number } | null> };
  precipitationCover(): { redraws: number; lastFrameRedraws: number } | null;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  streaming(): { camera: [number, number, number] };
}

const DRY = { snowCoverage: 0, wetness: 0, puddleFill: 0, snowDepth: 0 };
const STATES: readonly State[] = [
  { id: "clear", weather: "clear", intensity: 1, surface: DRY },
  { id: "rain", weather: "rain", intensity: 1, surface: DRY },
  { id: "rain-undrawn", weather: "rain", intensity: 1, surface: DRY, late: false },
  { id: "snow", weather: "snow", intensity: 1, surface: DRY },
  { id: "snow-undrawn", weather: "snow", intensity: 1, surface: DRY, late: false },
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

const spawnEnvironment = (page: Page) => evaluate(page, (d) => d.spawn([{ id: "act_ffffffffffffffffffffffffffffffa7", spatiallyLoaded: false,
  components: { environment: { type: "forge.worldEnvironment@3", hour: 12 } } }]));

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
    if ((await evaluate(page, (d) => d.environmentState())) === null) await spawnEnvironment(page);
    await page.waitForTimeout(1500);
    await evaluate(page, (d) => d.pause());

    const set = (state: State) => evaluate(page, (d, arg) => {
      const next = arg as State;
      d.setWeather(next.weather, next.intensity);
      d.setSurface(next.surface);
      d.setLateVisible(next.late !== false);
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
    // HV-10: the level without any World Environment against one that only adds clear weather
    // (hour 12), in interleaved rounds after the states (the level's own one is removed for good).
    await evaluate(page, (d) => d.destroy(d.worldEnvironmentActors()));
    const bare = { without: [] as number[], with: [] as number[], withoutCpu: [] as number[], withCpu: [] as number[] };
    for (let i = 0; i < ROUNDS; i += 1) {
      for (const kind of ["without", "with"] as const) {
        if (kind === "with") await spawnEnvironment(page);
        for (let frame = 0; frame < WARM_FRAMES; frame += 1) await step(page);
        const steps: Step[] = [];
        for (let frame = 0; frame < FRAMES; frame += 1) steps.push(await step(page));
        bare[kind].push(mean(steps.map((s) => s.gpuMs ?? NaN).filter(Number.isFinite)));
        bare[kind === "with" ? "withCpu" : "withoutCpu"].push(...steps.map((s) => s.cpuMs));
        if (kind === "with") await evaluate(page, (d) => d.destroy(d.worldEnvironmentActors()));
      }
    }
    for (const kind of ["without", "with"] as const) {
      const gpuMeans = bare[kind];
      const cpu = bare[kind === "with" ? "withCpu" : "withoutCpu"];
      const result = { scene: sceneId, pose: poseId, state: kind === "with" ? "added-world-environment-clear" : "no-world-environment",
        cpuMs: { mean: round(mean(cpu)), p95: round(percentile(cpu, 0.95)) },
        gpuMs: { median: round(percentile(gpuMeans, 0.5)), min: round(Math.min(...gpuMeans)), max: round(Math.max(...gpuMeans)), rounds: gpuMeans.map(round) } };
      results.push(result);
      console.log(`${sceneId} ${result.state}: main ${result.cpuMs.mean} / p95 ${result.cpuMs.p95} ms, gpu ${result.gpuMs.median} ms (rounds ${result.gpuMs.min}..${result.gpuMs.max})`);
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

/** Timed changes (plan phase W2): from, to, seconds of simulation time. */
const TRANSITIONS = [
  { id: "clear-rain", from: "clear", to: "rain", seconds: 10 },
  { id: "rain-snow", from: "rain", to: "snow", seconds: 10 },
  { id: "snow-clear", from: "snow", to: "clear", seconds: 10 },
  { id: "clear-fog", from: "clear", to: "fog", seconds: 5 },
] as const;
/** Frames stepped after a change ends: its settle capture, then the still weather. */
const AFTER_FRAMES = 60;

test("weather transition: frame by frame, Sky Light captures, pipelines made", async ({ page }) => {
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
    if ((await evaluate(page, (d) => d.environmentState())) === null) await spawnEnvironment(page);
    await page.waitForTimeout(1500);
    await evaluate(page, (d) => d.pause());
    // Every end state drawn once: a change between them must make nothing new.
    for (const preset of ["clear", "rain", "snow", "fog", "clear"]) {
      await evaluate(page, (d, arg) => d.setWeather(arg as string, 1), preset);
      for (let frame = 0; frame < WARM_FRAMES; frame += 1) await step(page);
    }

    for (const transition of TRANSITIONS) {
      await evaluate(page, (d, arg) => d.setWeather(arg as string, 1), transition.from);
      for (let frame = 0; frame < WARM_FRAMES; frame += 1) await step(page);
      const before = await gpuMemory(page);
      const index = await evaluate(page, (d, arg) => d.transitionWeather(arg as { preset: string; seconds: number }), { preset: transition.to, seconds: transition.seconds });
      const during = Math.round((transition.seconds * 1000) / FRAME_MS);
      const steps: Step[] = [];
      for (let frame = 0; frame < during + AFTER_FRAMES; frame += 1) steps.push(await step(page));
      const made = await gpuMemory(page);
      const reached = await evaluate(page, (d, arg) => d.transitions[arg as number]?.reached ?? null, index);
      const cpu = steps.map((s) => s.cpuMs);
      const gpu = steps.map((s) => s.gpuMs ?? NaN).filter(Number.isFinite);
      const result = {
        scene: sceneId, pose: poseId, transition: transition.id, seconds: transition.seconds, frames: steps.length, reached,
        longestFrameCpuMs: round(Math.max(...cpu)), cpuMs: { mean: round(mean(cpu)), p95: round(percentile(cpu, 0.95)) },
        gpuMs: gpu.length ? { mean: round(mean(gpu)), p95: round(percentile(gpu, 0.95)), max: round(Math.max(...gpu)) } : null,
        // During: at most one per 0.1 s. After: the resting weather once, then none.
        captures: { during: steps.slice(0, during).reduce((n, s) => n + s.captures, 0), after: steps.slice(during).reduce((n, s) => n + s.captures, 0) },
        pipelines: made.pipelines - before.pipelines, shaderModules: made.shaderModules - before.shaderModules,
      };
      results.push(result);
      console.log(`${sceneId} ${transition.id}: reached ${reached}, longest main ${result.longestFrameCpuMs} ms, main ${result.cpuMs.mean} / p95 ${result.cpuMs.p95} ms, `
        + `gpu ${result.gpuMs?.mean ?? "-"} / p95 ${result.gpuMs?.p95 ?? "-"} / max ${result.gpuMs?.max ?? "-"} ms, `
        + `captures ${result.captures.during} + ${result.captures.after}, pipelines +${result.pipelines}, shader modules +${result.shaderModules}`);
    }
  }
  expect(errors).toEqual([]);

  const record = {
    schema: 1,
    kind: "phase W2 weather transition",
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    viewport: SMOKE_VIEWPORT, frameMs: FRAME_MS, warmFrames: WARM_FRAMES, afterFrames: AFTER_FRAMES,
    results,
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${record.date.replace(/[:.]/g, "-")}-weather-transition.json`), `${JSON.stringify(record, null, 2)}\n`);
});

/** Metres the camera walks a frame in the cover test (30 m/s at 60 Hz: several redraws a second). */
const WALK_STEP = 0.5;
const WALK_FRAMES = 240;
const STILL_FRAMES = 60;

test("weather cover: the precipitation cover's redraw cost while walking, nothing while still", async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const results: unknown[] = [];
  for (const { scene: sceneId, pose: poseId } of SCENES) {
    const scene = SMOKE_SCENES.find((entry) => entry.id === sceneId)!;
    await openSmokeLevel(page, scene.level, scene.poses.find((entry) => entry.id === poseId)!);
    await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
    await expect.poll(async () => (await evaluate(page, (d) => d.gpuDriven.level()))?.pending ?? 0, { timeout: 60_000, message: `${sceneId}: the ring settles` }).toBe(0);
    if ((await evaluate(page, (d) => d.environmentState())) === null) await spawnEnvironment(page);
    await page.waitForTimeout(1500);
    await evaluate(page, (d) => d.pause());
    await evaluate(page, (d) => d.setWeather("rain", 1));
    for (let frame = 0; frame < WARM_FRAMES; frame += 1) await step(page);
    const start = (await evaluate(page, (d) => d.streaming())).camera;
    const walk: { redraws: number; gpu: number | null; cpu: number }[] = [];
    for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
      const x = start[0] + frame * WALK_STEP;
      await evaluate(page, (d, at) => { const [px, py, pz] = at as number[]; d.moveCamera(px!, py!, pz!, [px! + 20, py! - 2, pz!]); }, [x, start[1], start[2]]);
      const s = await step(page);
      walk.push({ redraws: (await evaluate(page, (d) => d.precipitationCover()))?.lastFrameRedraws ?? 0, gpu: s.gpuMs, cpu: s.cpuMs });
    }
    let stillRedraws = 0;
    for (let frame = 0; frame < STILL_FRAMES; frame += 1) {
      await step(page);
      stillRedraws += (await evaluate(page, (d) => d.precipitationCover()))?.lastFrameRedraws ?? 0;
    }
    const gpuOf = (list: typeof walk) => list.map((f) => f.gpu ?? NaN).filter(Number.isFinite);
    const drawn = walk.filter((f) => f.redraws > 0), plain = walk.filter((f) => f.redraws === 0);
    const result = {
      scene: sceneId, pose: poseId, walkFrames: WALK_FRAMES, walkStep: WALK_STEP,
      redrawFrames: drawn.length, cascadeDraws: drawn.reduce((n, f) => n + f.redraws, 0),
      gpuMs: { redraw: { mean: round(mean(gpuOf(drawn))), max: round(Math.max(...gpuOf(drawn))) }, other: { mean: round(mean(gpuOf(plain))), p95: round(percentile(gpuOf(plain), 0.95)) } },
      cpuMs: { redraw: round(mean(drawn.map((f) => f.cpu))), other: round(mean(plain.map((f) => f.cpu))) },
      stillRedraws,
    };
    results.push(result);
    console.log(`${sceneId} cover: ${result.redrawFrames} redraw frames (${result.cascadeDraws} cascade draws) in ${WALK_FRAMES}; gpu redraw ${result.gpuMs.redraw.mean} / max ${result.gpuMs.redraw.max} ms, other ${result.gpuMs.other.mean} / p95 ${result.gpuMs.other.p95} ms; main ${result.cpuMs.redraw} vs ${result.cpuMs.other} ms; still redraws ${stillRedraws}`);
  }
  expect(errors).toEqual([]);
  const record = {
    schema: 1, kind: "phase W3 precipitation cover", date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "",
    viewport: SMOKE_VIEWPORT, frameMs: FRAME_MS, results,
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${record.date.replace(/[:.]/g, "-")}-weather-cover.json`), `${JSON.stringify(record, null, 2)}
`);
});
