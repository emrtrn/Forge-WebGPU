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
// A shot goes to render-refs/candidates/ for the eye and the counts to
// render-refs/runs/; nothing is compared with a reference image.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { derekavakFoliage, type FoliageSceneType } from "./gpuFoliageScene.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { difference, git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface Check { name: string; instances: number; gpu: number[]; cpu: { counts: number[]; certain: number[]; possible: number[] } }
interface Dev {
  pause(): void;
  resume(): void;
  step(ms: number): Promise<{ ran: boolean }>;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  gpuDriven: {
    install(types: FoliageSceneType[], cullScale: number): Promise<{ batches: number; instances: number; parts: number; draws: number }>;
    check(): Promise<Check[]>;
    stats(): { batches: number; instances: number; draws: number } | null;
    remove(): Promise<void>;
  };
}

const dev = (page: Page) => ({
  pause: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.pause()),
  resume: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.resume()),
  step: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.step(1000 / 60)),
  move: (position: readonly [number, number, number], look: readonly [number, number, number]) =>
    page.evaluate(([p, t]) => (window as unknown as { __forgeDev: Dev }).__forgeDev.moveCamera(p[0], p[1], p[2], t), [position, look] as const),
  install: (types: FoliageSceneType[], scale: number) =>
    page.evaluate(([list, value]) => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.install(list, value), [types, scale] as const),
  check: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.check()),
  stats: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.stats()),
  remove: () => page.evaluate(() => (window as unknown as { __forgeDev: Dev }).__forgeDev.gpuDriven.remove()),
});

async function steps(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) await dev(page).step();
}

/** Draw calls in the `?debug` readout. */
async function readoutDraws(page: Page): Promise<number> {
  const text = (await page.locator("#debug-stats-readout").textContent()) ?? "";
  const match = /([\d,.\s]+) draw calls/.exec(text);
  return match ? Number(match[1]!.replace(/[^\d]/g, "")) : NaN;
}

test.use({ viewport: SMOKE_VIEWPORT });

test("gpu culling: Derekavak's foliage culls on the GPU as the CPU reference does", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  const p2 = scene.poses.find((pose) => pose.id === "p2")!;
  const p1 = scene.poses.find((pose) => pose.id === "p1")!;
  const foliage = derekavakFoliage([p2.position![0], p2.position![2]]);
  expect({ cells: foliage.cells, instances: foliage.instances }).toEqual({ cells: 370, instances: 1640 });

  await openSmokeLevel(page, scene.level, p2, "&debug");
  await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
  // The readout reads three's count between frames: the frame loop runs for it.
  await expect.poll(() => readoutDraws(page), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  const drawsBefore = await readoutDraws(page);
  await dev(page).pause();
  await steps(page, 4);
  const plain = await page.getByTestId("forge-canvas").screenshot();

  const installed = await dev(page).install(foliage.types, foliage.cullScale);
  expect(installed).toMatchObject({ batches: foliage.types.length, instances: 1640 });
  await steps(page, 6);

  const views: Array<{ id: string; checks: Check[] }> = [];
  const checkView = async (id: string): Promise<Check[]> => {
    const checks = await dev(page).check();
    for (const check of checks) {
      check.gpu.forEach((gpu, lod) => {
        expect(gpu, `${id} ${check.name} LOD ${lod}: GPU ${gpu}, CPU ${check.cpu.counts[lod]} (certain ${check.cpu.certain[lod]}, possible ${check.cpu.possible[lod]})`)
          .toBeGreaterThanOrEqual(check.cpu.certain[lod]!);
        expect(gpu).toBeLessThanOrEqual(check.cpu.possible[lod]!);
      });
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
  await expect.poll(() => readoutDraws(page), { timeout: 20_000, message: "the readout adds the indirect draws three does not count" })
    .toBe(drawsBefore + installed.draws);
  const drawsAfter = await readoutDraws(page);
  const stats = await dev(page).stats();
  expect(stats?.draws).toBe(installed.draws);
  await dev(page).pause();

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
    kind: "phase 5c step 5.1 GPU-driven culling smoke",
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    level: scene.level,
    foliage: { cells: foliage.cells, instances: foliage.instances, types: foliage.types.map((type) => ({ name: type.name, instances: type.matrices.length / 16 })) },
    installed,
    readoutDraws: { before: drawsBefore, after: drawsAfter },
    imageDifference: changed,
    views: views.map(({ id, checks }) => ({ id, visible: total(checks), checks })),
  };
  const stamp = record.date.replace(/[:.]/g, "-");
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  mkdirSync(join(RENDER_REFS, "candidates"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${stamp}-gpu-culling.json`), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(RENDER_REFS, "candidates", "derekavak-p2-gpu-foliage.png"), drawn);
  await testInfo.attach("derekavak-p2-gpu-foliage", { body: drawn, contentType: "image/png" });
  console.log(`gpu culling: ${JSON.stringify(record.views.map((view) => [view.id, view.visible]))}, draws ${installed.draws}`);
});
