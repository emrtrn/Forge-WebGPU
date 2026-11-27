import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { TerrainSnowMatch } from "../../src/render/viewer/debug/terrainColliderMatch.ts";
import { gpuMemory, installGpuMemory } from "./gpuMemory.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

type XZ = [number, number];
type XYZ = [number, number, number];
interface Dev {
  pause(): void;
  spawn(actors: unknown[]): string[];
  destroy(ids: string[]): void;
  streaming(): { camera: XYZ };
  setWeather(preset: string, intensity: number): void;
  setWeatherDrivesSurface(on: boolean): void;
  advanceEnvironment(seconds: number): void;
  setSurface(surface: Record<string, number>): void;
  setSurfaceSettings(settings: Record<string, number>): void;
  setLateVisible(visible: boolean): void;
  terrainHeights(points: XZ[]): Promise<(number | null)[]>;
  terrainSnow(options: { centre: XZ; size?: number; spots?: XZ[] }): Promise<TerrainSnowMatch | null>;
  precipitationCover(): { redraws: number; lastFrameRedraws: number } | null;
  step(ms: number): Promise<{ gpuMs: number | null }>;
}

test.use({ viewport: SMOKE_VIEWPORT });
const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
const dir = join(RENDER_REFS, "candidates");
const dev = <T, A>(page: Page, run: (dev: Dev, arg: A) => T, arg: A): Promise<Awaited<T>> => page.evaluate(([source, value]) => {
  const invoke = new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: A) => Awaited<T>;
  return invoke((window as unknown as { __forgeDev: Dev }).__forgeDev, value as A);
}, [run.toString(), arg] as const);

function consoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  return errors;
}

const block = (index: number, name: string, p: XYZ, metres: XYZ): unknown => ({
  id: `act_${index.toString(16).padStart(32, "d")}`, name, spatiallyLoaded: false,
  transform: { p, r: [0, 0, 0, 1], s: metres.map((m) => m * 2) },
  components: { shape: { type: "forge.shape@2", primitive: "cube", color: "#747980", castShadow: true, collision: false } },
});

test("HV-07 terrain snow rises, matches its CPU twin, avoids shelter, and melts", async ({ page }) => {
  const errors = consoleErrors(page);
  // Keep the real terrain and weather. Leave only the covers this test places and probes.
  await page.route((url) => url.pathname === "/__forge/read" && /\/Derekavak\/(cells\.json|hlod\.json|terrain\/derekavak\.terrain\.json)$/.test(url.searchParams.get("path") ?? ""), async (route) => {
    const file = new URL(route.request().url()).searchParams.get("path")?.replaceAll("\\", "/");
    if (file?.endsWith("/Derekavak/hlod.json")) return route.fulfill({ status: 404 });
    if (file?.endsWith("/Derekavak/cells.json")) {
      const response = await route.fetch();
      return route.fulfill({ response, json: { ...await response.json(), cells: {} } });
    }
    if (file?.endsWith("/Derekavak/terrain/derekavak.terrain.json")) {
      const response = await route.fetch();
      const asset = await response.json();
      return route.fulfill({ response, json: { ...asset, data: { ...asset.data, splines: [] } } });
    }
    return route.continue();
  });
  await openSmokeLevel(page, scene.level, scene.poses.find((pose) => pose.id === "p1")!);
  await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
  await page.waitForFunction(() => "__forgeDev" in window, undefined, { timeout: 30_000 });
  await page.waitForTimeout(600);
  const camera = await dev(page, (d) => { d.pause(); d.setLateVisible(false); return d.streaming().camera; }, null);
  const centre: XZ = [Math.floor(camera[0]) + 12, Math.floor(camera[2])];
  const [cx, cz] = centre;
  const roof: XZ = [cx + 0.5, cz + 0.5];
  const road: XZ = [cx + 8.5, cz + 0.5];
  const spots: XZ[] = [roof, road];
  const baseHeights = await dev(page, (d, points) => d.terrainHeights(points), spots);
  expect(baseHeights.every((height) => height !== null)).toBe(true);
  const measure = async () => (await dev(page, (d, opts) => d.terrainSnow(opts), { centre, size: 64, spots }))!;
  const step = () => dev(page, (d) => d.step(1000 / 60), null);
  const dry = await measure();
  expect(dry.sampled).toBe(dry.covered);
  expect(dry.maxM).toBeLessThan(0.003);

  await dev(page, (d) => {
    d.setWeatherDrivesSurface(false);
    d.setSurfaceSettings({ snowSpread: 0.42, patchSize: 1.3 });
    d.setSurface({ snowCoverage: 0.8, snowDepth: 0.4 });
    return d.step(0);
  }, null);
  const patchy = await measure();
  expect(errors).toEqual([]);
  expect(patchy.sampled).toBe(dry.sampled);
  expect(patchy.maxM).toBeGreaterThan(0.16);
  expect(patchy.maxM).toBeLessThanOrEqual(0.402);
  expect(patchy.minM).toBeGreaterThan(-0.003);
  expect(patchy.twin.p99M).toBeLessThan(0.01);
  expect(patchy.twin.over5cm).toBe(0);

  await dev(page, (d) => {
    d.setSurfaceSettings({ snowSpread: 1 });
    d.setWeatherDrivesSurface(true);
    d.setWeather("snow", 1);
    d.advanceEnvironment(1200);
    return d.step(0);
  }, null);
  const full = await measure();
  expect(full.spots.map((sample) => sample?.drawn ?? 0).every((rise) => rise > 0.15)).toBe(true);
  const coverActors = [block(1, "Snow shelter", [roof[0], baseHeights[0]! + 3, roof[1]], [8, 0.2, 8]),
    block(2, "Low road surface", [road[0], baseHeights[1]!, road[1]], [6, 0.24, 6])];
  const before = await dev(page, (d) => d.precipitationCover(), null);
  const ids = await dev(page, (d, actors) => d.spawn(actors), coverActors);
  expect(ids).toHaveLength(2);
  await expect.poll(async () => {
    await step();
    const state = await dev(page, (d) => d.precipitationCover(), null);
    const check = await measure();
    return (state?.redraws ?? 0) > (before?.redraws ?? 0)
      && check.spots.every((sample) => sample !== null && sample.drawn < 0.006);
  }, { intervals: [100, 300, 500], timeout: 6_000, message: "roof and road are drawn into the cover and block displacement" }).toBe(true);
  const sheltered = await measure();
  expect(sheltered.spots.every((sample) => sample !== null && sample.drawn < 0.006)).toBe(true);
  expect(sheltered.maxM).toBeGreaterThan(0.38);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "w7-derekavak-snow-depth.png"), await page.screenshot());
  await dev(page, (d, remove) => {
    d.destroy(remove);
    d.setWeatherDrivesSurface(true);
    d.setWeather("clear", 1);
    d.advanceEnvironment(1200);
    return d.step(0);
  }, ids);
  const melted = await measure();
  expect(melted.sampled).toBe(dry.sampled);
  expect(melted.maxM).toBeLessThan(0.003);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ dry, patchy, full, sheltered, melted }));
});

