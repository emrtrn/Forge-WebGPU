// Occlusion study (plan 5c R9a): `npm run measure:occlusion`. Headed Chrome on
// the real GPU, the smoke server and profile, 1080p `high`, DPR 1.
//
// Derekavak with the render smoke's GPU-driven foliage (`gpuFoliageScene.ts`,
// 1,640 instances around P2). For each pose the page's study
// (`__forgeDev.occlusionStudy`, `render/gpu/occlusionStudy.ts`) draws the
// layer-0 scene's depth, builds a CPU Hi-Z and counts the instances the main
// view keeps that are certainly behind it: the upper bound of what an
// occlusion pass could hide. Two static paths: `instanced` (statics are
// occluders) and `gpu` (statics are GPU-driven occludees, terrain the only
// occluder). Poses: the Phase 0 P1 / P2 / P3 (elevated) and four eye-height
// views from P2's ground (1.7 m over the terrain, looking N / E / S / W).
// Record: render-refs/runs/<stamp>-occlusion.json. Not a pass / fail gate.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { indoorScene } from "../../tools/scenes/indoorScene.ts";
import { derekavakFoliage, type FoliageSceneType } from "./gpuFoliageScene.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface StudyBatch { name: string; instances: number; visible: number; occluded: number; visibleTriangles: number; occludedTriangles: number }
interface StudyDraws { objects: number; objectsOccluded: number; batches: number; batchesOccluded: number; cellSize: number; cells: number; cellsOccluded: number; triangles: number; trianglesOccluded: number }
interface Study { width: number; height: number; cpuMs: number; skyShare: number; batches: StudyBatch[]; statics: StudyDraws }
interface Dev {
  pause(): void;
  step(ms: number): Promise<unknown>;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  terrainHeights(points: [number, number][]): Promise<(number | null)[]>;
  gpuDriven: { install(types: FoliageSceneType[], cullScale: number, castShadow?: boolean, bundle?: boolean): Promise<unknown> };
  occlusionStudy(): Promise<Study | null>;
  spawn(raw: unknown[]): string[];
}
const forge = <T>(page: Page, run: string, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => (new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown)(
    (window as unknown as { __forgeDev: Dev }).__forgeDev, value), [run, arg] as const) as Promise<T>;
const steps = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await forge(page, "(d) => d.step(1000 / 60)");
};

test.use({ viewport: SMOKE_VIEWPORT });

