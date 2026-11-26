// Wetness and snow on static surfaces on the real GPU (plan phase W4, HV-04,
// HV-12). On Derekavak's terrain in front of the camera (development hook; the
// reference project is not written): a coloured block of shapes (its top and
// a side), a slab overhead (its underside), a starter rock (a static mesh with
// its `forge.material`) and the ground beside them. Probes are the projected
// centres of those faces; each reading is a patch's mean luminance.
//
// - HV-04: at the same wetness the top changes more than the side, the side
//   more than the underside, which does not change; the ground (terrain)
//   darkens by the same rule as the block's top. Snow whitens the top (white,
//   not the block's colour), not the standing side nor the underside.
// - The same in three draw paths: instanced (`auto`), GPU-driven
//   (`staticPath=gpu`) and WebGL2 (the CPU twin).
// - Changing the surface and the weather makes no pipeline (WebGPU); nor do
//   the patch settings (`wetSpread`, `snowSpread`, `patchSize`) or a half,
//   patchy snow. The probes read full snow / wetness, where the look is the
//   same at any patch setting (surfaceResponse.ts `patchySnow`).
// - HV-12: Derekavak's P2 (the far view: HLOD proxies, far terrain) dry / wet /
//   snowy, for the eye. Candidates `render-refs/candidates/weather-*.png`.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gpuMemory, installGpuMemory } from "./gpuMemory.ts";
import { REPO_ROOT } from "./renderPaths.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

type Vec3 = [number, number, number];
interface Dev {
  spawn(raw: unknown[]): string[];
  pause(): void;
  step(ms: number): Promise<unknown>;
  setWeather(preset: string, intensity: number): void;
  setSurface(surface: Record<string, number>): void;
  setSurfaceSettings(settings: Record<string, number>): void;
  setLateVisible(visible: boolean): void;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  project(points: readonly Vec3[]): ([number, number] | null)[];
  streaming(): { camera: Vec3; hlod: { loaded: number; visible: number } };
  environmentState(): unknown;
  terrainHeights(points: readonly (readonly [number, number])[]): Promise<(number | null)[]>;
}

const FRAME_MS = 1000 / 60;
const SHAPE_SIZE = 0.5;
const ROCKS = join(REPO_ROOT, "content/packs/starter/procgen/rocks");
test.use({ viewport: SMOKE_VIEWPORT });

const evaluate = <T>(page: Page, run: (dev: Dev, arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => {
    const fn = new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown;
    return fn((window as unknown as { __forgeDev: Dev }).__forgeDev, value);
  }, [run.toString(), arg] as const) as Promise<T>;
const steps = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await evaluate(page, (d, ms) => d.step(ms as number), FRAME_MS);
};
const candidate = (name: string, data: Buffer): void => {
  const folder = join(RENDER_REFS, "candidates");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `weather-${name}.png`), data);
};

/** Mean linear-ish colour (0..255 sRGB channels) of a square patch around each pixel of a screenshot. */
async function patches(page: Page, png: Buffer, at: readonly ([number, number] | null)[], radius = 4): Promise<([number, number, number] | null)[]> {
  return page.evaluate(async ([base64, points, r]) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const scale = image.width / window.innerWidth;
    return points.map((point) => {
      if (!point) return null;
      const x = Math.round(point[0] * scale), y = Math.round(point[1] * scale);
      const data = context.getImageData(x - r, y - r, 2 * r + 1, 2 * r + 1).data;
      let red = 0, green = 0, blue = 0;
      for (let i = 0; i < data.length; i += 4) { red += data[i]!; green += data[i + 1]!; blue += data[i + 2]!; }
      const n = data.length / 4;
      return [red / n, green / n, blue / n] as [number, number, number];
    });
  }, [png.toString("base64"), at, radius] as const);
}

function shape(index: number, centre: Vec3, size: Vec3, color: string): unknown {
  return {
    id: `act_feed${index.toString(16).padStart(28, "0")}`, name: `Weather rig ${index}`, spatiallyLoaded: false,
    transform: { p: centre, r: [0, 0, 0, 1], s: [size[0] / SHAPE_SIZE, size[1] / SHAPE_SIZE, size[2] / SHAPE_SIZE] },
    components: { shape: { type: "forge.shape@2", primitive: "cube", color, castShadow: true, collision: false, landmark: false } },
  };
}

