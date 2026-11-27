// Weather drives the surface on the real GPU (plan phase W5, HV-05): on
// Derekavak (development hooks; the reference project is not written) the
// World Environment's weather link is switched on and its time run ahead
// without drawing (`advanceEnvironment`), then each moment is drawn and shot
// from a low pose over the ground and from P2.
//
// - Rain: dry -> wetting (patchy) -> wet -> standing water; it stops: the film
//   dries first (patchy: noise and hollows dry last), the standing water after
//   it, then dry again.
// - Snow: it covers and deepens; it stops: the depth melts first, then the
//   cover, the ground stays wet and then dries.
// - The model's order is read from the live state at every moment; the image
//   follows it (wet darker than dry, back to dry at the end); no pipeline is
//   made by any of it. Shots: `render-refs/candidates/w5-<series>-<n>-<moment>-<pose>.png`.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gpuMemory, installGpuMemory } from "./gpuMemory.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

type Vec3 = [number, number, number];
interface Surface { wetness: number; puddleFill: number; snowCoverage: number; snowDepth: number }
interface Dev {
  spawn(raw: unknown[]): string[];
  pause(): void;
  step(ms: number): Promise<unknown>;
  setWeather(preset: string, intensity: number): void;
  setSurface(surface: Record<string, number>): void;
  setWeatherDrivesSurface(on: boolean): void;
  advanceEnvironment(seconds: number): void;
  setLateVisible(visible: boolean): void;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  streaming(): { camera: Vec3 };
  environmentState(): { surface: Surface } | null;
  terrainHeights(points: readonly (readonly [number, number])[]): Promise<(number | null)[]>;
}

const FRAME_MS = 1000 / 60;
test.use({ viewport: SMOKE_VIEWPORT });

const evaluate = <T>(page: Page, run: (dev: Dev, arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => {
    const fn = new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown;
    return fn((window as unknown as { __forgeDev: Dev }).__forgeDev, value);
  }, [run.toString(), arg] as const) as Promise<T>;
const steps = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await evaluate(page, (d, ms) => d.step(ms as number), FRAME_MS);
};

/** Mean luminance (0..255) of the screenshot's lower middle (the ground in both poses). */
async function groundLuminance(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(Math.round(image.width * 0.25), Math.round(image.height * 0.6), Math.round(image.width * 0.5), Math.round(image.height * 0.3)).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    return sum / (data.length / 4);
  }, png.toString("base64"));
}

interface Moment { name: string; weather: "clear" | "rain" | "snow"; seconds: number }
/** Each moment runs `seconds` of simulation time under `weather` after the previous one. */
const SERIES: Record<"rain" | "snow", readonly Moment[]> = {
  rain: [
    { name: "dry", weather: "clear", seconds: 0 },
    { name: "wetting", weather: "rain", seconds: 4 },
    { name: "wet", weather: "rain", seconds: 8 },
    { name: "pooling", weather: "rain", seconds: 150 },
    { name: "drying-film", weather: "clear", seconds: 40 },
    { name: "drying-late", weather: "clear", seconds: 45 },
    { name: "film-dry", weather: "clear", seconds: 20 },
    { name: "water-draining", weather: "clear", seconds: 200 },
    { name: "dry-again", weather: "clear", seconds: 200 },
  ],
  snow: [
    { name: "dry", weather: "clear", seconds: 0 },
    { name: "covering", weather: "snow", seconds: 40 },
    { name: "covered", weather: "snow", seconds: 260 },
    { name: "depth-melting", weather: "clear", seconds: 300 },
    { name: "cover-melting", weather: "clear", seconds: 200 },
    { name: "wet-after-snow", weather: "clear", seconds: 110 },
    { name: "drying", weather: "clear", seconds: 60 },
    { name: "dry-again", weather: "clear", seconds: 1200 },
  ],
};