test("occlusion study: what a Hi-Z pass could hide", async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  const p2 = scene.poses.find((pose) => pose.id === "p2")!;
  const foliage = derekavakFoliage([p2.position![0], p2.position![2]]);
  const results = [];
  for (const path of ["instanced", "gpu"] as const) {
    await openSmokeLevel(page, scene.level, p2, `&staticPath=${path}`);
    await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
    await page.waitForTimeout(1500);
    await forge(page, "(d) => d.pause()");
    await forge(page, "(d, a) => d.gpuDriven.install(a[0], a[1])", [foliage.types, foliage.cullScale]);
    const [x, , z] = p2.position!;
    const [ground] = await forge<(number | null)[]>(page, "(d, a) => d.terrainHeights(a)", [[x, z]]);
    const eye = (ground ?? 0) + 1.7;
    const poses: Array<{ id: string; position: readonly [number, number, number]; target: readonly [number, number, number] }> = [
      ...scene.poses.filter((pose) => pose.position && pose.target).map((pose) => ({ id: pose.id, position: pose.position!, target: pose.target! })),
      ...([["ground-n", 0, -1], ["ground-e", 1, 0], ["ground-s", 0, 1], ["ground-w", -1, 0]] as const).map(([id, dx, dz]) => ({
        id, position: [x, eye, z] as const, target: [x + dx * 50, eye, z + dz * 50] as const,
      })),
    ];
    for (const pose of poses) {
      await forge(page, "(d, a) => d.moveCamera(a[0][0], a[0][1], a[0][2], a[1])", [pose.position, pose.target]);
      await steps(page, 20);
      const study = await forge<Study | null>(page, "(d) => d.occlusionStudy()");
      expect(study).not.toBeNull();
      const sum = (key: keyof StudyBatch): number => study!.batches.reduce((total, batch) => total + (batch[key] as number), 0);
      const row = {
        path, pose: pose.id, position: pose.position, target: pose.target, skyShare: Math.round(study!.skyShare * 1000) / 1000, cpuMs: Math.round(study!.cpuMs * 10) / 10,
        visible: sum("visible"), occluded: sum("occluded"), visibleTriangles: sum("visibleTriangles"), occludedTriangles: sum("occludedTriangles"),
        batches: study!.batches,
      };
      results.push(row);
      const share = row.visible ? (100 * row.occluded / row.visible).toFixed(1) : "-";
      const triShare = row.visibleTriangles ? (100 * row.occludedTriangles / row.visibleTriangles).toFixed(1) : "-";
      console.log(`${path} ${pose.id}: visible ${row.visible}, occluded ${row.occluded} (${share} %), triangles ${row.visibleTriangles} / occluded ${row.occludedTriangles} (${triShare} %), sky ${(row.skyShare * 100).toFixed(1)} %, cpu ${row.cpuMs} ms`);
    }
  }
  expect(errors).toEqual([]);
  const record = {
    schema: 1, kind: "phase 5c R9a occlusion study (upper bound, current-frame layer-0 occluders, CPU Hi-Z)",
    date: new Date().toISOString(), commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "",
    level: scene.level, viewport: SMOKE_VIEWPORT, foliage: { cells: foliage.cells, instances: foliage.instances, types: foliage.types.length },
    results,
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${record.date.replace(/[:.]/g, "-")}-occlusion.json`), `${JSON.stringify(record, null, 2)}\n`);
});

const percent = (part: number, whole: number): string => (whole ? (100 * part / whole).toFixed(1) : "-");

// An FPS-like interior (plan 5c R9a, user 2026-11-17): `tools/scenes/indoorScene.ts`, 8 × 8 rooms of 8 m with door
// gaps and 12 props each, spawned at runtime into L03 300 m from its content; statics instanced (as shipped). The
// study counts the instanced statics: object draws, today's batches and batches split by 16 m cells.
test("occlusion study: an indoor level", async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "l03")!;
  const indoor = indoorScene({ origin: [300, 0, 300] });
  await openSmokeLevel(page, scene.level, scene.poses[0]!, "&staticPath=instanced");
  await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
  await page.waitForTimeout(1000);
  await forge(page, "(d) => d.pause()");
  const spawned = await forge<string[]>(page, "(d, a) => d.spawn(a)", indoor.actors);
  expect(spawned).toHaveLength(indoor.actors.length);
  await steps(page, 30);
  const results = [];
  for (const pose of indoor.poses) {
    await forge(page, "(d, a) => d.moveCamera(a[0][0], a[0][1], a[0][2], a[1])", [pose.position, pose.target]);
    await steps(page, 20);
    const study = (await forge<Study | null>(page, "(d) => d.occlusionStudy()"))!;
    const s = study.statics;
    results.push({ pose: pose.id, position: pose.position, target: pose.target, skyShare: study.skyShare, cpuMs: study.cpuMs, statics: s });
    console.log(`indoor ${pose.id}: objects ${s.objects} / occluded ${s.objectsOccluded} (${percent(s.objectsOccluded, s.objects)} %), batches ${s.batches} / ${s.batchesOccluded}, `
      + `cells(${s.cellSize} m) ${s.cells} / ${s.cellsOccluded} (${percent(s.cellsOccluded, s.cells)} %), triangles ${s.triangles} / ${s.trianglesOccluded} (${percent(s.trianglesOccluded, s.triangles)} %), cpu ${study.cpuMs.toFixed(1)} ms`);
  }
  expect(errors).toEqual([]);
  const record = {
    schema: 1, kind: "phase 5c R9a occlusion study, indoor (upper bound, current-frame layer-0 occluders, CPU Hi-Z)",
    date: new Date().toISOString(), commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "",
    level: scene.level, viewport: SMOKE_VIEWPORT, indoor: { ...indoor.counts, bounds: indoor.bounds }, results,
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${record.date.replace(/[:.]/g, "-")}-occlusion-indoor.json`), `${JSON.stringify(record, null, 2)}
`);
});

