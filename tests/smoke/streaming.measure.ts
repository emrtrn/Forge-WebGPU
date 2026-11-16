// Phase 5b decision 9: World Partition streaming on the synthetic large level
// (~4 x 4 km, ~50.000 actors, HLOD built), real headed WebGPU, 1080p `high`,
// DPR 1, uncapped. Two parts:
//
// - Flight: the camera crosses the level's diagonal at FLIGHT_SPEED, moved
//   every frame inside the page; frame intervals while cells stream.
//   Budget: p99 <= 20 ms and no single frame over 50 ms.
// - Cycles: CYCLES round trips between two points whose loaded cells do not
//   overlap, each arrival settled (no cell or load pending). Actors and cache
//   entries come back to the first arrival's counts; the renderer's
//   geometries / textures (counted once drawn, so HLOD proxies kept within
//   1.25 x the view distance count once seen) equal the first cycle's after
//   the last cycle and after the cache's eviction delay; the JS heap (after
//   gc) grows at most 5 %. Frames over 33 ms in the flight are listed with the
//   streaming work of that frame.
//
// Record: render-refs/runs/<stamp>-streaming.json. Not in the gate or CI.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { RENDER_REFS, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, openSmokeLevel } from "./smokePage.ts";
import { STREAMING_LEVEL } from "./streamingScene.ts";

const FLIGHT_SPEED = 40; // m/s
const HEIGHT = 40;
const FLIGHT: readonly [readonly [number, number], readonly [number, number]] = [[-1800, -1800], [1800, 1800]];
const A = [-1200, 1200] as const;
const B = [1200, -1200] as const;
const CYCLES = 10;
const EVICT_WAIT_MS = 32_000;

interface Snapshot {
  cells: { active: number; actors: number; fetching: number; queued: number; loaded: number } | null;
  hlod: { loaded: number; visible: number };
  cache: { entries: number; pending: number; pendingEvict: number; evicted: number } | null;
  gpu: { geometries: number; textures: number } | null;
  heap: number | null;
}

function summary(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
  return { samples: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, median: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99), max: sorted.at(-1)! };
}

/** The page's JS heap after a full collection (CDP); `performance.memory` counts more than the page's objects. */
async function heapAfterGc(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    return (await cdp.send("Runtime.getHeapUsage")).usedSize;
  } finally {
    await cdp.detach();
  }
}

async function snapshot(page: Page, heap = false): Promise<Snapshot> {
  const state = await page.evaluate(() => (window as unknown as { __forgeDev: { streaming(): Omit<Snapshot, "heap"> } }).__forgeDev.streaming());
  return { ...state, heap: heap ? await heapAfterGc(page) : null };
}

/** Moves to a point and waits until no cell is in flight or waiting, then a few frames more. */
async function settleAt(page: Page, at: readonly [number, number]): Promise<number> {
  const started = Date.now();
  await page.evaluate(([x, z, y]) => (window as unknown as { __forgeDev: { moveCamera(x: number, y: number, z: number, look: [number, number, number]): void } })
    .__forgeDev.moveCamera(x, y, z, [x + 50, 0, z + 50]), [at[0], at[1], HEIGHT] as const);
  // Settled: no cell in flight or waiting and no load (models, HLOD proxies) pending, three polls in a row.
  let quiet = 0;
  await expect.poll(async () => {
    const now = await snapshot(page);
    const idle = now.cells !== null && now.cells.fetching === 0 && now.cells.queued === 0 && now.cache?.pending === 0;
    quiet = idle ? quiet + 1 : 0;
    return quiet >= 3;
  }, { timeout: 180_000, intervals: [200] }).toBe(true);
  await page.waitForTimeout(500);
  return Date.now() - started;
}

