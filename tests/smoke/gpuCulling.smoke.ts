// GPU-driven drawing on the real GPU (phase 5c step 5.1): Derekavak's foliage
// at P2 (generated in Node, `gpuFoliageScene.ts`: 370 cells / 1,640
// instances, Phase 1 S4's count) as one GPU-driven batch per foliage type.
// At P2, at P1 and looking at the sky:
// - each batch's GPU visible count (compute culling, atomic counter) is inside
//   the CPU reference's certain / possible range for the same view
//   (`engine/world/instanceCulling.ts`, as Phase 1 G7 compared culling);
// - the view changes what is visible;
// - the `?debug` draw count grows by exactly the indirect draws (three counts
//   none of them) and the image changes where the foliage draws;
// - no page or GPU error.
// The same on the WebGL2 test backend (`?forceWebGL`; never a WebGPU
// acceptance): the batches are the CPU twin (the reference culls, instanced
// meshes draw; three counts those draws itself).
// A shot goes to render-refs/candidates/ for the eye and the counts to
// render-refs/runs/; nothing is compared with a reference image.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { derekavakFoliage, type FoliageSceneType } from "./gpuFoliageScene.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import type { RenderHost } from "../../src/render/host/renderHost.ts";
import { difference, git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface ViewCheck { minCasterRadius?: number; gpu: number[]; cpu: { counts: number[]; certain: number[]; possible: number[] } }
interface Check extends ViewCheck { name: string; instances: number; shadows: ViewCheck[]; cameras: ViewCheck[] }
interface Dev {
  host(): RenderHost | null;
  pause(): void;
  resume(): void;
  step(ms: number): Promise<{ ran: boolean }>;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  gpuDriven: {
    install(types: FoliageSceneType[], cullScale: number, castShadow?: boolean, bundle?: boolean): Promise<{ path: "gpu" | "cpu"; batches: number; instances: number; parts: number; draws: number }>;
    check(): Promise<Check[]>;
    stats(): { batches: number; instances: number; draws: number; views: number } | null;
    remove(): Promise<void>;
    mirror(plane: readonly [number, number, number, number] | null): Promise<void>;
    levelVisible(visible: boolean): Promise<void>;
  };
}

const dev = (page: Page) => ({
  pause: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.pause()),
  resume: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.resume()),
  step: (ms: number) => page.evaluate(async (ms) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return (window as unknown as { __forgeDev: Dev }).__forgeDev.step(ms);
  }, ms),
  move: (position: readonly [number, number, number], look: readonly [number, number, number]) =>
    page.evaluate(([p, t]) => (window as unknown as { __forgeDev: Dev }).__forgeDev.moveCamera(p[0], p[1], p[2], t), [position, look] as const),
  install: (types: FoliageSceneType[], scale: number, castShadow = true, bundle = false) =>
    page.evaluate(([list, value, cast, bundled]) => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.install(list, value, cast, bundled), [types, scale, castShadow, bundle] as const),
  check: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.check()),
  stats: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.stats()),
  remove: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.remove()),
  mirror: (plane: readonly [number, number, number, number] | null) =>
    page.evaluate((value) => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.mirror(value), plane),
  levelVisible: (visible: boolean) =>
    page.evaluate((value) => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.levelVisible(value), visible),
});

async function steps(page: Page, count: number, ms = 1000 / 60): Promise<void> {
  for (let i = 0; i < count; i += 1) await dev(page).step(ms);
}

/** Draw calls in the `?debug` readout. */
async function readoutDraws(page: Page): Promise<number> {
  const text = (await page.locator("#debug-stats-readout").textContent()) ?? "";
  const match = /([\d,.\s]+) draw calls/.exec(text);
  return match ? Number(match[1]!.replace(/[^\d]/g, "")) : NaN;
}

/** Triangles in the `?debug` readout. */
async function readoutTriangles(page: Page): Promise<number> {
  const text = (await page.locator("#debug-stats-readout").textContent()) ?? "";
  const match = /([\d,.\s]+) tris/.exec(text);
  return match ? Number(match[1]!.replace(/[^\d]/g, "")) : NaN;
}

test.use({ viewport: SMOKE_VIEWPORT });