// Step a (plan 5c R9a): static batches split by world cell (`?staticCell=`, development only). Per scene and cell
// size: frame timing (120 stepped frames) and the study's static draws in view (today's draws, and how many of them
// an occlusion query could hide).
test("cells: draws and timing of static batches split by world cell", async ({ page }) => {
  test.setTimeout(1_500_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const indoor = indoorScene({ origin: [300, 0, 300] });
  const room = indoor.poses.find((pose) => pose.id === "diagonal")!;
  const scenes = [
    { id: "derekavak", pose: "p2", indoor: false }, { id: "wb-pilot", pose: "p1", indoor: false },
    { id: "island", pose: "p1", indoor: false }, { id: "l03", pose: "p1", indoor: true },
  ];
  const mean = (values: number[]): number => Math.round(1000 * values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)) / 1000;
  const results = [];
  for (const entry of scenes) {
    const scene = SMOKE_SCENES.find((candidate) => candidate.id === entry.id)!;
    const pose = scene.poses.find((candidate) => candidate.id === entry.pose) ?? scene.poses[0]!;
    for (const cell of [0, 16, 32]) {
      await openSmokeLevel(page, scene.level, pose, `&staticPath=instanced&staticCell=${cell}`);
      await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
      await page.waitForTimeout(1000);
      await forge(page, "(d) => d.pause()");
      if (entry.indoor) {
        await forge(page, "(d, a) => d.spawn(a)", indoor.actors);
        await forge(page, "(d, a) => d.moveCamera(a[0][0], a[0][1], a[0][2], a[1])", [room.position, room.target]);
      }
      await steps(page, 60);
      const frames: Array<{ cpuMs: number; gpuMs: number | null; submitMs: number | null }> = [];
      for (let i = 0; i < 120; i += 1) frames.push(await forge(page, "(d) => d.step(1000 / 60)"));
      const study = (await forge<Study | null>(page, "(d) => d.occlusionStudy()"))!;
      const row = {
        scene: entry.indoor ? "indoor" : entry.id, pose: entry.indoor ? room.id : pose.id, cell,
        submitMs: mean(frames.map((frame) => frame.submitMs ?? NaN).filter(Number.isFinite)),
        cpuMs: mean(frames.map((frame) => frame.cpuMs)),
        gpuMs: mean(frames.map((frame) => frame.gpuMs ?? NaN).filter(Number.isFinite)),
        staticDraws: study.statics.batches, occludedDraws: study.statics.batchesOccluded,
        objects: study.statics.objects, objectsOccluded: study.statics.objectsOccluded,
      };
      results.push(row);
      console.log(`cells ${row.scene}/${row.pose} cell ${cell}: submit ${row.submitMs} ms, cpu ${row.cpuMs} ms, gpu ${row.gpuMs} ms, static draws ${row.staticDraws} (occludable ${row.occludedDraws}, ${percent(row.occludedDraws, row.staticDraws)} %)`);
    }
  }
  expect(errors).toEqual([]);
  const record = {
    schema: 1, kind: "phase 5c R9a step a: static batches split by world cell", date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "", viewport: SMOKE_VIEWPORT, results,
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${record.date.replace(/[:.]/g, "-")}-static-cells.json`), `${JSON.stringify(record, null, 2)}\n`);
});

interface OcclusionCheck {
  width: number; height: number; levels: number; pyramidMismatches: number;
  batches: Array<{ name: string; instances: number; gpu: number; frustumCertain: number; frustumPossible: number; occludedLow: number; occludedHigh: number }>;
}

// Plan 5c R9a O3 / O4: the level's occlusion culling on the indoor scene. Correctness first (the GPU Hi-Z equals the
// CPU pyramid of its level 0; every GPU-driven batch's visible count lies in the CPU reference's range: no false
// hide), then 120 stepped frames each: occlusion on, off (statics still GPU-driven), and today's instanced statics.
// `FORGE_INDOOR_PROPS=<n>` sets the props per room (default 12; a heavier interior shows what hiding costs and saves).
test("gpu occlusion: indoor correctness and A/B", async ({ page }) => {
  test.setTimeout(1_200_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "l03")!;
  const propsPerRoom = Number(process.env.FORGE_INDOOR_PROPS ?? 12);
  const indoor = indoorScene({ origin: [300, 0, 300], propsPerRoom });
  const mean = (values: number[]): number => Math.round(1000 * values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)) / 1000;
  const timing = async (): Promise<{ submitMs: number; cpuMs: number; gpuMs: number }> => {
    const frames: Array<{ cpuMs: number; gpuMs: number | null; submitMs: number | null }> = [];
    for (let i = 0; i < 120; i += 1) frames.push(await forge(page, "(d) => d.step(1000 / 60)"));
    return {
      submitMs: mean(frames.map((frame) => frame.submitMs ?? NaN).filter(Number.isFinite)),
      cpuMs: mean(frames.map((frame) => frame.cpuMs)), gpuMs: mean(frames.map((frame) => frame.gpuMs ?? NaN).filter(Number.isFinite)),
    };
  };
  const open = async (occlusion: boolean): Promise<void> => {
    await openSmokeLevel(page, scene.level, scene.poses[0]!, "");
    await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
    await page.waitForTimeout(800);
    await forge(page, "(d) => d.pause()");
    if (occlusion) await forge(page, "(d) => d.levelSettings({ occlusionCulling: true })");
    await forge(page, "(d, a) => d.spawn(a)", indoor.actors);
    if (occlusion) {
      // The GPU-driven batches prepare (automatic LOD data, compileAsync) before they draw.
      await expect.poll(async () => { await steps(page, 10); return (await forge<{ batches: number } | null>(page, "(d) => d.gpuDriven.stats()"))?.batches ?? 0; },
        { timeout: 120_000 }).toBeGreaterThanOrEqual(4);
    }
    await steps(page, 30);
  };

  await open(true);
  const checks = [];
  const runs = [];
  for (const pose of indoor.poses) {
    await forge(page, "(d, a) => d.moveCamera(a[0][0], a[0][1], a[0][2], a[1])", [pose.position, pose.target]);
    await steps(page, 10);
    const check = (await forge<OcclusionCheck | null>(page, "(d) => d.gpuDriven.occlusionCheck()"))!;
    expect(check, `${pose.id}: a Hi-Z was built`).not.toBeNull();
    expect(check.pyramidMismatches, `${pose.id}: GPU Hi-Z = CPU pyramid`).toBe(0);
    for (const batch of check.batches) {
      expect(batch.gpu, `${pose.id} ${batch.name}: GPU ${batch.gpu} >= ${batch.frustumCertain} - ${batch.occludedHigh} (no false hide)`).toBeGreaterThanOrEqual(batch.frustumCertain - batch.occludedHigh);
      expect(batch.gpu, `${pose.id} ${batch.name}: GPU ${batch.gpu} <= ${batch.frustumPossible} - ${batch.occludedLow}`).toBeLessThanOrEqual(batch.frustumPossible - batch.occludedLow);
    }
    const visible = check.batches.reduce((sum, batch) => sum + batch.gpu, 0);
    const inFrustum = check.batches.reduce((sum, batch) => sum + batch.frustumPossible, 0);
    checks.push({ pose: pose.id, visible, inFrustum, check });
    console.log(`occlusion ${pose.id}: GPU visible ${visible} of ${inFrustum} in the frustum (${percent(inFrustum - visible, inFrustum)} % hidden), Hi-Z ${check.width} x ${check.height}, ${check.levels} levels, mismatches ${check.pyramidMismatches}`);
  }
  const diagonal = indoor.poses.find((pose) => pose.id === "diagonal")!;
  await forge(page, "(d, a) => d.moveCamera(a[0][0], a[0][1], a[0][2], a[1])", [diagonal.position, diagonal.target]);
  await steps(page, 20);
  runs.push({ mode: "gpu + occlusion", ...(await timing()) });
  await forge(page, "(d) => d.levelSettings({ occlusionCulling: false })");
  await steps(page, 20);
  runs.push({ mode: "gpu, no occlusion", ...(await timing()) });
  await open(false);
  await forge(page, "(d, a) => d.moveCamera(a[0][0], a[0][1], a[0][2], a[1])", [diagonal.position, diagonal.target]);
  await steps(page, 20);
  runs.push({ mode: "instanced (today)", ...(await timing()) });
  for (const run of runs) console.log(`occlusion A/B diagonal ${run.mode}: submit ${run.submitMs} ms, cpu ${run.cpuMs} ms, gpu ${run.gpuMs} ms`);
  expect(errors).toEqual([]);
  const record = {
    schema: 1, kind: "phase 5c R9a O3 / O4: GPU occlusion, indoor correctness and A/B", date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "", viewport: SMOKE_VIEWPORT, propsPerRoom, checks, runs,
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${record.date.replace(/[:.]/g, "-")}-gpu-occlusion.json`), `${JSON.stringify(record, null, 2)}\n`);
});