test("HV-05: rain wets, the film dries before the water; snow melts depth, cover, then the wet ground dries", async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(`${message.text()} (${message.location().url})`); });
  await installGpuMemory(page);
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  const p2 = scene.poses.find((entry) => entry.id === "p2")!;
  await openSmokeLevel(page, scene.level, p2);
  await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
  if ((await evaluate(page, (d) => d.environmentState())) === null) {
    await evaluate(page, (d) => d.spawn([{ id: "act_ffffffffffffffffffffffffffffffa7", spatiallyLoaded: false,
      components: { environment: { type: "forge.worldEnvironment@3", hour: 12 } } }]));
  }
  await page.waitForTimeout(3000);
  await evaluate(page, (d) => { d.pause(); d.setLateVisible(false); d.setWeatherDrivesSurface(true); });
  await steps(page, 20);

  // A low pose over the ground in front of P2's camera.
  const camera = (await evaluate(page, (d) => d.streaming())).camera;
  const ahead: [number, number] = [camera[0], camera[2] + 14];
  const [ground = null] = await evaluate(page, (d, at) => d.terrainHeights([at as [number, number], [(at as number[])[0]!, (at as number[])[1]! - 14]]), ahead);
  expect(ground, "the ground ahead of P2 is terrain").not.toBeNull();
  const poses = {
    low: { at: [camera[0], ground! + 3.5, camera[2]] as Vec3, look: [ahead[0], ground!, ahead[1]] as Vec3 },
    p2: { at: [...p2.position!] as Vec3, look: [...p2.target!] as Vec3 },
  };
  const folder = join(RENDER_REFS, "candidates");
  mkdirSync(folder, { recursive: true });
  const pipelinesBefore = (await gpuMemory(page)).pipelines;

  const report: Record<string, { moment: string; surface: Surface; luminance: Record<string, number> }[]> = {};
  for (const [series, moments] of Object.entries(SERIES)) {
    await evaluate(page, (d) => { d.setWeather("clear", 1); d.setSurface({ wetness: 0, puddleFill: 0, snowCoverage: 0, snowDepth: 0 }); });
    const rows: { moment: string; surface: Surface; luminance: Record<string, number> }[] = [];
    for (const [index, moment] of moments.entries()) {
      await evaluate(page, (d, m) => {
        const next = m as Moment;
        d.setWeather(next.weather, 1);
        if (next.seconds > 0) d.advanceEnvironment(next.seconds);
      }, moment);
      const surface = (await evaluate(page, (d) => d.environmentState()))!.surface;
      const luminance: Record<string, number> = {};
      for (const [poseName, pose] of Object.entries(poses)) {
        await evaluate(page, (d, p) => { const q = p as { at: Vec3; look: Vec3 }; d.moveCamera(q.at[0], q.at[1], q.at[2], q.look); }, pose);
        await steps(page, 6);
        await page.waitForTimeout(60);
        const shot = await page.screenshot();
        writeFileSync(join(folder, `w5-${series}-${index}-${moment.name}-${poseName}.png`), shot);
        luminance[poseName] = await groundLuminance(page, shot);
      }
      rows.push({ moment: moment.name, surface: { ...surface }, luminance });
    }
    report[series] = rows;
  }
  console.log(JSON.stringify(report, null, 1));
  const at = (series: "rain" | "snow", name: string) => report[series]!.find((row) => row.moment === name)!;

  // Rain: the order of the model (HV-05).
  expect(at("rain", "wetting").surface.wetness).toBeGreaterThan(0);
  expect(at("rain", "wetting").surface.wetness).toBeLessThan(1);
  expect(at("rain", "pooling").surface.puddleFill).toBeGreaterThan(0.5);
  // (Drawing a moment runs a few frames too: compare two moments under the same clear sky.)
  expect(at("rain", "drying-late").surface.puddleFill, "the water waits for the film").toBe(at("rain", "drying-film").surface.puddleFill);
  expect(at("rain", "film-dry").surface.wetness).toBe(0);
  expect(at("rain", "water-draining").surface.puddleFill).toBeLessThan(at("rain", "film-dry").surface.puddleFill);
  expect(at("rain", "dry-again").surface).toEqual({ wetness: 0, puddleFill: 0, snowCoverage: 0, snowDepth: 0 });
  // Snow starts with flat cover and melts in reverse order.
  expect(at("snow", "covering").surface.snowCoverage).toBeGreaterThan(0);
  expect(at("snow", "covering").surface.snowCoverage).toBeLessThan(1);
  expect(at("snow", "covering").surface.snowDepth).toBe(0);
  expect(at("snow", "covered").surface.snowDepth).toBeGreaterThan(0.1);
  expect(at("snow", "depth-melting").surface.snowCoverage).toBe(1);
  expect(at("snow", "cover-melting").surface.snowDepth).toBe(0);
  expect(at("snow", "cover-melting").surface.snowCoverage).toBeLessThan(1);
  expect(at("snow", "wet-after-snow").surface.snowCoverage).toBe(0);
  expect(at("snow", "wet-after-snow").surface.wetness).toBeGreaterThan(0.5);
  expect(at("snow", "dry-again").surface).toEqual({ wetness: 0, puddleFill: 0, snowCoverage: 0, snowDepth: 0 });

  // The image follows: wet ground looks different from dry (under an overcast sky a hard wet surface reflects
  // it, so it can be brighter), snow too, and dry again looks as it did.
  for (const pose of ["low", "p2"]) {
    const dry = at("rain", "dry").luminance[pose]!;
    expect(Math.abs(at("rain", "wet").luminance[pose]! - dry), `${pose}: wet shows`).toBeGreaterThan(2);
    expect(Math.abs(at("rain", "dry-again").luminance[pose]! - dry), `${pose}: dry again`).toBeLessThan(0.5);
    expect(Math.abs(at("snow", "dry-again").luminance[pose]! - dry), `${pose}: dry after the snow`).toBeLessThan(0.5);
    expect(at("snow", "covered").luminance[pose]!, `${pose}: snow is brighter`).toBeGreaterThan(dry + 5);
  }
  // Under the same clear sky the drying ground moves from the wet look toward the dry one. Measured at P2: much of
  // the low pose is standing water, which stays while the film dries and mirrors the sky, brighter than dry ground.
  const p2Look = (name: string) => at("rain", name).luminance.p2!;
  const p2Dry = p2Look("dry");
  expect(Math.abs(p2Look("drying-late") - p2Dry)).toBeLessThan(Math.abs(p2Look("drying-film") - p2Dry));
  expect((await gpuMemory(page)).pipelines - pipelinesBefore, "no pipeline for any of it").toBe(0);
  writeFileSync(join(RENDER_REFS, "runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-w5-surface.json`), JSON.stringify(report, null, 1));
  expect(errors).toEqual([]);
});
