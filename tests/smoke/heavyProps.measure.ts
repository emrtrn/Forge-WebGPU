// Heavy props (plan 5c R9a O5, R9b S1): `npm run measure:heavy-props`. Headed
// Chrome on the real GPU, the smoke server and profile, 1080p `high`, DPR 1.
//
// L03 with the synthetic interior's walls (`tools/scenes/indoorScene.ts`) and
// its 768 props replaced by high-poly spheres drawn by the engine's static
// batch (`__forgeDev.heavyProps`, `render/gpu/heavyPropsDev.ts`): the static
// paths compared on expensive geometry. `FORGE_HEAVY_SEGMENTS` sets the
// sphere (default 192: about 37 k triangles), `FORGE_HEAVY_MODES` a subset of
// `instanced,gpu,auto`. Record: render-refs/runs/<stamp>-heavy-props.json.
// The second test (plan 5c R9b Z6) runs the interior without and with zones
// (`-g zones`; record <stamp>-zones.json). Not a pass / fail gate.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { planZoneLevel, zoneOccluders, type ZoneLevelActor } from "../../src/engine/world/zoneLevel.ts";
import { indoorScene } from "../../tools/scenes/indoorScene.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface Dev {
  pause(): void;
  step(ms: number): Promise<unknown>;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  spawn(raw: unknown[]): string[];
  heavyProps: { install(matrices: number[], segments: number, path: string): Promise<unknown> };
  zones(): unknown;
  host(): { renderer: { info: { autoReset: boolean; reset(): void; render: { drawCalls: number } } }; gpuDriven: { lastDraws: number } } | null;
}
const forge = <T>(page: Page, run: string, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => (new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown)(
    (window as unknown as { __forgeDev: Dev }).__forgeDev, value), [run, arg] as const) as Promise<T>;
const steps = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await forge(page, "(d) => d.step(1000 / 60)");
};

test.use({ viewport: SMOKE_VIEWPORT });

/** Column-major matrix of position p, quaternion q, scale s. */
function compose(p: readonly number[], q: readonly number[], s: readonly number[]): number[] {
  const [x, y, z, w] = q as [number, number, number, number];
  const [sx, sy, sz] = s as [number, number, number];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    p[0]!, p[1]!, p[2]!, 1,
  ];
}

