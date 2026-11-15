// G8 "terrain = collider" on the real GPU (plan phase 5a step 5, decision 4;
// Phase 1 G8, user decision 2026-11-11): at a terrain level's Phase 0 pose the
// drawn terrain is read back from the GPU around the camera (1 px per metre,
// the main camera's LOD and morph) and each pixel's height is compared with a
// ray onto the Rapier heightfield of its tile. Where the terrain is drawn at
// full resolution (a leaf node from its tile slot, before its morph) the gap is
// at most 5 cm; the morph band and coarser levels are Forge's own CDLOD
// deviation and only reported. The GPU must also draw the CPU twin's surface
// (engine/terrain/terrainVisualHeight.ts), which the Node test holds against
// Rapier everywhere. Page side: `window.__forgeDev.terrainColliderMatch`
// (development only, render/viewer/debug/terrainColliderMatch.ts).
//
// The record goes to render-refs/runs/<stamp>-g8.json, the summary to the console.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { RENDER_REFS, SMOKE_SCENES } from "./renderScenes.ts";
import { git, openSmokeLevel } from "./smokePage.ts";

interface Band { samples: number; maxM: number; meanM: number; p99M: number; over5cm: number }
interface Match {
  terrain: string; backend: string; covered: number; noCollider: number; colliders: number; nodes: number;
  bands: { full: Band; morph: Band; coarser: Band }; twinMaxM: number; twinMisses: number;
}

/** The streamed terrains (1 m and 2 m spacing) at their first Phase 0 pose. */
const SCENES = ["derekavak", "open-world", "island"] as const;
/** G8's limit at full resolution. */
const LIMIT_M = 0.05;
/** The GPU against the CPU twin: float32 vertex maths and the readback's ~1 mm at the probe offset. */
const TWIN_LIMIT_M = 0.01;

const records: Record<string, unknown>[] = [];

for (const id of SCENES) {
  test(`G8 ${id}: the drawn terrain is the collider at full resolution and the CPU twin everywhere`, async ({ page }) => {
    const scene = SMOKE_SCENES.find((entry) => entry.id === id)!;
    const pose = scene.poses[0]!;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await openSmokeLevel(page, scene.level, pose);
    const match = await page.evaluate(() =>
      (window as unknown as { __forgeDev: { terrainColliderMatch(options: { size: number }): Promise<unknown> } }).__forgeDev.terrainColliderMatch({ size: 256 }),
    ) as Match | null;
    expect(match, "the level draws a terrain").not.toBeNull();
    records.push({ scene: id, pose: pose.id, ...match! });
    console.log(`G8 ${id} ${pose.id}: full ${JSON.stringify(match!.bands.full)} morph max ${match!.bands.morph.maxM} coarser max ${match!.bands.coarser.maxM} twin ${match!.twinMaxM}`);
    expect(match!.backend).toBe("webgpu");
    expect(match!.bands.full.samples, "full-resolution pixels around the camera").toBeGreaterThan(1000);
    expect(match!.bands.full.maxM, "G8 at full resolution").toBeLessThanOrEqual(LIMIT_M);
    expect(match!.twinMisses, "every drawn pixel is on the twin's surface").toBe(0);
    expect(match!.twinMaxM, "the GPU draws the CPU twin's surface").toBeLessThanOrEqual(TWIN_LIMIT_M);
    expect(pageErrors).toEqual([]);
  });
}

test.afterAll(() => {
  if (records.length === 0) return;
  const runs = join(RENDER_REFS, "runs");
  mkdirSync(runs, { recursive: true });
  const file = join(runs, `${new Date().toISOString().replace(/[:.]/g, "-")}-g8.json`);
  writeFileSync(file, `${JSON.stringify({ revision: git(["rev-parse", "--short", "HEAD"]), limitM: LIMIT_M, records }, null, 2)}\n`);
  console.log(`G8 record: ${file}`);
});