for (const backend of ["webgpu", "webgl"] as const) test(`gpu culling (${backend}): Derekavak's foliage culls as the CPU reference does`, async ({ page }, testInfo) => {
  const webgl = backend === "webgl";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  const p2 = scene.poses.find((pose) => pose.id === "p2")!;
  const p1 = scene.poses.find((pose) => pose.id === "p1")!;
  const foliage = derekavakFoliage([p2.position![0], p2.position![2]]);
  expect({ cells: foliage.cells, instances: foliage.instances }).toEqual({ cells: 370, instances: 1640 });

  // Foliage only: the static batches stay instanced so the GPU-driven counts are the foliage's (R9.4).
  await openSmokeLevel(page, scene.level, p2, webgl ? "&debug&forceWebGL&staticPath=instanced" : "&debug&staticPath=instanced");
  await expect(page.locator(`canvas[data-forge-backend='${webgl ? "webgl2" : "webgpu"}']`)).toBeVisible();
  // The level's own foliage (the ring, plan 5c F1; `foliageRing.smoke.ts`) leaves the scene: the installed batches are the only ones.
  await dev(page).levelVisible(false);
  // The readout reads three's count between frames: the frame loop runs for it.
  await expect.poll(() => readoutDraws(page), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  const drawsBefore = await readoutDraws(page);
  const trianglesBefore = await readoutTriangles(page);
  await dev(page).pause();
  await steps(page, 4);
  const plain = await page.getByTestId("forge-canvas").screenshot();

  const installed = await dev(page).install(foliage.types, foliage.cullScale);
  expect(installed).toMatchObject({ path: webgl ? "cpu" : "gpu", batches: foliage.types.length, instances: 1640 });
  await steps(page, 6);

  const views: Array<{ id: string; checks: Check[] }> = [];
  const checkView = async (id: string): Promise<Check[]> => {
    const checks = await dev(page).check();
    const within = (label: string, view: ViewCheck): void => view.gpu.forEach((gpu, lod) => {
      expect(gpu, `${label} LOD ${lod}: GPU ${gpu}, CPU ${view.cpu.counts[lod]} (certain ${view.cpu.certain[lod]}, possible ${view.cpu.possible[lod]})`)
        .toBeGreaterThanOrEqual(view.cpu.certain[lod]!);
      expect(gpu).toBeLessThanOrEqual(view.cpu.possible[lod]!);
    });
    for (const check of checks) {
      within(`${id} ${check.name}`, check);
      // Every shadow view (5.2: each cascade) against the reference for its own planes.
      check.shadows.forEach((shadow, index) => within(`${id} ${check.name} shadow ${index + 1}`, shadow));
      // Every camera view (R9a step 1: a reflection) against the reference for its mirrored planes and eye.
      check.cameras.forEach((camera, index) => within(`${id} ${check.name} camera ${index + 1}`, camera));
    }
    views.push({ id, checks });
    return checks;
  };
  const total = (checks: Check[]): number => checks.reduce((sum, check) => sum + check.gpu.reduce((a, b) => a + b, 0), 0);

  const atP2 = await checkView("p2");
  const visibleP2 = total(atP2);
  expect(visibleP2).toBeGreaterThan(0);
  expect(visibleP2).toBeLessThan(1640);
  const drawn = await page.getByTestId("forge-canvas").screenshot();
  const changed = await difference(page, plain, drawn);
  expect(changed, "the foliage changes the image").toBeGreaterThan(0.5);
  await dev(page).resume();
  const stats = await dev(page).stats();
  // Derekavak's sun casts cascades at `high`: every cascade is a shadow view (5.2).
  expect(stats?.views ?? 0, "the cascades are shadow views").toBeGreaterThan(1);
  // The GPU path issues every indirect draw; three skips the CPU twin's empty instanced meshes.
  if (webgl) expect(stats!.draws).toBeLessThanOrEqual(installed.draws * stats!.views);
  else expect(stats?.draws).toBe(installed.draws * stats!.views);
  await expect.poll(() => readoutDraws(page), { timeout: 20_000, message: "the readout counts every draw of the batches in every view, indirect or not" })
    .toBe(drawsBefore + stats!.draws);
  const drawsAfter = await readoutDraws(page);
  // The drawn triangles count the batches too (5c R5: read back from the GPU on WebGPU, three's own count on WebGL2).
  await expect.poll(() => readoutTriangles(page), { timeout: 20_000, message: "the readout counts the batches' triangles" }).toBeGreaterThan(trianglesBefore);
  const trianglesAfter = await readoutTriangles(page);
  await dev(page).pause();

  // The same main view and stricter radius thresholds in every sun cascade.
  // Both paths must agree with the CPU reference and have no surviving small casters.
  const minTexels = await page.evaluate(() => {
    const host = (window as unknown as { __forgeDev: Dev }).__forgeDev.host()!;
    const quality = host.quality;
    host.setQuality({ ...quality, settings: { ...quality.settings, shadowCasterMinTexels: 10_000 } });
    return quality.settings.shadowCasterMinTexels;
  });
  await steps(page, 4);
  const strict = await checkView("caster-radius");
  expect(total(strict)).toBe(visibleP2);
  const sized = strict.flatMap(check => check.shadows.filter(shadow => shadow.minCasterRadius !== undefined));
  expect(sized.length).toBeGreaterThan(0);
  expect(sized.every(shadow => shadow.gpu.every(count => count === 0))).toBe(true);
  await page.evaluate((threshold) => {
    const host = (window as unknown as { __forgeDev: Dev }).__forgeDev.host()!;
    const quality = host.quality;
    host.setQuality({ ...quality, settings: { ...quality.settings, shadowCasterMinTexels: threshold } });
  }, minTexels);

  // The same batches without shadow views: the shadows they cast change the image.
  await dev(page).install(foliage.types, foliage.cullScale, false);
  await steps(page, 6);
  const shadowless = await page.getByTestId("forge-canvas").screenshot();
  const shadowDifference = await difference(page, shadowless, drawn);
  expect(shadowDifference, "the foliage casts shadows").toBeGreaterThan(0.05);
  const unshadowedDraws = (await dev(page).stats())!.draws;
  if (webgl) expect(unshadowedDraws).toBeLessThanOrEqual(installed.draws);
  else expect(unshadowedDraws, "without castShadow only the main view draws").toBe(installed.draws);
  // In a render bundle (5.3, on WebGPU; WebGL2 has none): the same image.
  // Let each reinstall settle without moving the scene's clouds between shots.
  // The page's overlays (the `?debug` readout and labels) change between frames: hidden for these shots, or
  // the "noise" below is mostly their text and the check passes or fails on chance.
  const overlays = await page.addStyleTag({ content: "body :not(canvas):not(:has(canvas)) { visibility: hidden !important; }" });
  await dev(page).install(foliage.types, foliage.cullScale, true, true);
  await steps(page, 20, 0);
  const bundled = await page.getByTestId("forge-canvas").screenshot();
  await dev(page).install(foliage.types, foliage.cullScale);
  await steps(page, 20, 0);
  // Use two direct shots at the same scene time to measure residual rendering noise.
  const direct = await page.getByTestId("forge-canvas").screenshot();
  const bundleDifference = await difference(page, bundled, direct);
  await steps(page, 6, 0);
  const noise = await difference(page, direct, await page.getByTestId("forge-canvas").screenshot());
  await overlays.evaluate((tag) => tag.remove());
  console.log(`bundle difference ${bundleDifference.toFixed(3)}, direct reinstall ${noise.toFixed(3)}`);
  // WebGL2 has no bundles (the twin ignores the option); its frames also vary more between shots.
  if (!webgl) expect(bundleDifference, "the bundled batches draw what the direct ones do").toBeLessThan(noise + 0.05);

  // A reflection (R9a step 1): water 5 m under the eye. Its own view, mirrored, checked against the CPU reference.
  await dev(page).mirror([0, 1, 0, -(p2.position![1] - 5)]);
  await steps(page, 3);
  const mirrored = await checkView("p2-mirror");
  expect(mirrored.every((check) => check.cameras.length === 1), "every batch culls the reflection's view").toBe(true);
  console.log(`mirror view: ${total(mirrored.map((check) => ({ ...check, gpu: check.cameras[0]!.gpu })))} visible (main ${total(mirrored)})`);
  await dev(page).mirror(null);
  await steps(page, 3);

  await dev(page).move(p1.position!, p1.target!);
  await steps(page, 3);
  const atP1 = await checkView("p1");
  const [x, y, z] = p2.position!;
  await dev(page).move([x, y, z], [x, y + 100, z + 1]);
  await steps(page, 3);
  const atSky = await checkView("sky");
  expect(total(atSky), "looking up culls the foliage below").toBeLessThan(visibleP2);
  expect(total(atP1)).not.toBe(visibleP2);

  await dev(page).remove();
  await steps(page, 2);
  expect(errors).toEqual([]);

  const record = {
    schema: 1,
    kind: "phase 5c steps 5.1 / 5.2 GPU-driven culling smoke (main view and shadow cascades)",
    backend,
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    level: scene.level,
    foliage: { cells: foliage.cells, instances: foliage.instances, types: foliage.types.map((type) => ({ name: type.name, instances: type.matrices.length / 16 })) },
    installed,
    readoutDraws: { before: drawsBefore, after: drawsAfter },
    readoutTriangles: { before: trianglesBefore, after: trianglesAfter },
    shadowViews: stats!.views - 1,
    imageDifference: changed,
    shadowImageDifference: shadowDifference,
    bundleImageDifference: bundleDifference,
    reinstallImageDifference: noise,
    views: views.map(({ id, checks }) => ({ id, visible: total(checks), checks })),
  };
  const stamp = record.date.replace(/[:.]/g, "-");
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  mkdirSync(join(RENDER_REFS, "candidates"), { recursive: true });
  const suffix = webgl ? "-webgl" : "";
  writeFileSync(join(RENDER_REFS, "runs", `${stamp}-gpu-culling${suffix}.json`), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(RENDER_REFS, "candidates", `derekavak-p2-gpu-foliage${suffix}.png`), drawn);
  writeFileSync(join(RENDER_REFS, "candidates", `derekavak-p2-gpu-foliage-shadowless${suffix}.png`), shadowless);
  await testInfo.attach(`derekavak-p2-gpu-foliage${suffix}`, { body: drawn, contentType: "image/png" });
  console.log(`gpu culling (${backend}): ${JSON.stringify(record.views.map((view) => [view.id, view.visible]))}, draws ${installed.draws}`);
});