test("W7: terrain displacement GPU cost at Derekavak P2", async ({ page }) => {
  const errors = consoleErrors(page);
  await installGpuMemory(page);
  await openSmokeLevel(page, scene.level, scene.poses.find((pose) => pose.id === "p2")!);
  await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
  await page.bringToFront();
  await page.waitForTimeout(2000);
  await dev(page, (d) => { d.pause(); d.setWeather("clear", 1); d.setWeatherDrivesSurface(false); }, null);
  const step = () => dev(page, (d) => d.step(1000 / 60), null);
  let incompleteFrames = 0;
  const sample = async (depth: number, snowCoverage = 1): Promise<number[]> => {
    await dev(page, (d, surface) => d.setSurface(surface), { snowCoverage, snowDepth: depth, wetness: 0, puddleFill: 0 });
    for (let i = 0; i < 24; i += 1) await step();
    const times: number[] = [];
    for (let i = 0; i < 120 && times.length < 60; i += 1) {
      const { gpuMs } = await step();
      // P2's full frame takes multiple milliseconds. Single-pass timestamp results are not full frames.
      if (gpuMs !== null && Number.isFinite(gpuMs) && gpuMs > 0.5) times.push(gpuMs);
      else incompleteFrames += 1;
    }
    return times;
  };
  const median = (times: number[]): number => times.sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
  await sample(0);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "w7-derekavak-p2-flat-snow.png"), await page.screenshot());
  await sample(0.4);
  writeFileSync(join(dir, "w7-derekavak-p2-snow-depth.png"), await page.screenshot());
  expect(errors).toEqual([]);
  const memoryBefore = await gpuMemory(page);
  const rounds: { dry: number; flat: number; raised: number; displacementDelta: number; surfaceDelta: number }[] = [];
  for (let round = 0; round < 5; round += 1) {
    const first = round % 2 === 0 ? 0 : 0.4;
    const dryFirst = round % 2 === 0 ? await sample(0, 0) : null;
    const a = await sample(first), b = await sample(0.4 - first);
    const dryTimes = dryFirst ?? await sample(0, 0);
    expect(Math.min(a.length, b.length, dryTimes.length)).toBeGreaterThanOrEqual(45);
    const [flat, raised] = first === 0 ? [median(a), median(b)] : [median(b), median(a)];
    const dry = median(dryTimes);
    rounds.push({ dry, flat, raised, displacementDelta: raised - flat, surfaceDelta: raised - dry });
  }
  const memoryAfter = await gpuMemory(page);
  const record = {
    rounds,
    incompleteFrames,
    displacementDeltaMs: median(rounds.map((round) => round.displacementDelta)),
    surfaceDeltaMs: median(rounds.map((round) => round.surfaceDelta)),
  };
  const runs = join(RENDER_REFS, "runs");
  mkdirSync(runs, { recursive: true });
  writeFileSync(join(runs, `${new Date().toISOString().replace(/[:.]/g, "-")}-snow-depth.json`), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
  expect(memoryAfter.pipelines - memoryBefore.pipelines).toBe(0);
  expect(errors).toEqual([]);
});
