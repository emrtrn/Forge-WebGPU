// The level's own procedural foliage (plan 5c F1, step 6): Derekavak's
// Landscape foliage rules (re-imported into the reference project, F0) grow
// around the camera through the foliage binding's ring and draw GPU-driven.
// At P2:
// - the ring settles with nothing pending and its cells / instances are the
//   Node generation's for the same camera (`gpuFoliageScene.ts`: Forge's
//   resident-tile rule, Phase 1 S4's 370 cells / 1,640 instances);
// - every foliage batch's GPU visible count is inside the CPU reference's
//   range for the same view (main view, and the cascades of the types that
//   cast shadows);
// - the image changes where the foliage draws (the level's foliage taken
//   out of the scene and put back);
// - no page or GPU error.
// The same on the WebGL2 test backend (the CPU twin; never a WebGPU acceptance).
// A shot goes to render-refs/candidates/ for the eye and the counts to
// render-refs/runs/; nothing is compared with a reference image.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { derekavakFoliage } from "./gpuFoliageScene.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { difference, git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface ViewCheck { gpu: number[]; cpu: { counts: number[]; certain: number[]; possible: number[] } }
interface Check extends ViewCheck { name: string; instances: number; shadows: ViewCheck[]; cameras: ViewCheck[] }
interface Ring { rings: number; cells: number; instances: number; pending: number }
interface Dev {
  pause(): void;
  resume(): void;
  step(ms: number): Promise<{ ran: boolean }>;
  gpuDriven: {
    check(): Promise<Check[]>;
    level(): Promise<Ring | null>;
    levelVisible(visible: boolean): Promise<void>;
  };
}

const dev = (page: Page) => ({
  pause: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.pause()),
  resume: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.resume()),
  step: () => page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return (window as unknown as { __forgeDev: Dev }).__forgeDev.step(1000 / 60);
  }),
  check: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.check()),
  level: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.level()),
  levelVisible: (visible: boolean) =>
    page.evaluate((value) => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.levelVisible(value), visible),
});

async function steps(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) await dev(page).step();
}

test.use({ viewport: SMOKE_VIEWPORT });

for (const backend of ["webgpu", "webgl"] as const) test(`foliage ring (${backend}): Derekavak's rules grow around the camera`, async ({ page }, testInfo) => {
  const webgl = backend === "webgl";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text());
    // The cells are generated in the worker (F2): its same-thread fallback is a failure here.
    if (message.text().includes("Foliage worker failed")) errors.push(message.text());
  });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  const p2 = scene.poses.find((pose) => pose.id === "p2")!;
  const expected = derekavakFoliage([p2.position![0], p2.position![2]]);

  await openSmokeLevel(page, scene.level, p2, webgl ? "&debug&forceWebGL" : "&debug");
  await expect(page.locator(`canvas[data-forge-backend='${webgl ? "webgl2" : "webgpu"}']`)).toBeVisible();
  await expect.poll(() => dev(page).level(), { timeout: 30_000, message: "the ring settles" })
    .toMatchObject({ rings: 1, pending: 0 });
  // The ring counts empty cells as built; Node counts the non-empty ones: the instances compare.
  const ring = (await dev(page).level())!;
  console.log(`ring ${JSON.stringify(ring)}, Node ${expected.cells} non-empty cells / ${expected.instances} instances`);
  expect(ring.instances, "the ring grows what Node generates for the same camera").toBe(expected.instances);

  await dev(page).pause();
  await steps(page, 6);
  const checks = await dev(page).check();
  expect(checks.length, "one batch per Foliage Type in use").toBe(expected.types.length);
  const within = (label: string, view: ViewCheck): void => view.gpu.forEach((gpu, lod) => {
    expect(gpu, `${label} LOD ${lod}: GPU ${gpu}, CPU ${view.cpu.counts[lod]} (certain ${view.cpu.certain[lod]}, possible ${view.cpu.possible[lod]})`)
      .toBeGreaterThanOrEqual(view.cpu.certain[lod]!);
    expect(gpu).toBeLessThanOrEqual(view.cpu.possible[lod]!);
  });
  for (const check of checks) {
    within(check.name, check);
    check.shadows.forEach((shadow, index) => within(`${check.name} shadow ${index + 1}`, shadow));
  }
  const visible = checks.reduce((sum, check) => sum + check.gpu.reduce((a, b) => a + b, 0), 0);
  expect(visible).toBeGreaterThan(0);
  expect(visible).toBeLessThan(expected.instances);

  const drawn = await page.getByTestId("forge-canvas").screenshot();
  await dev(page).levelVisible(false);
  await steps(page, 6);
  const plain = await page.getByTestId("forge-canvas").screenshot();
  await dev(page).levelVisible(true);
  await steps(page, 2);
  const changed = await difference(page, plain, drawn);
  expect(changed, "the foliage changes the image").toBeGreaterThan(0.5);
  await dev(page).resume();
  expect(errors).toEqual([]);

  const record = {
    schema: 1,
    kind: "phase 5c F1 level foliage ring smoke",
    backend,
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    level: scene.level,
    ring,
    expected: { cells: expected.cells, instances: expected.instances },
    imageDifference: changed,
    visible,
    checks,
  };
  const stamp = record.date.replace(/[:.]/g, "-");
  const suffix = webgl ? "-webgl" : "";
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  mkdirSync(join(RENDER_REFS, "candidates"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${stamp}-foliage-ring${suffix}.json`), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(RENDER_REFS, "candidates", `derekavak-p2-foliage-ring${suffix}.png`), drawn);
  await testInfo.attach(`derekavak-p2-foliage-ring${suffix}`, { body: drawn, contentType: "image/png" });
  console.log(`foliage ring (${backend}): ${ring.cells} cells, ${ring.instances} instances, ${visible} visible, image ${changed.toFixed(2)}`);
});
