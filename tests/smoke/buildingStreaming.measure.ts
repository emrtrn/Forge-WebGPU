import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import type { writeCityLevel } from "../../tools/bench-city-level.ts";
import { cityModels } from "../../tools/scenes/cityModels.ts";
import type { ZoneDrawing } from "../../src/render/sync/zoneDrawing.ts";
import { CITY_FRAME_MS, cityDraws, cityFrames, citySettle, distribution } from "./cityPage.ts";
import { REPO_ROOT, SMOKE_VIEWPORT } from "./renderPaths.ts";
import { isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

type Point = readonly [number, number, number];
type Fixture = Awaited<ReturnType<typeof writeCityLevel>>;
type BuildingStatus = ReturnType<NonNullable<ZoneDrawing["residency"]>["inspect"]>;
interface Checkpoint {
  elapsed: number;
  position: Point;
  cameraZone: string | null;
  building: BuildingStatus;
}
const SPEED = 8;
const OUTPUT = join(REPO_ROOT, "docs/reference/measurements/r9c-step4");
const furnitureKeys = cityModels(false).furniture.map(({ id }) => `model:${id}`);

async function snapshot(page: Page, inside: Point) {
  return page.evaluate(({ point, keys }) => {
    const dev = window.__forgeDev;
    const host = dev.host();
    const zones = host?.world?.zones;
    const zone = zones?.zoneOf({ min: point, max: point });
    const furnitureUses = keys.reduce((uses, key) => uses + (host?.cache.uses(key) ?? 0), 0);
    return { ...dev.streaming(), zones: zones?.stats(), building: zone ? zones?.residency?.inspect(zone) : null, furnitureUses };
  }, { point: inside, keys: furnitureKeys });
}

async function move(page: Page, position: Point, target: Point, frames = 2) {
  await page.evaluate(async ({ position, target, frames, ms }) => {
    const dev = window.__forgeDev;
    dev.pause();
    dev.moveCamera(...position, target);
    for (let i = 0; i < frames; i += 1) await dev.step(ms);
  }, { position, target, frames, ms: CITY_FRAME_MS });
}

async function walk(page: Page, route: readonly Point[], inside: Point) {
  const result = await page.evaluate(({ route, inside, speed }) => new Promise<{
    intervals: number[];
    checkpoints: Checkpoint[];
  }>((resolve) => {
    const dev = window.__forgeDev;
    const zones = dev.host()?.world?.zones;
    const zone = zones?.zoneOf({ min: inside, max: inside });
    const segments = route.slice(1).map((end, i) => {
      const start = route[i]!;
      return { start, end, length: Math.hypot(end[0] - start[0], end[2] - start[2]) };
    });
    const intervals: number[] = [];
    const checkpoints: Checkpoint[] = [];
    let started: number | undefined, previous: number | undefined;
    let sample = 0;
    const step = (now: number) => {
      started ??= now;
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      const elapsed = now - started;
      let distance = elapsed / 1000 * speed;
      for (const { start, end, length } of segments) {
        if (distance <= length) {
          const t = distance / length;
          const x = start[0] + (end[0] - start[0]) * t;
          const z = start[2] + (end[2] - start[2]) * t;
          if (elapsed >= sample && zone && zones?.residency) {
            const cameraZone = zones.last?.cameraZone ?? null;
            const position: Point = [x, start[1], z];
            checkpoints.push({ elapsed, position, cameraZone, building: zones.residency.inspect(zone) });
            sample = elapsed + 125;
          }
          dev.moveCamera(x, start[1], z, [x + end[0] - start[0], start[1], z + end[2] - start[2]]);
          requestAnimationFrame(step);
          return;
        }
        distance -= length;
      }
      const start = route[0]!, target = route[1]!;
      dev.moveCamera(...start, target);
      dev.pause();
      resolve({ intervals, checkpoints });
    };
    dev.resume();
    requestAnimationFrame(step);
  }), { route, inside, speed: SPEED });
  return { ...result, frameMs: distribution(result.intervals) };
}

for (const backend of ["webgpu", "webgl2"] as const) {
  test(`R9c building streaming on ${backend}`, async ({ context, browser }) => {
    test.skip(process.env.FORGE_CITY_BACKEND !== undefined && process.env.FORGE_CITY_BACKEND !== backend, "backend filter");
    test.setTimeout(720_000);
    const file = join(process.env.FORGE_CITY_TEMP_PROJECT!, ".forge-cache", "city.json");
    const fixture = JSON.parse(await readFile(file, "utf8")) as Fixture;
    const facade = fixture.poses.find(({ id }) => id === "facade")!;
    const threshold = fixture.poses.find(({ id }) => id === "threshold")!;
    const inside = fixture.poses.find(({ id }) => id === "inside")!;
    const [approach, ...rest] = fixture.walk;
    const start: Point = [approach![0] - 75, approach![1], approach![2]];
    const route = [start, approach!, ...rest.slice(0, -1), approach!, start];
    const profiles = backend === "webgpu" && process.env.FORGE_CITY_HIGH_ONLY !== "1" ? ["high", "ultra"] : ["high"];
    const browserCdp = await browser.newBrowserCDPSession();
    const { gpu } = await browserCdp.send("SystemInfo.getInfo");
    await browserCdp.detach();
    const nvidia = backend === "webgpu" ? execFileSync("nvidia-smi", [
      "--query-gpu=name,pci.device_id,driver_version", "--format=csv,noheader",
    ], { encoding: "utf8" }).trim().split(/\r?\n/) : [];
    await mkdir(OUTPUT, { recursive: true });
    const results = [];
    for (const profile of profiles) for (const enabled of backend === "webgpu" ? [false, true] : [true]) {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text());
      });
      try {
        const cdp = backend === "webgpu" ? await context.newCDPSession(page) : null;
        const heap = async () => {
          if (!cdp) return null;
          await cdp.send("HeapProfiler.collectGarbage");
          return (await cdp.send("Runtime.getHeapUsage")).usedSize;
        };
        const query = `&staticPath=auto${backend === "webgl2" ? "&forceWebGL" : ""}${enabled ? "" : "&buildingStreaming=off"}`;
        await openSmokeLevel(page, fixture.level, { id: "walk", position: start, target: approach! }, query, profile);
        const { proof, fallback } = await page.evaluate(() => {
          const host = window.__forgeDev.host()!;
          const device = (host.renderer.backend as unknown as { device?: { adapterInfo?: { isFallbackAdapter?: boolean } } }).device;
          return { proof: host.proof, fallback: device?.adapterInfo?.isFallbackAdapter ?? null };
        });
        expect(proof.backend).toBe(backend);
        if (backend === "webgpu") {
          const adapter = Object.values(proof.adapter ?? {}).join(" ");
          expect(adapter).toMatch(/nvidia/i);
          expect(adapter).not.toMatch(/swiftshader|llvmpipe|lavapipe|software|fallback|\bwarp\b/i);
          expect(fallback).not.toBe(true);
          expect(gpu.devices.some((device) => /RTX/i.test(device.deviceString)) || (nvidia.length === 1 && /RTX/i.test(nvidia[0]!))).toBe(true);
          expect(proof.timestampQuery).toBe(true);
        }
        await citySettle(page);
        const before = { ...await snapshot(page, inside.position), heap: await heap() };
        const first = await walk(page, route, inside.position);
        await citySettle(page);
        const returned = { ...await snapshot(page, inside.position), heap: await heap() };
        const repeat = backend === "webgpu" ? await walk(page, route, inside.position) : null;
        await citySettle(page);
        if (enabled && backend === "webgpu") {
          await page.waitForTimeout(31_000);
          await citySettle(page);
        }
        const evicted = { ...await snapshot(page, inside.position), heap: await heap() };
        const captures = [];
        for (const pose of [threshold, inside, facade]) {
          await move(page, pose.position, pose.target);
          await citySettle(page);
          const state = await snapshot(page, inside.position);
          let timing = null, counters = null;
          if (pose === facade && backend === "webgpu") {
            await cityFrames(page, 30);
            timing = await cityFrames(page, 120);
            counters = await cityDraws(page);
          }
          const image = enabled && profile === "high" ? `${backend}-${pose.id}.png` : null;
          captures.push({ pose: pose.id, state, timing, counters, image });
        }
        let releaseProbe = null;
        if (enabled) {
          // Existing city buildings share the same model catalogue. Move
          // vertically beyond all of them without moving the WP source on XZ.
          const [x, , z] = facade.position;
          await move(page, [x, 250, z], facade.target);
          await citySettle(page);
          releaseProbe = await snapshot(page, inside.position);
        }
        if (enabled && profile === "high") {
          await move(page, facade.position, facade.target);
          await citySettle(page);
          await page.evaluate(async (module) => {
            const { addBuildingInspectionLight } = await import(module);
            addBuildingInspectionLight(window.__forgeDev.host()!.world!.scene);
          }, "/tests/smoke/fixtures/buildingStreamingVisual.ts");
          for (const [index, pose] of [threshold, inside, facade].entries()) {
            await move(page, pose.position, pose.target, 5);
            await page.getByTestId("forge-canvas").screenshot({ path: join(OUTPUT, captures[index]!.image!) });
          }
        }
        results.push({ profile, enabled, proof, fallback, before, first, returned, repeat, evicted, captures, releaseProbe, errors });
        await writeFile(join(OUTPUT, `${backend}.json`), JSON.stringify({
          date: new Date().toISOString(), browser: browser.version(), gpuDevices: gpu.devices, nvidia,
          viewport: SMOKE_VIEWPORT, speed: SPEED, route, fixture: { counts: fixture.counts, zones: fixture.zones }, results,
        }, null, 2) + "\n");
        expect.soft(errors).toEqual([]);
        if (enabled) {
          expect.soft(before.building).toMatchObject({ phase: "cold", resident: 0 });
          expect.soft(first.checkpoints.some(({ building }) => building?.phase === "prefetch" && building.resident > 0)).toBe(true);
          const indoors = first.checkpoints.filter(({ cameraZone, building }) => cameraZone !== null && (building?.distance ?? Infinity) < 8);
          const doorway = first.checkpoints.filter(({ position }) => Math.abs(position[0] - threshold.position[0]) < 0.1 &&
            Math.abs(position[2] - threshold.position[2]) <= 1.2);
          expect.soft(indoors.length).toBeGreaterThan(0);
          expect.soft(indoors.every(({ building }) => building?.phase === "active" && building.resident > 0 && building.ready === building.resident)).toBe(true);
          expect.soft(doorway.length).toBeGreaterThan(0);
          expect.soft(doorway.every(({ building }) => building?.phase === "active" && building.ready > 0 && building.ready === building.placements)).toBe(true);
          expect.soft(returned.building).toMatchObject({ phase: "cold", resident: 0 });
          expect.soft(releaseProbe?.building).toMatchObject({ phase: "cold", resident: 0 });
          expect.soft(releaseProbe?.cells?.active).toBe(captures.at(-1)?.state.cells?.active);
          expect.soft(releaseProbe?.furnitureUses).toBeLessThan(captures.at(-1)!.state.furnitureUses);
          for (const { state } of captures) {
            expect.soft(state.building?.ready).toBeGreaterThan(0);
            expect.soft(state.building?.ready).toBe(state.building?.placements);
          }
          if (backend === "webgpu") {
            expect.soft(evicted.cache?.pendingEvict).toBe(0);
            // The first walk can activate another WP cell. Compare the same settled cells.
            expect.soft(evicted.cells?.active).toBe(returned.cells?.active);
            expect.soft(evicted.gpu).toEqual(returned.gpu);
            expect.soft(evicted.cache?.entries).toBeLessThanOrEqual(returned.cache?.entries ?? 0);
            expect.soft(evicted.heap).toBeLessThanOrEqual((returned.heap ?? 0) * 1.05);
            for (const run of [first, repeat!]) {
              expect.soft(run.frameMs?.p99).toBeLessThanOrEqual(20);
              expect.soft(run.frameMs?.max).toBeLessThanOrEqual(50);
            }
          }
        }
      } finally {
        await page.close();
      }
    }
  });
}
