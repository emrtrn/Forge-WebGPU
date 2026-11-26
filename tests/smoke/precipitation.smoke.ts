// Rain and snow on the actual GPU (plan phase W1, HV-01): drawn by the live
// weather, scaled by its intensity, moving with simulation time only, gone with
// it, with nothing compiled by the first drop. Two pictures the frame may take:
// a level with a Post Process (the late layer in its own pass) with and
// without temporal anti-aliasing, and one drawn straight to the canvas.
// Development state only; the candidates are for the eye.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gpuMemory, installGpuMemory } from "./gpuMemory.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { difference, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface Dev {
  spawn(raw: unknown[]): string[];
  pause(): void;
  step(ms: number): Promise<unknown>;
  setWeather(preset: string, intensity: number): void;
  setLateVisible(visible: boolean): void;
  environmentState(): unknown;
  host(): { world: { late: { root: { children: { visible: boolean; count?: number }[] } } } | null; pipeline?: unknown } | null;
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
const shot = async (page: Page): Promise<Buffer> => {
  await page.waitForTimeout(60);
  return page.screenshot();
};
const candidate = (name: string, data: Buffer): void => {
  const folder = join(RENDER_REFS, "candidates");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `precipitation-${name}.png`), data);
};

/** Opens a scene paused, with a World Environment; `antialias` replaces its Post Process', null removes the actor. */
async function open(page: Page, sceneId: string, poseId: string, antialias?: "traa" | null, webgl = false): Promise<{ errors: string[]; pipeline: string }> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(`${message.text()} (${message.location().url})`); });
  await installGpuMemory(page);
  const scene = SMOKE_SCENES.find((entry) => entry.id === sceneId)!;
  if (antialias !== undefined) {
    await page.route((url) => url.pathname.endsWith("/__forge/read") && (url.searchParams.get("path") ?? "").endsWith("/level.json"), async (route) => {
      const response = await route.fetch();
      const text = await response.text();
      const doc = JSON.parse(text) as { actors?: { components?: Record<string, { type?: string; antialias?: string; ao?: { enabled?: boolean } }> }[] };
      for (const actor of doc.actors ?? []) {
        for (const [key, component] of Object.entries(actor.components ?? {})) {
          if (!component.type?.startsWith("forge.postProcess@")) continue;
          if (antialias === null) delete actor.components![key];
          else component.antialias = antialias;
        }
      }
      await route.fulfill({ response, body: JSON.stringify(doc) });
    });
  }
  await openSmokeLevel(page, scene.level, scene.poses.find((entry) => entry.id === poseId)!, webgl ? "&forceWebGL" : "");
  await expect(page.locator(`canvas[data-forge-backend='${webgl ? "webgl2" : "webgpu"}']`)).toBeVisible();
  if ((await evaluate(page, (d) => d.environmentState())) === null) {
    await evaluate(page, (d) => d.spawn([{ id: "act_ffffffffffffffffffffffffffffffa7", spatiallyLoaded: false,
      components: { environment: { type: "forge.worldEnvironment@3", hour: 12 } } }]));
  }
  await page.waitForTimeout(2500);
  const pipeline = await page.evaluate(() => (JSON.parse(document.querySelector<HTMLElement>("canvas[data-forge-perf]")?.dataset.forgePerf ?? "{}") as { pipeline?: string }).pipeline ?? "?");
  await evaluate(page, (d) => d.pause());
  await steps(page, 10);
  return { errors, pipeline };
}

const modes = [
  { name: "pipeline", antialias: undefined, draws: "smaa", webgl: false },
  { name: "traa", antialias: "traa", draws: "traa", webgl: false },
  { name: "direct", antialias: null, draws: "direct", webgl: false },
  // The editor smoke's backend in CI; never a WebGPU acceptance.
  { name: "pipeline-webgl2", antialias: undefined, draws: "smaa", webgl: true },
  { name: "direct-webgl2", antialias: null, draws: "direct", webgl: true },
] as const;

for (const mode of modes) {
  test(`precipitation: rain and snow draw with the weather, hold in a pause, compile nothing (${mode.name})`, async ({ page }) => {
    const { errors, pipeline } = await open(page, "derekavak", "p1", mode.antialias, mode.webgl);
    console.log(`${mode.name}: ${pipeline}`);
    expect(pipeline).toContain(mode.draws);
    const drawn = () => evaluate(page, (d) => d.host()!.world!.late.root.children.map((child) => ({ visible: child.visible, count: child.count ?? 0 })));
    /** What the late layer adds to the picture at this moment of the same frozen world. */
    const added = async (): Promise<{ amount: number; on: Buffer }> => {
      const on = await shot(page);
      await evaluate(page, (d) => { d.setLateVisible(false); return d.step(0); });
      const off = await shot(page);
      await evaluate(page, (d) => { d.setLateVisible(true); return d.step(0); });
      return { amount: await difference(page, on, off), on };
    };

    expect((await drawn()).every((entry) => !entry.visible)).toBe(true);
    const before = await gpuMemory(page);
    await evaluate(page, (d) => d.setWeather("rain", 1));
    await steps(page, 30);
    const rain = await added();
    const full = (await drawn()).filter((entry) => entry.visible).map((entry) => entry.count);
    expect(full).toHaveLength(2);

    // A pause: the same picture again. Not under TRAA: its own jitter changes a still frame by 1.2 - 2 (with and without rain).
    if (mode.name !== "traa") {
      const held = await shot(page);
      await evaluate(page, (d) => d.step(0));
      expect(await difference(page, held, await shot(page)), "a paused world's rain stands still").toBeLessThan(0.02);
    }
    await steps(page, 1);

    await evaluate(page, (d) => d.setWeather("rain", 0.3));
    await steps(page, 5);
    const light = (await drawn()).filter((entry) => entry.visible).map((entry) => entry.count);
    expect(light[0]! / full[0]!).toBeCloseTo(0.3, 1);

    await evaluate(page, (d) => d.setWeather("snow", 1));
    await steps(page, 30);
    const snow = await added();
    await evaluate(page, (d) => d.setWeather("clear", 1));
    await steps(page, 2);
    expect((await drawn()).every((entry) => !entry.visible)).toBe(true);
    const made = await gpuMemory(page);

    if (made.pipelines > before.pipelines) console.log(`pipelines made: ${made.pipelineLabels.slice(-(made.pipelines - before.pipelines)).join(" | ")}`);
    console.log(`precipitation ${mode.name}: rain adds ${rain.amount.toFixed(3)}, snow adds ${snow.amount.toFixed(3)} (mean luminance), counts ${full.join(" + ")}, pipelines +${made.pipelines - before.pipelines}, modules +${made.shaderModules - before.shaderModules}`);
    candidate(`${mode.name}-rain`, rain.on);
    candidate(`${mode.name}-snow`, snow.on);
    expect(rain.amount, "rain is visible").toBeGreaterThan(0.1);
    expect(snow.amount, "snow is visible").toBeGreaterThan(0.1);
    expect(made.pipelines - before.pipelines, "the first drop compiles nothing").toBe(0);
    expect(errors).toEqual([]);
  });
}
