// The phase 5c gate on a generated forest (vegetation plan PG3 / PV-WES-03 / 05 / 08, plan 5c box):
// `npm run measure:forest`. Headed Chrome on the real GPU, the smoke server and profile, 1080p `high`, DPR 1,
// the frame loop paused and stepped at 60 Hz (as measure:foliage).
//
// The forest: Derekavak's own Landscape rules and placements, their tree and bush types drawn as the starter
// pack's generated families (`__forgeDev.foliageType` lays `family` / `prototype` over them for the page,
// development only; the reference content is not touched): conifer-a (the most placed) and the two bush types
// as the deciduous Broadleaf's three prototypes, conifer-b / c as Conifer prototypes 1-2 (evergreen); the
// grass stays the level's.
// Scenarios, at P2 unless named:
// - `own`: the level's own GLB foliage (the F7 reference, same run);
// - `forest-summer`: G6 (submission <= 3 ms, main thread <= 6 ms);
// - `transitions`: summer -> autumn -> winter -> spring -> summer, each a timed WES season change of 2
//   simulation seconds, every frame recorded: the longest frame, GPU time, pipelines / shader modules created
//   during the changes (PV-WES-08: none) and the GPU memory peak;
// - `forest-winter`, `forest-winter-snow` (snow cover 1): G6 again;
// - `forest-walk-15mps` in winter: cells built and dropped by the ring while moving, the longest frame;
// - `cycle`: five times away (6 km: every ring cell unloads) and back, in winter: GPU objects / bytes,
//   three's geometries / textures and the ring's cells / instances back where they were, the season shown
//   at once (no transition replayed: the WES state is not moving), the image the same (PV-WES-05);
// - LOD shots (PV-WES-03): every batch forced to LOD 0 / 1 / 2 / impostor (`__forgeDev.foliageLod`) in
//   summer / autumn / winter / winter with snow, the share of the image the forest covers against the
//   level without it; candidates for the eye in render-refs/candidates/pg3-wes03-*.png.
// GPU memory is counted at the WebGPU API (gpuMemory.ts): three counts a compressed texture as one byte.
// The record goes to render-refs/runs/<stamp>-forest.json; it fails only on a non-WebGPU run, a boot error,
// an unsettled ring or a page error, never on the numbers.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { derekavakFoliage } from "./gpuFoliageScene.ts";
import { gpuMemory, installGpuMemory, resetGpuPeak } from "./gpuMemory.ts";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

const FRAME_MS = 1000 / 60;
const WARM_FRAMES = 60;
const FRAMES = 300;
const WALK_SPEED = 15;
const SEASON_SECONDS = 2;
const AWAY = 6000;
const CYCLES = 5;

/** Derekavak's tree / bush Foliage Types (ridgebound/world-pilot/foliage) and the family each is drawn as. */
const CONIFER = "ast_07a452d81c19c7908b08569cde5297e9";
const BROADLEAF = "ast_e6beb70fb2c3ee3f49dc40b4d332462c";
const FOREST: readonly { type: string; family: string; prototype: number }[] = [
  { type: "ast_a75e79d09827ed1083cbee6e91599e19", family: BROADLEAF, prototype: 0 },
  { type: "ast_a360fd61f7d3dee09259472826aabedd", family: CONIFER, prototype: 0 },
  { type: "ast_0bded742743b730dc9da99971f2d0764", family: CONIFER, prototype: 1 },
  { type: "ast_fd9c3ba18eeb4eda2821b6c5d9c05064", family: BROADLEAF, prototype: 1 },
  { type: "ast_210cff335f9f9f31601eb1a0278e1e3d", family: BROADLEAF, prototype: 2 },
];

interface Step { ran: boolean; cpuMs: number; gpuMs: number | null; submitMs: number | null }
interface Ring { rings: number; cells: number; instances: number; pending: number }
interface Info { memory: { geometries: number; textures: number }; render: { drawCalls: number }; autoReset: boolean; reset(): void }
interface Dev {
  pause(): void;
  resume(): void;
  step(ms: number): Promise<Step>;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  host(): { renderer: { info: Info }; gpuDriven: { lastDraws: number } } | null;
  setSeason(season: string): void;
  transitionSeason(request: { season: string; seconds: number }): void;
  setSurface(surface: { snowCoverage?: number; wetness?: number }): void;
  environmentState(): { season?: string; seasonProgress?: number } | null;
  foliageType(guid: string, patch: Record<string, unknown> | null): Promise<void>;
  foliageLod(lod: number | null): Promise<void>;
  gpuDriven: {
    stats(): { batches: number; instances: number; draws: number; views: number } | null;
    level(): Promise<Ring | null>;
    levelVisible(visible: boolean): Promise<void>;
  };
}

