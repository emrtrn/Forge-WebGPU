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
import { derekavakFoliage, type FoliageSceneType } from "./gpuFoliageScene.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface StudyBatch { name: string; instances: number; visible: number; occluded: number; visibleTriangles: number; occludedTriangles: number }
interface Study { width: number; height: number; cpuMs: number; skyShare: number; batches: StudyBatch[] }
interface Dev {
  pause(): void;
  step(ms: number): Promise<unknown>;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  terrainHeights(points: [number, number][]): Promise<(number | null)[]>;
  gpuDriven: { install(types: FoliageSceneType[], cullScale: number, castShadow?: boolean, bundle?: boolean): Promise<unknown> };
  occlusionStudy(): Promise<Study | null>;
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
