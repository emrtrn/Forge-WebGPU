// Stone material A / C (vegetation plan PG1, §6.6): `npm run measure:rock-material`.
// Headed Chrome on the real GPU, the smoke server and profile, 1080p `high`,
// DPR 1, stepped frames (60 Hz).
//
// L03 with a 14 × 14 grid of the starter pack's generated rocks (static
// meshes, `content/packs/starter/procgen/rocks`). Modes: `plain` (the rocks
// with the untextured M_White: the floor of the comparison), `C` (M_Rock:
// baked triplanar tiles + the shader's `variation`), `C-novar` (the same with
// `variation` off: M_Rock rewritten for that page and restored), `A` (M_Rock's
// nodes replaced by the noise stack per pixel, `__forgeDev.proceduralStone`).
// Two poses: rocks filling the screen, and the field. The `C` close frame is
// written as the check shot to render-refs/candidates/pg1-rocks.png. Record:
// render-refs/runs/<stamp>-rock-material.json. Not a pass / fail gate.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { REPO_ROOT, RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface Dev {
  pause(): void;
  step(ms: number): Promise<{ cpuMs: number; gpuMs: number | null; submitMs: number | null }>;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  spawn(raw: unknown[]): string[];
  proceduralStone(guid: string, metersPerRepeat?: number): Promise<number>;
  host(): { world: { scene: { traverse(visit: (object: { material?: { name: string } | { name: string }[] }) => void): void } } | null } | null;
}
const forge = <T>(page: Page, run: string, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => (new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown)(
    (window as unknown as { __forgeDev: Dev }).__forgeDev, value), [run, arg] as const) as Promise<T>;
const steps = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await forge(page, "(d) => d.step(1000 / 60)");
};

test.use({ viewport: SMOKE_VIEWPORT });

const ROCKS = join(REPO_ROOT, "content/packs/starter/procgen/rocks");
const ROCK_MATERIAL_FILE = join(ROCKS, "M_Rock.material.json");
const ROCK_MATERIAL = "ast_c21ec62d73eb2b115ae713fe7bee348c";
const WHITE = "ast_976841cfba9cb420a8d9799bb0a5f9cc";
const POSES = [
  { id: "close", position: [300, 1.6, 300], target: [300, 0.6, 306] },
  { id: "field", position: [300, 7, 291], target: [300, 0, 318] },
] as const;

function rockModels(): string[] {
  const ids: string[] = [];
  for (const folder of ["RockAngular", "RockRounded"]) {
    for (const name of readdirSync(join(ROCKS, folder)).filter((file) => file.endsWith("_lod0.glb.meta.json")).sort()) {
      ids.push((JSON.parse(readFileSync(join(ROCKS, folder, name), "utf8")) as { id: string }).id);
    }
  }
  return ids;
}

function rockActors(models: readonly string[], material: string | null): unknown[] {
  const actors: unknown[] = [];
  let n = 0;
  for (let row = 0; row < 14; row += 1) {
    for (let column = 0; column < 14; column += 1, n += 1) {
      const yaw = (n * 2.399963) % (Math.PI * 2), scale = 1 + ((n * 0.618034) % 1) * 0.6;
      actors.push({
        id: `act_${(0xb0000 + n).toString(16).padStart(32, "0")}`,
        name: `Rock ${n}`, class: null, parent: null, spatiallyLoaded: true,
        transform: { p: [285.7 + column * 2.2, 0, 302 + row * 2.2], r: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], s: [scale, scale, scale] },
        components: { mesh: { type: "forge.staticMesh@2", mesh: models[n % models.length], materials: material ? [material] : [] } },
      });
    }
  }
  return actors;
}

test("stone material: path A vs path C", async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "l03")!;
  const models = rockModels();
  expect(models).toHaveLength(6);
  const mean = (values: number[]): number => Math.round(1000 * values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)) / 1000;
  const original = readFileSync(ROCK_MATERIAL_FILE, "utf8");
  const results = [];
  try {
    for (const mode of ["plain", "C", "C-novar", "A"] as const) {
      writeFileSync(ROCK_MATERIAL_FILE, mode === "C-novar" ? original.replace(/("variation": \{\s*"enabled": )true/, "$1false") : original);
      await openSmokeLevel(page, scene.level, scene.poses[0]!, "");
      await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
      await page.waitForTimeout(800);
      await forge(page, "(d) => d.pause()");
      await forge(page, "(d, a) => d.spawn(a)", rockActors(models, mode === "plain" ? WHITE : null));
      // Stepping until the rocks draw with their material: its textures (KTX2, transcoded in a worker) come in
      // after the models; a fixed frame count measured empty rocks.
      const material = mode === "plain" ? WHITE : ROCK_MATERIAL;
      const drawn = () => forge<number>(page, `(d, guid) => { let n = 0; d.host()?.world?.scene.traverse((o) => {
        const m = o.material; for (const one of Array.isArray(m) ? m : m ? [m] : []) if (one.name === guid) n += 1; }); return n; }`, material);
      let last = -1, same = 0;
      for (let frame = 0; frame < 3000 && same < 30; frame += 1) {
        await forge(page, "(d) => d.step(1000 / 60)");
        const n = await drawn();
        same = n > 0 && n === last ? same + 1 : 0;
        last = n;
      }
      expect(last, `${mode}: the rocks draw with their material`).toBeGreaterThan(0);
      await steps(page, 60);
      if (mode === "A") expect(await forge<number>(page, "(d, a) => d.proceduralStone(a)", ROCK_MATERIAL)).toBeGreaterThan(0);
      for (const pose of POSES) {
        await forge(page, "(d, a) => d.moveCamera(a[0][0], a[0][1], a[0][2], a[1])", [pose.position, pose.target]);
        await steps(page, 60);
        const frames = [];
        for (let i = 0; i < 120; i += 1) frames.push(await forge<{ cpuMs: number; gpuMs: number | null; submitMs: number | null }>(page, "(d) => d.step(1000 / 60)"));
        const row = {
          mode, pose: pose.id, rocks: 196,
          gpuMs: mean(frames.map((frame) => frame.gpuMs ?? NaN).filter(Number.isFinite)),
          submitMs: mean(frames.map((frame) => frame.submitMs ?? NaN).filter(Number.isFinite)),
          cpuMs: mean(frames.map((frame) => frame.cpuMs)),
        };
        results.push(row);
        console.log(`rock material ${row.mode} ${row.pose}: gpu ${row.gpuMs} ms, submit ${row.submitMs} ms, cpu ${row.cpuMs} ms`);
        if (mode === "C" && pose.id === "close") {
          mkdirSync(join(RENDER_REFS, "candidates"), { recursive: true });
          writeFileSync(join(RENDER_REFS, "candidates", "pg1-rocks.png"), await page.locator("canvas").screenshot());
        }
      }
    }
  } finally {
    writeFileSync(ROCK_MATERIAL_FILE, original);
  }
  expect(errors).toEqual([]);
  const record = {
    schema: 1, kind: "vegetation plan PG1: stone material, path A vs path C", date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "", viewport: SMOKE_VIEWPORT, results,
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${record.date.replace(/[:.]/g, "-")}-rock-material.json`), `${JSON.stringify(record, null, 2)}\n`);
});