function rockModel(): string {
  const folder = join(ROCKS, "RockRounded");
  const meta = readdirSync(folder).filter((file) => file.endsWith("_lod0.glb.meta.json")).sort()[0]!;
  return (JSON.parse(readFileSync(join(folder, meta), "utf8")) as { id: string }).id;
}

const MODES = [
  { name: "instanced", query: "", webgl: false },
  { name: "gpu", query: "&staticPath=gpu", webgl: false },
  { name: "webgl2", query: "&forceWebGL", webgl: true },
] as const;

for (const mode of MODES) {
  test(`surface weather (${mode.name}): up > standing > down, terrain by the same rule, snow white on top, nothing compiles`, async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(`${message.text()} (${message.location().url})`); });
    if (!mode.webgl) await installGpuMemory(page);
    const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
    await openSmokeLevel(page, scene.level, scene.poses.find((entry) => entry.id === "p1")!, mode.query);
    await expect(page.locator(`canvas[data-forge-backend='${mode.webgl ? "webgl2" : "webgpu"}']`)).toBeVisible();
    if ((await evaluate(page, (d) => d.environmentState())) === null) {
      await evaluate(page, (d) => d.spawn([{ id: "act_ffffffffffffffffffffffffffffffa7", spatiallyLoaded: false,
        components: { environment: { type: "forge.worldEnvironment@3", hour: 12 } } }]));
    }
    await page.waitForTimeout(2500);
    await evaluate(page, (d) => d.pause());

    const camera = (await evaluate(page, (d) => d.streaming())).camera;
    const cx = camera[0] + 12, cz = camera[2];
    const [ground, pavingGround, rockGround] = await evaluate(page, (d, at) => d.terrainHeights(at as [number, number][]),
      [[cx, cz], [cx - 2.3, cz - 1.2], [cx + 0.5, cz - 3.5]]);
    expect(ground, "the rig stands on loaded terrain").not.toBeNull();
    const g = ground!;
    const block: Vec3 = [cx, g + 1, cz];
    const slab: Vec3 = [cx, g + 3.2, cz + 6];
    const rock: Vec3 = [cx + 0.5, rockGround ?? g, cz - 3.5];
    await evaluate(page, (d, raw) => d.spawn(raw as unknown[]), [
      shape(1, block, [2, 2, 2], "#b04a3a"),
      shape(2, slab, [3, 0.2, 3], "#8a8f96"),
      { id: "act_feed0000000000000000000000000003", name: "Weather rig rock", spatiallyLoaded: false,
        transform: { p: rock, r: [0, 0, 0, 1], s: [1.6, 1.6, 1.6] },
        components: { mesh: { type: "forge.staticMesh@2", mesh: rockModel(), materials: [] } } },
    ]);
    // The rock's material textures (KTX2) come in after its model.
    for (let i = 0; i < 20; i += 1) { await page.waitForTimeout(250); await steps(page, 6); }

    // Each face seen head on: a wet surface's reflection at a grazing view offsets its darkening.
    const poses = {
      top: { at: [cx - 0.6, g + 9, cz - 0.6] as Vec3, look: [cx, g, cz] as Vec3 },
      side: { at: [cx - 5, g + 1, cz] as Vec3, look: [cx, g + 1, cz] as Vec3 },
      under: { at: [cx + 0.3, g + 0.6, cz + 6.3] as Vec3, look: [cx, g + 3.1, cz + 6] as Vec3 },
    };
    const probes = {
      top: [cx + 0.3, g + 2.001, cz + 0.3] as Vec3,
      side: [cx - 1.001, g + 1.0, cz] as Vec3,
      bottom: [cx, g + 3.099, cz + 6] as Vec3,
      // Derekavak's paved square (a static mesh) beside the block, and its terrain further out.
      paving: [cx - 2.3, (pavingGround ?? g) + 0.05, cz - 1.2] as Vec3,
      terrain: [cx, g, cz] as Vec3,
      rock: [rock[0], rock[1] + 1.15, rock[2]] as Vec3,
    };
    const go = async (pose: keyof typeof poses): Promise<void> => {
      const { at, look } = poses[pose];
      await evaluate(page, (d, arg) => { const [p, l] = arg as [Vec3, Vec3]; d.moveCamera(p[0], p[1], p[2], l); }, [at, look]);
      await steps(page, 6);
    };
    const surface = async (snowCoverage: number, wetness: number): Promise<void> => {
      // Drawn frames: a change shows a few frames later (two were not enough).
      await evaluate(page, (d, s) => d.setSurface(s as Record<string, number>), { snowCoverage, wetness });
      await steps(page, 6);
      await page.waitForTimeout(60);
    };
    type Colours = Record<string, [number, number, number] | null>;
    /** The probes of a pose under a surface state (the late layer hidden: no streaks in the patches). */
    const read = async (pose: keyof typeof poses, names: readonly (keyof typeof probes)[], snowCoverage: number, wetness: number, shotName: string): Promise<Colours> => {
      await go(pose);
      await surface(snowCoverage, wetness);
      const png = await page.screenshot();
      candidate(`${mode.name}-${pose}-${shotName}`, png);
      const at = await evaluate(page, (d, p) => d.project(p as Vec3[]), names.map((name) => probes[name]));
      const colours = await patches(page, png, at);
      return Object.fromEntries(names.map((name, i) => [name, colours[i] ?? null]));
    };

    // The terrain beyond the paving: 5 m to the right of the top view's centre (screen right, solved from two projections).
    await go("top");
    const [o, ex, ez] = (await evaluate(page, (d, p) => d.project(p as Vec3[]), [[cx, g, cz], [cx + 1, g, cz], [cx, g, cz + 1]])) as [[number, number], [number, number], [number, number]];
    const ax = ex[0] - o[0], ay = ex[1] - o[1], bx = ez[0] - o[0], by = ez[1] - o[1];
    const det = ax * by - ay * bx;
    // World (dx, dz) whose screen step is (1, 0): solve [ax bx; ay by] (dx, dz) = (1, 0).
    const right = [by / det, -ay / det];
    const length = Math.hypot(right[0]!, right[1]!);
    const tx = cx + (right[0]! / length) * 5, tz = cz + (right[1]! / length) * 5;
    const [terrainGround] = await evaluate(page, (d, at) => d.terrainHeights(at as [number, number][]), [[tx, tz]]);
    probes.terrain = [tx, (terrainGround ?? g) + 0.01, tz];

    await evaluate(page, (d) => { d.setWeather("clear", 1); d.setLateVisible(false); });
    const before = mode.webgl ? null : await gpuMemory(page);
    const states = { dry: [0, 0], wet: [0, 1], snow: [1, 0] } as const;
    const seen: Record<string, Colours> = {};
    for (const [name, [snow, wet]] of Object.entries(states)) {
      seen[name] = {
        ...(await read("top", ["top", "paving", "terrain", "rock"], snow, wet, name)),
        ...(await read("side", ["side"], snow, wet, name)),
        ...(await read("under", ["bottom"], snow, wet, name)),
      };
    }
    // The weather too: rain falls, snow falls, clear again; then dry.
    for (const preset of ["rain", "snow", "clear"]) {
      await evaluate(page, (d, p) => d.setWeather(p as string, 1), preset);
      await steps(page, 3);
    }
    // W5 refinement: the patch spread and size are uniforms too; half snow is patchy (one shot for the eye).
    await evaluate(page, (d) => d.setSurfaceSettings({ wetSpread: 0.4, snowSpread: 0.5, patchSize: 2 }));
    await go("top");
    await surface(0.7, 0.8);
    candidate(`${mode.name}-top-patchy`, await page.screenshot());
    await evaluate(page, (d) => d.setSurfaceSettings({ wetSpread: 1, snowSpread: 1, patchSize: 1 }));
    await surface(0.5, 0);
    await surface(0, 0);
    const after = mode.webgl ? null : await gpuMemory(page);

    /** How much a probe's colour moved from dry, relative to its dry colour (sum of channels). */
    const change = (probe: string, state: string): number => {
      const dry = seen.dry![probe], now = seen[state]![probe];
      expect(dry, `${probe} is on screen`).not.toBeNull();
      const moved = Math.abs(now![0] - dry![0]) + Math.abs(now![1] - dry![1]) + Math.abs(now![2] - dry![2]);
      return moved / Math.max(3, dry![0] + dry![1] + dry![2]);
    };
    const wet = {
      top: change("top", "wet"), side: change("side", "wet"), bottom: change("bottom", "wet"),
      paving: change("paving", "wet"), terrain: change("terrain", "wet"), rock: change("rock", "wet"),
    };
    const snow = { top: change("top", "snow"), side: change("side", "snow"), bottom: change("bottom", "snow"), paving: change("paving", "snow"), terrain: change("terrain", "snow") };
    const snowTop = seen.snow!.top!, groundSnow = seen.snow!.paving!;
    const pipelines = before && after ? after.pipelines - before.pipelines : null;
    const fmt = (values: Record<string, number>): string => Object.entries(values).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(", ");
    const rgb = (c: readonly number[]): string => c.map((v) => v.toFixed(0)).join("/");
    console.log(`surface weather ${mode.name}: wet ${fmt(wet)}; snow ${fmt(snow)}; snow top ${rgb(snowTop)} (dry ${rgb(seen.dry!.top!)}), `
      + `snowy paving ${rgb(groundSnow)}, snowy terrain ${rgb(seen.snow!.terrain!)}; pipelines +${pipelines ?? "-"}`);
    writeFileSync(join(RENDER_REFS, "candidates", `weather-${mode.name}-probes.json`), JSON.stringify({ wet, snow, seen }, null, 1));

    expect(wet.top, "the top changes when wet").toBeGreaterThan(0.1);
    expect(wet.top, "the top more than the side").toBeGreaterThan(wet.side);
    expect(wet.side, "the side more than the underside").toBeGreaterThan(wet.bottom);
    expect(wet.bottom, "the underside stays dry").toBeLessThan(0.02);
    expect(wet.paving, "the paving gets wet").toBeGreaterThan(0.1);
    expect(wet.terrain, "the terrain gets wet").toBeGreaterThan(0.1);
    expect(wet.rock, "the rock gets wet").toBeGreaterThan(0.05);
    expect(snow.top, "snow on the top").toBeGreaterThan(0.3);
    expect(snow.paving, "snow on the paving").toBeGreaterThan(0.3);
    expect(snow.terrain, "snow on the terrain").toBeGreaterThan(0.3);
    // Snow is white on the red block, not tinted by it.
    expect(snowTop[0], "snow is not the block's red").toBeLessThanOrEqual(snowTop[2] + 10);
    expect(snow.side, "no snow on a standing face").toBeLessThan(0.05);
    expect(snow.bottom, "no snow on the underside").toBeLessThan(0.02);
    if (pipelines !== null) expect(pipelines, "surface and weather changes compile nothing").toBe(0);
    expect(errors).toEqual([]);
  });
}