// Each mode in a fresh page, 120 stepped frames per pose.
test("heavy props: instanced vs GPU-driven vs auto", async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "l03")!;
  const segments = Number(process.env.FORGE_HEAVY_SEGMENTS ?? 192);
  const shell = indoorScene({ origin: [300, 0, 300], propsPerRoom: 0 });
  const furnished = indoorScene({ origin: [300, 0, 300] });
  const props = (furnished.actors as unknown as Array<{ name: string; transform: { p: number[]; r: number[]; s: number[] } }>).filter((actor) => actor.name.startsWith("Prop"));
  const matrices = props.flatMap((actor) => compose(actor.transform.p, actor.transform.r, actor.transform.s));
  const mean = (values: number[]): number => Math.round(1000 * values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)) / 1000;
  const only = process.env.FORGE_HEAVY_MODES?.split(",");
  const modes = (["instanced", "gpu", "auto"] as const).filter((mode) => !only || only.includes(mode));
  const results = [];
  for (const mode of modes) {
    await openSmokeLevel(page, scene.level, scene.poses[0]!, "");
    await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
    await page.waitForTimeout(800);
    await forge(page, "(d) => d.pause()");
    await forge(page, "(d, a) => d.spawn(a)", shell.actors);
    await forge(page, "(d, a) => { window.__heavy = null; d.heavyProps.install(a[0], a[1], a[2]).then((r) => { window.__heavy = r; }, (e) => { window.__heavy = { error: String(e) }; }); }", [matrices, segments, mode]);
    let installed: { triangles?: number; instances?: number; error?: string } | null = null;
    for (let i = 0; i < 2400 && !installed; i += 1) {
      await steps(page, 5);
      installed = await page.evaluate(() => (window as unknown as { __heavy: { triangles?: number; error?: string } | null }).__heavy);
    }
    expect(installed?.error, `${mode}: heavy props install`).toBeUndefined();
    expect(installed?.instances).toBe(props.length);
    for (const pose of furnished.poses) {
      await forge(page, "(d, a) => d.moveCamera(a[0][0], a[0][1], a[0][2], a[1])", [pose.position, pose.target]);
      await steps(page, 20);
      const frames: Array<{ cpuMs: number; gpuMs: number | null; submitMs: number | null }> = [];
      for (let i = 0; i < 120; i += 1) frames.push(await forge(page, "(d) => d.step(1000 / 60)"));
      const row = {
        mode, pose: pose.id, trianglesPerProp: installed?.triangles, props: props.length,
        submitMs: mean(frames.map((frame) => frame.submitMs ?? NaN).filter(Number.isFinite)),
        cpuMs: mean(frames.map((frame) => frame.cpuMs)), gpuMs: mean(frames.map((frame) => frame.gpuMs ?? NaN).filter(Number.isFinite)),
      };
      results.push(row);
      console.log(`heavy ${row.mode} ${row.pose}: submit ${row.submitMs} ms, cpu ${row.cpuMs} ms, gpu ${row.gpuMs} ms (${props.length} props × ${installed?.triangles} tris)`);
    }
  }
  expect(errors).toEqual([]);
  const record = {
    schema: 1, kind: "phase 5c R9a O5 / R9b S1: heavy props, instanced vs GPU-driven vs auto", date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "", viewport: SMOKE_VIEWPORT, segments, results,
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${record.date.replace(/[:.]/g, "-")}-heavy-props.json`), `${JSON.stringify(record, null, 2)}\n`);
});

// Plan 5c R9b Z6: the same heavy interior (`auto` path) without and with zones. The zones are the ones `forge zones`
// writes for its walls (`engine/world/zoneLevel.ts`, computed here), spawned with the walls; the heavy props split per
// zone. Per pose: submission, frame CPU and GPU over 120 stepped frames, one frame's draws (three's count plus the
// indirect draws) and the zones' readout. Record: render-refs/runs/<stamp>-zones.json.
test("zones: the heavy interior without and with zones", async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "l03")!;
  const segments = Number(process.env.FORGE_HEAVY_SEGMENTS ?? 192);
  const origin = [300, 0, 300] as const;
  const shell = indoorScene({ origin: [...origin], propsPerRoom: 0 });
  const furnished = indoorScene({ origin: [...origin] });
  const props = (furnished.actors as unknown as Array<{ name: string; transform: { p: number[]; r: number[]; s: number[] } }>).filter((actor) => actor.name.startsWith("Prop"));
  const matrices = props.flatMap((actor) => compose(actor.transform.p, actor.transform.r, actor.transform.s));
  const zoneActors: ZoneLevelActor[] = shell.actors.map((actor) => ({
    id: actor.id as ZoneLevelActor["id"], name: actor.name, components: actor.components as unknown as ZoneLevelActor["components"],
    world: compose(actor.transform.p, actor.transform.r, actor.transform.s),
  }));
  const plan = planZoneLevel(zoneActors, zoneOccluders(zoneActors, () => null), { levelId: "lvl_00000000000000000000000000000a06" });
  expect([plan.zones, plan.portals]).toEqual([64, 176]);
  const mean = (values: number[]): number => Math.round(1000 * values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)) / 1000;
  const results = [];
  for (const zoned of [false, true]) {
    await openSmokeLevel(page, scene.level, scene.poses[0]!, "");
    await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
    await page.waitForTimeout(800);
    await forge(page, "(d) => d.pause()");
    await forge(page, "(d, a) => d.spawn(a)", zoned ? [...shell.actors, ...plan.add] : shell.actors);
    await steps(page, 10);
    await forge(page, "(d, a) => { window.__heavy = null; d.heavyProps.install(a[0], a[1], 'auto').then((r) => { window.__heavy = r; }, (e) => { window.__heavy = { error: String(e) }; }); }", [matrices, segments]);
    let installed: { triangles?: number; instances?: number; batches?: number; error?: string } | null = null;
    for (let i = 0; i < 2400 && !installed; i += 1) {
      await steps(page, 5);
      installed = await page.evaluate(() => (window as unknown as { __heavy: { triangles?: number; error?: string } | null }).__heavy);
    }
    expect(installed?.error, `${zoned}: heavy props install`).toBeUndefined();
    expect(installed?.instances).toBe(props.length);
    for (const pose of furnished.poses) {
      await forge(page, "(d, a) => d.moveCamera(a[0][0], a[0][1], a[0][2], a[1])", [pose.position, pose.target]);
      await steps(page, 20);
      const frames: Array<{ cpuMs: number; gpuMs: number | null; submitMs: number | null }> = [];
      for (let i = 0; i < 120; i += 1) frames.push(await forge(page, "(d) => d.step(1000 / 60)"));
      // One more frame's draws as `?debug` counts them (three's RAF would reset the counter).
      const frame = await forge<{ draws: number; zones: unknown } | null>(page, `async (d) => {
        const host = d.host(); if (!host) return null;
        const info = host.renderer.info; info.autoReset = false; info.reset();
        try { await d.step(1000 / 60); return { draws: info.render.drawCalls + host.gpuDriven.lastDraws, zones: d.zones() }; }
        finally { info.autoReset = true; }
      }`);
      const row = {
        zones: zoned, pose: pose.id, batches: installed?.batches, trianglesPerProp: installed?.triangles, props: props.length,
        submitMs: mean(frames.map((one) => one.submitMs ?? NaN).filter(Number.isFinite)),
        cpuMs: mean(frames.map((one) => one.cpuMs)), gpuMs: mean(frames.map((one) => one.gpuMs ?? NaN).filter(Number.isFinite)),
        draws: frame?.draws ?? null, zoneStats: frame?.zones ?? null,
      };
      results.push(row);
      console.log(`zones ${zoned ? "on " : "off"} ${row.pose}: submit ${row.submitMs} ms, cpu ${row.cpuMs} ms, gpu ${row.gpuMs} ms, draws ${row.draws}, ${JSON.stringify(row.zoneStats)}`);
    }
  }
  expect(errors).toEqual([]);
  const record = {
    schema: 1, kind: "phase 5c R9b Z6: heavy interior without and with zones (auto path)", date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "", viewport: SMOKE_VIEWPORT, segments,
    zones: plan.zones, portals: plan.portals, results,
  };
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${record.date.replace(/[:.]/g, "-")}-zones.json`), `${JSON.stringify(record, null, 2)}\n`);
});