const evaluate = <T>(page: Page, run: (dev: Dev, arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => {
    const fn = new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown;
    return fn((window as unknown as { __forgeDev: Dev }).__forgeDev, value);
  }, [run.toString(), arg] as const) as Promise<T>;
const step = (page: Page): Promise<Step> => evaluate(page, (d, ms) => d.step(ms as number), FRAME_MS);

const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? NaN;
};
const round = (value: number): number => Math.round(value * 1000) / 1000;
const summary = (values: readonly number[]) => (values.length ? { mean: round(mean(values)), p95: round(percentile(values, 0.95)), max: round(Math.max(...values)) } : null);
const mib = (bytes: number): number => Math.round(bytes / 1048576 * 10) / 10;

/** Share of pixels whose luminance differs by more than 10 / 255. */
async function changedShare(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async (images) => {
    const data = await Promise.all(images.map(async (base64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height).data;
    }));
    const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    let n = 0;
    for (let i = 0; i < data[0]!.length; i += 4) if (Math.abs(lum(data[0]!, i) - lum(data[1]!, i)) > 10) n += 1;
    return n / (data[0]!.length / 4);
  }, [a, b].map((image) => image.toString("base64")));
}

test.use({ viewport: SMOKE_VIEWPORT });

test("forest: G6, season changes, cell cycles and LOD shots on a generated forest", async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text());
    if (/Foliage worker failed|not drawn|could not read a texture/.test(message.text())) errors.push(message.text());
  });
  await installGpuMemory(page);
  const cdp = await page.context().newCDPSession(page);
  const heap = async (): Promise<number> => ((await cdp.send("Runtime.getHeapUsage")) as { usedSize: number }).usedSize;
  const results: Record<string, unknown>[] = [];

  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  const p2 = scene.poses.find((entry) => entry.id === "p2")!;
  await openSmokeLevel(page, scene.level, p2);
  await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
  const canvas = page.getByTestId("forge-canvas");
  const [x, y, z] = p2.position!;
  const [tx, ty, tz] = p2.target ?? [x, y, z + 1];

  /**
   * Running: until the ring has nothing pending and its cells / instances and the GPU-driven batches stay the
   * same over three polls a second apart (a family's models and impostors load after the ring plans), then
   * paused.
   */
  const settle = async (label: string) => {
    await evaluate(page, (d) => d.resume());
    let last = "", same = 0;
    const deadline = Date.now() + 180_000;
    while (same < 3) {
      if (Date.now() > deadline) throw new Error(`${label}: the ring does not settle (${last})`);
      await page.waitForTimeout(1000);
      const ring = await evaluate(page, (d) => d.gpuDriven.level());
      const stats = await evaluate(page, (d) => d.gpuDriven.stats());
      const key = JSON.stringify([ring?.cells, ring?.instances, stats?.batches, stats?.instances]);
      same = ring && ring.pending === 0 && key === last ? same + 1 : 0;
      last = key;
    }
    await evaluate(page, (d) => d.pause());
    for (let i = 0; i < 8; i += 1) await step(page);
  };
  const snapshot = async () => {
    const info = await evaluate(page, (d) => { const i = d.host()!.renderer.info; return { geometries: i.memory.geometries, textures: i.memory.textures }; });
    return { gpu: await gpuMemory(page), three: info, ring: await evaluate(page, (d) => d.gpuDriven.level()), heapBytes: await heap() };
  };
  const g6 = async (id: string, perFrame?: (frame: number) => Promise<void>) => {
    for (let i = 0; i < WARM_FRAMES; i += 1) { await perFrame?.(i - WARM_FRAMES); await step(page); }
    await resetGpuPeak(page);
    const steps: Step[] = [];
    let heapPeak = 0;
    for (let i = 0; i < FRAMES; i += 1) {
      await perFrame?.(i);
      steps.push(await step(page));
      if (i % 30 === 0) heapPeak = Math.max(heapPeak, await heap());
    }
    const stats = await evaluate(page, (d) => d.gpuDriven.stats());
    const after = await snapshot();
    const result = {
      id, batches: stats?.batches ?? 0, instances: stats?.instances ?? 0, gpuDrivenDraws: stats?.draws ?? 0, ring: after.ring,
      submitMs: summary(steps.map((s) => s.submitMs ?? NaN).filter(Number.isFinite)),
      cpuMs: summary(steps.map((s) => s.cpuMs)),
      gpuMs: summary(steps.map((s) => s.gpuMs ?? NaN).filter(Number.isFinite)),
      gpuMemoryMiB: { live: mib(after.gpu.liveBytes), peak: mib(after.gpu.peakBytes), textures: mib(after.gpu.textureBytes), buffers: mib(after.gpu.bufferBytes) },
      heapPeakMiB: mib(heapPeak),
    };
    results.push(result);
    console.log(`${id}: submit ${result.submitMs?.mean} / p95 ${result.submitMs?.p95} / max ${result.submitMs?.max} ms, main ${result.cpuMs?.mean} / p95 ${result.cpuMs?.p95} / max ${result.cpuMs?.max} ms, `
      + `gpu ${result.gpuMs?.mean ?? "-"} ms, ${result.instances} instances, GPU memory ${result.gpuMemoryMiB.live} MiB (peak ${result.gpuMemoryMiB.peak}), heap peak ${result.heapPeakMiB} MiB`);
    return result;
  };
  const shot = () => canvas.screenshot();

  // The level's own foliage, then the forest.
  await settle("own");
  await g6("own");
  const ownMemory = await snapshot();
  for (const entry of FOREST) await evaluate(page, (d, arg) => { const [t, f, p] = arg as [string, string, number]; return d.foliageType(t, { family: f, prototype: p }); }, [entry.type, entry.family, entry.prototype]);
  await settle("forest");
  const forestMemory = await snapshot();
  await g6("forest-summer");

  // Season changes: every frame recorded, nothing warmed (the first autumn / winter / spring of the page).
  {
    const before = await gpuMemory(page);
    await resetGpuPeak(page);
    const steps: Step[] = [];
    const changes: { season: string; frames: number; longestMs: number; gpuMaxMs: number | null }[] = [];
    let heapPeak = 0;
    for (const season of ["autumn", "winter", "spring", "summer"]) {
      await evaluate(page, (d, arg) => d.transitionSeason({ season: (arg as [string, number])[0], seconds: (arg as [string, number])[1] }), [season, SEASON_SECONDS]);
      const frames = Math.round(SEASON_SECONDS * 60) + 30;
      const own: Step[] = [];
      for (let i = 0; i < frames; i += 1) {
        const s = await step(page);
        own.push(s);
        if (i % 20 === 0) heapPeak = Math.max(heapPeak, await heap());
      }
      const state = await evaluate(page, (d) => d.environmentState());
      expect(state?.season, `${season} reached`).toBe(season);
      steps.push(...own);
      const gpu = own.map((s) => s.gpuMs ?? NaN).filter(Number.isFinite);
      changes.push({ season, frames, longestMs: round(Math.max(...own.map((s) => s.cpuMs))), gpuMaxMs: gpu.length ? round(Math.max(...gpu)) : null });
    }
    const after = await gpuMemory(page);
    const result = {
      id: "transitions", seasonSeconds: SEASON_SECONDS, changes,
      cpuMs: summary(steps.map((s) => s.cpuMs)),
      submitMs: summary(steps.map((s) => s.submitMs ?? NaN).filter(Number.isFinite)),
      gpuMs: summary(steps.map((s) => s.gpuMs ?? NaN).filter(Number.isFinite)),
      pipelinesCreated: after.pipelines - before.pipelines,
      shaderModulesCreated: after.shaderModules - before.shaderModules,
      gpuMemoryMiB: { before: mib(before.liveBytes), after: mib(after.liveBytes), peak: mib(after.peakBytes) },
      heapPeakMiB: mib(heapPeak),
    };
    results.push(result);
    console.log(`transitions: longest ${result.cpuMs?.max} ms (main), gpu ${result.gpuMs?.mean} / max ${result.gpuMs?.max} ms, pipelines +${result.pipelinesCreated}, `
      + `shader modules +${result.shaderModulesCreated}, GPU memory ${result.gpuMemoryMiB.before} -> ${result.gpuMemoryMiB.after} MiB (peak ${result.gpuMemoryMiB.peak}), heap peak ${result.heapPeakMiB} MiB`);
  }

  await evaluate(page, (d) => d.setSeason("winter"));
  await g6("forest-winter");
  await evaluate(page, (d) => d.setSurface({ snowCoverage: 1 }));
  await g6("forest-winter-snow");
  await evaluate(page, (d) => d.setSurface({ snowCoverage: 0 }));

  const length = Math.hypot(tx - x, tz - z) || 1;
  const dir = [(tx - x) / length, (tz - z) / length] as const;
  await g6("forest-walk-15mps", async (frame) => {
    const at = Math.max(0, frame + WARM_FRAMES) * WALK_SPEED * FRAME_MS / 1000;
    const px = x + dir[0] * at, pz = z + dir[1] * at;
    await evaluate(page, (d, arg) => { const [a, b, c, e, f] = arg as number[]; d.moveCamera(a!, b!, c!, [e!, b! - 5, f!]); }, [px, y, pz, px + dir[0] * 50, pz + dir[1] * 50]);
  });

  // Cell cycles in winter (PV-WES-05).
  {
    const home = async () => {
      await evaluate(page, (d, arg) => { const [a, b, c, e, f, g] = arg as number[]; d.moveCamera(a!, b!, c!, [e!, f!, g!]); }, [x, y, z, tx, ty, tz]);
      await settle("home");
    };
    await home();
    const first = await snapshot();
    const reference = await shot();
    const cycles: unknown[] = [];
    let kinds = first.gpu.bufferKinds;
    /** Buffer kinds whose live count changed since the last snapshot. */
    const kindDelta = (next: Record<string, number>) => Object.fromEntries([...new Set([...Object.keys(kinds), ...Object.keys(next)])]
      .map((key) => [key, (next[key] ?? 0) - (kinds[key] ?? 0)] as const).filter(([, n]) => n !== 0));
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      await evaluate(page, (d, arg) => { const [a, b, c] = arg as number[]; d.moveCamera(a!, b!, c!, [a! + 50, b! - 5, c!]); }, [x + AWAY, y, z]);
      await settle("away");
      const away = await snapshot();
      await home();
      const back = await snapshot();
      const image = await shot();
      const changed = await changedShare(page, reference, image);
      const state = await evaluate(page, (d) => d.environmentState());
      cycles.push({
        cycle,
        away: { ring: away.ring, gpuObjects: away.gpu.textures + away.gpu.buffers, gpuMiB: mib(away.gpu.liveBytes), three: away.three },
        back: { ring: back.ring, gpuObjects: back.gpu.textures + back.gpu.buffers, gpuMiB: mib(back.gpu.liveBytes), three: back.three, heapMiB: mib(back.heapBytes) },
        imageChanged: round(changed), season: state?.season, seasonProgress: state?.seasonProgress ?? null,
        bufferKindsChanged: kindDelta(back.gpu.bufferKinds),
      });
      console.log(`cycle ${cycle} buffer kinds changed: ${JSON.stringify(kindDelta(back.gpu.bufferKinds))}`);
      kinds = back.gpu.bufferKinds;
      console.log(`cycle ${cycle}: away ${away.ring?.cells} cells / ${mib(away.gpu.liveBytes)} MiB, back ${back.ring?.cells} cells / ${back.ring?.instances} instances / `
        + `${back.gpu.textures} textures / ${back.gpu.buffers} buffers / ${mib(back.gpu.liveBytes)} MiB, three ${back.three.geometries} geometries / ${back.three.textures} textures, `
        + `image changed ${(changed * 100).toFixed(3)} %, ${state?.season} ${state?.seasonProgress ?? "-"}`);
    }
    results.push({
      id: "cycle", away: AWAY,
      first: { ring: first.ring, textures: first.gpu.textures, buffers: first.gpu.buffers, gpuMiB: mib(first.gpu.liveBytes), three: first.three, heapMiB: mib(first.heapBytes) },
      cycles,
    });
  }

  // LOD shots (PV-WES-03): from 45 m off the densest tree / bush group near P2 (the level's placements, computed
  // in Node as the ring does), each season state against its own shot without the level's foliage (snow
  // whitens the ground too); the forest's share of the image, shadows included.
  {
    const trees = derekavakFoliage([x, z]).types.filter((type) => /conifer|bush/.test(type.name))
      .flatMap((type) => Array.from({ length: type.matrices.length / 16 }, (_, i) => [type.matrices[i * 16 + 12]!, type.matrices[i * 16 + 13]!, type.matrices[i * 16 + 14]!] as const));
    let best = trees[0]!, bestCount = -1;
    for (const tree of trees) {
      if (Math.hypot(tree[0] - x, tree[2] - z) > 400) continue;
      const count = trees.filter((other) => Math.hypot(other[0] - tree[0], other[2] - tree[2]) < 30).length;
      if (count > bestCount) { best = tree; bestCount = count; }
    }
    const group = trees.filter((other) => Math.hypot(other[0] - best[0], other[2] - best[2]) < 30);
    const centre = [mean(group.map((t) => t[0])), mean(group.map((t) => t[1])), mean(group.map((t) => t[2]))] as const;
    const away = Math.hypot(centre[0] - x, centre[2] - z) || 1;
    const camera = [centre[0] + (x - centre[0]) / away * 45, centre[1] + 9, centre[2] + (z - centre[2]) / away * 45] as const;
    await evaluate(page, (d, arg) => { const [a, b, c, e, f, g] = arg as number[]; d.moveCamera(a!, b!, c!, [e!, f!, g!]); }, [...camera, centre[0], centre[1] + 5, centre[2]]);
    await settle("lod pose");
    const coverage: Record<string, number[]> = {};
    for (const [season, snow] of [["summer", 0], ["autumn", 0], ["winter", 0], ["winter", 1]] as const) {
      const key = snow ? `${season}-snow` : season;
      await evaluate(page, (d, arg) => { const [s, c] = arg as [string, number]; d.setSeason(s); d.setSurface({ snowCoverage: c }); }, [season, snow]);
      await evaluate(page, (d) => d.gpuDriven.levelVisible(false));
      for (let i = 0; i < 8; i += 1) await step(page);
      const empty = await shot();
      await evaluate(page, (d) => d.gpuDriven.levelVisible(true));
      coverage[key] = [];
      for (const lod of [0, 1, 2, 3]) {
        await evaluate(page, (d, arg) => d.foliageLod(arg as number), lod);
        for (let i = 0; i < 8; i += 1) await step(page);
        const image = await shot();
        mkdirSync(join(RENDER_REFS, "candidates"), { recursive: true });
        writeFileSync(join(RENDER_REFS, "candidates", `pg3-wes03-${key}-${lod === 3 ? "impostor" : `lod${lod}`}.png`), image);
        coverage[key]!.push(round(await changedShare(page, empty, image)));
      }
      console.log(`LOD coverage ${key}: ${coverage[key]!.map((c) => (c * 100).toFixed(2)).join(" / ")} % (LOD 0 / 1 / 2 / impostor)`);
    }
    await evaluate(page, (d) => d.foliageLod(null));
    results.push({ id: "lod-shots", group: { trees: group.length, centre: centre.map(round), camera: camera.map(round) }, coverage });
  }
  expect(errors).toEqual([]);

  const record = {
    schema: 1,
    kind: "phase 5c gate: generated forest (PG3, PV-WES-03 / 05 / 08)",
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    viewport: SMOKE_VIEWPORT, frameMs: FRAME_MS, warmFrames: WARM_FRAMES, frames: FRAMES,
    g6: { submitMs: 3, mainMs: 6 },
    forest: FOREST,
    memory: {
      own: { gpuMiB: mib(ownMemory.gpu.liveBytes), textureMiB: mib(ownMemory.gpu.textureBytes), heapMiB: mib(ownMemory.heapBytes) },
      forest: { gpuMiB: mib(forestMemory.gpu.liveBytes), textureMiB: mib(forestMemory.gpu.textureBytes), heapMiB: mib(forestMemory.heapBytes), unknownFormats: forestMemory.gpu.unknownFormats },
    },
    scenarios: results,
  };
  const stamp = record.date.replace(/[:.]/g, "-");
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${stamp}-forest.json`), `${JSON.stringify(record, null, 2)}\n`);
});