test("surface weather far view (HV-12): HLOD proxies and far terrain dry, wet and snowy", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(`${message.text()} (${message.location().url})`); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  await openSmokeLevel(page, scene.level, scene.poses.find((entry) => entry.id === "p2")!);
  await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
  if ((await evaluate(page, (d) => d.environmentState())) === null) {
    await evaluate(page, (d) => d.spawn([{ id: "act_ffffffffffffffffffffffffffffffa7", spatiallyLoaded: false,
      components: { environment: { type: "forge.worldEnvironment@3", hour: 12 } } }]));
  }
  await page.waitForTimeout(3000);
  await evaluate(page, (d) => { d.pause(); d.setLateVisible(false); });
  await steps(page, 20);
  const hlod = (await evaluate(page, (d) => d.streaming())).hlod;
  for (const [name, snowCoverage, wetness] of [["dry", 0, 0], ["wet", 0, 1], ["snow", 1, 0]] as const) {
    await evaluate(page, (d, s) => d.setSurface(s as Record<string, number>), { snowCoverage, wetness });
    await steps(page, 6);
    await page.waitForTimeout(60);
    candidate(`far-${name}`, await page.screenshot());
  }
  console.log(`surface weather far view: HLOD proxies ${hlod.visible} visible of ${hlod.loaded} loaded`);
  expect(errors).toEqual([]);
});