test("streaming: flight and load / unload cycles on the synthetic level", async ({ page, browser }) => {
  await page.setViewportSize(SMOKE_VIEWPORT);
  const [from] = FLIGHT;
  await openSmokeLevel(page, STREAMING_LEVEL, { id: "start", position: [from[0], HEIGHT, from[1]], target: [from[0] + 50, 0, from[1] + 50] });
  await settleAt(page, from);

  // Flight: moved every frame in the page.
  interface Spike { t: number; ms: number; x: number; z: number; streamingMs: number | null; active: number | null; actors: number | null; pending: number | null }
  const fly = (route: readonly [readonly [number, number], readonly [number, number]]) => page.evaluate(([start, end, speed, height]) => new Promise<{ intervals: number[]; durationMs: number; spikes: Spike[] }>((resolve) => {
    type Frame = { ms: number; active: number; actors: number; pending: number } | null;
    const dev = (window as unknown as { __forgeDev: { moveCamera(x: number, y: number, z: number, look: [number, number, number]): void; streamingFrame(): Frame } }).__forgeDev;
    const spikes: Spike[] = [];
    let previous: Frame = null;
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const intervals: number[] = [];
    const began = performance.now();
    let last: number | null = null;
    const step = (now: number) => {
      const t = Math.min(1, ((now - began) / 1000) * speed / length);
      const x = start[0] + (end[0] - start[0]) * t;
      const z = start[1] + (end[1] - start[1]) * t;
      const frame = dev.streamingFrame();
      if (last !== null) {
        intervals.push(now - last);
        // The interval holds the previous frame's work: report that frame's streaming numbers.
        if (now - last > 33) spikes.push({ t: now - began, ms: now - last, x, z, streamingMs: previous?.ms ?? null, active: previous?.active ?? null, actors: previous?.actors ?? null, pending: previous?.pending ?? null });
      }
      last = now;
      previous = frame;
      dev.moveCamera(x, height, z, [x + (end[0] - start[0]) / length * 50, 0, z + (end[1] - start[1]) / length * 50]);
      if (t < 1) requestAnimationFrame(step);
      else resolve({ intervals, durationMs: now - began, spikes });
    };
    requestAnimationFrame(step);
  }), [route[0], route[1], FLIGHT_SPEED, HEIGHT] as const);
  const flight = await fly(FLIGHT);
  const flightMs = summary(flight.intervals.slice(60)); // the first second is the jump into the route
  // The same route back: what was drawn once is compiled now (separates pipeline compiles from streaming work).
  const back = await fly([FLIGHT[1], FLIGHT[0]]);
  const backMs = summary(back.intervals.slice(60));
  const afterFlight = await snapshot(page);

  // Cycles.
  const settleMs: number[] = [];
  settleMs.push(await settleAt(page, A));
  const first = await snapshot(page, true);
  const cycles: Snapshot[] = [];
  for (let cycle = 0; cycle < CYCLES; cycle += 1) {
    settleMs.push(await settleAt(page, B));
    settleMs.push(await settleAt(page, A));
    cycles.push(await snapshot(page, true));
  }
  await page.waitForTimeout(EVICT_WAIT_MS);
  const evicted = await snapshot(page, true);

  const record = {
    schema: 1, date: new Date().toISOString(), commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "",
    browser: `chrome ${browser.version()}`, viewport: SMOKE_VIEWPORT, uncapped: true,
    flight: { from: FLIGHT[0], to: FLIGHT[1], speed: FLIGHT_SPEED, height: HEIGHT, durationMs: flight.durationMs, frameMs: flightMs, spikes: flight.spikes },
    flightBack: { durationMs: back.durationMs, frameMs: backMs, spikes: back.spikes },
    afterFlight, first, cycles, evicted, settleMs: summary(settleMs),
    budget: { p99: 20, maxFrame: 50, heapGrowth: 0.05 },
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(RENDER_REFS, "runs", `${stamp}-streaming.json`), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`flight ${JSON.stringify(flightMs)}
spikes ${JSON.stringify(flight.spikes)}
back ${JSON.stringify(backMs)}
back spikes ${JSON.stringify(back.spikes)}`);
  console.log(`first ${JSON.stringify(first)}\nlast ${JSON.stringify(cycles.at(-1))}\nevicted ${JSON.stringify(evicted)}`);

  expect(first.cells?.actors).toBeGreaterThan(0);
  expect.soft(flightMs.p99, "flight p99 (ms)").toBeLessThanOrEqual(20);
  expect.soft(flightMs.max, "longest flight frame (ms)").toBeLessThanOrEqual(50);
  const last = cycles.at(-1)!;
  expect.soft(last.cells?.actors, "actors after the cycles").toBe(first.cells?.actors);
  expect.soft(evicted.cache?.entries, "cache entries after the eviction delay").toBe(first.cache?.entries);
  // The renderer counts a geometry once it was drawn: compare steady states (after a full cycle), HLOD loads settled.
  expect.soft(evicted.gpu, "renderer geometries / textures after the eviction delay").toEqual(cycles[0]!.gpu);
  expect.soft(last.gpu, "renderer geometries / textures after the last cycle").toEqual(cycles[0]!.gpu);
  // Growth over the cycles: from the first cycle's (steady state) to after the eviction delay.
  expect.soft(evicted.heap! / cycles[0]!.heap!, "JS heap growth").toBeLessThanOrEqual(1.05);
});
