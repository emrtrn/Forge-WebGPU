// Far foliage billboards and tint (plan 5c F3) on Derekavak's own Landscape rules. No reference type has a
// far distance (F3 was deferred for that), so the page lays one over the three conifer types
// (`__forgeDev.foliageType`, development only): models fade out over 150–250 m, billboards (each model baked
// once into the PG3 impostor at run time, in the worker) carry on to 700 m. At P2, paused and stepped:
// - far blocks are built and their batches drawn, GPU counts inside the CPU reference's range;
// - the billboards stand where models stand: the conifers drawn with the quality's cull scale at 1 (models
//   near, billboards far) change only image blocks (6 px) that the same conifers change as models out to
//   the far distance (cull scale 6: the same cells, the cell size follows the authored cull distance, and
//   the billboards' keep fraction is a subset of every band's), within a tolerance for the impostor's
//   blur at its edges;
// - the billboards change the image (against the same types without a far distance);
// - the far tint changes the terrain past the cull distance;
// - no page or GPU error, no worker fallback.
// Two kinds: the conifers' own GLB models (the billboard baked at run time) and the same types drawn as the
// starter's generated Broadleaf family (`family` laid over them too: the family's baked PG3 atlas, its
// response): in winter its billboards go bare as its models do (the billboards add less, PV-WES-03).
// The same on the WebGL2 test backend (the CPU twin; never a WebGPU acceptance). Shots go to
// render-refs/candidates/ for the eye, counts to render-refs/runs/; nothing is compared with a reference.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { git, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface ViewCheck { gpu: number[]; cpu: { counts: number[]; certain: number[]; possible: number[] } }
interface Check extends ViewCheck { name: string; instances: number }
interface Ring { rings: number; cells: number; instances: number; pending: number }
interface Host { quality: { settings: Record<string, unknown> }; setQuality(quality: unknown): void }
interface Dev {
  pause(): void;
  resume(): void;
  step(ms: number): Promise<{ ran: boolean }>;
  host(): Host | null;
  foliageType(guid: string, patch: Record<string, unknown> | null): Promise<void>;
  setSeason(season: string): void;
  gpuDriven: {
    check(): Promise<Check[]>;
    level(): Promise<Ring | null>;
    levelFar(): Promise<{ blocks: number; instances: number } | null>;
  };
}

/** Derekavak's conifer Foliage Types (wp-conifer-a / b / c). */
const CONIFERS = ["ast_a75e79d09827ed1083cbee6e91599e19", "ast_a360fd61f7d3dee09259472826aabedd", "ast_0bded742743b730dc9da99971f2d0764"];
const NONE = { cullStart: 0, cullEnd: 0.001, far: { distance: 0, tint: 0 } };
const NEAR = { cullStart: 150, cullEnd: 250 };
// Within the resident tiles around P2: past them the ring grows no models (the billboards do, from the far map).
const FAR = { ...NEAR, far: { distance: 700, tint: 0 } };
const NO_FAR = { ...NEAR, far: { distance: 0, tint: 0 } };
const TINT = { ...NEAR, far: { distance: 700, tint: 0.6 } };
/** The starter pack's generated deciduous family (content/packs/starter/procgen/trees/Broadleaf). */
const BROADLEAF = "ast_e6beb70fb2c3ee3f49dc40b4d332462c";
type Kind = "glb" | "family";
/** The patch laid over conifer `index`: the family kind draws the Broadleaf's prototype `index`. */
const typePatch = (kind: Kind, patch: Record<string, unknown>, index: number) => (kind === "family" ? { ...patch, family: BROADLEAF, prototype: index } : patch);

const forge = <T>(page: Page, run: string, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => (new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown)(
    (window as unknown as { __forgeDev: Dev }).__forgeDev, value), [run, arg] as const) as Promise<T>;

async function steps(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await forge(page, "(d) => d.step(1000 / 60)");
  }
}

/** Lays `patch` over the conifers, sets the cull scale and waits until the ring and the far blocks settle; paused after. */
async function grow(page: Page, patch: Record<string, unknown>, cullScale: number, far: boolean, kind: Kind): Promise<void> {
  await forge(page, "(d) => d.resume()");
  await forge(page, `(d, arg) => {
    const host = d.host();
    host.setQuality({ ...host.quality, settings: { ...host.quality.settings, foliageCullDistanceScale: arg } });
  }`, cullScale);
  for (const [index, guid] of CONIFERS.entries()) await forge(page, "(d, arg) => d.foliageType(arg[0], arg[1])", [guid, typePatch(kind, patch, index)]);
  await expect.poll(() => forge<Ring | null>(page, "(d) => d.gpuDriven.level()"), { timeout: 60_000, message: "the ring settles" })
    .toMatchObject({ rings: 1, pending: 0 });
  if (far) {
    await expect.poll(async () => (await forge<{ blocks: number } | null>(page, "(d) => d.gpuDriven.levelFar()"))?.blocks ?? 0,
      { timeout: 60_000, message: "far blocks are built" }).toBeGreaterThan(0);
    // The impostors bake in the worker: every conifer's far batch is in.
    await expect.poll(async () => (await forge<Check[]>(page, "(d) => d.gpuDriven.check()")).filter((check) => check.name.startsWith("foliage-far/")).length,
      { timeout: 120_000, message: "the far batches are built" }).toBe(CONIFERS.length);
  }
  await forge(page, "(d) => d.pause()");
  await steps(page, 8);
}

/** Image blocks (6 px) each shot changes against its empty shot, and their overlap. */
async function blocks(page: Page, shots: { emptyNear: Buffer; near: Buffer; emptyFar: Buffer; far: Buffer }) {
  return page.evaluate(async (images) => {
    const pixels = async (base64: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return { data: context.getImageData(0, 0, image.width, image.height).data, width: image.width };
    };
    const [e1, b, e6, m] = await Promise.all(images.map(pixels));
    const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    const width = b!.width, block = 6, columns = Math.ceil(width / block);
    const changed = (a: Uint8ClampedArray, e: Uint8ClampedArray): Set<number> => {
      const set = new Set<number>();
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(lum(a, i) - lum(e, i)) <= 10) continue;
        const pixel = i / 4;
        set.add(Math.floor(Math.floor(pixel / width) / block) * columns + Math.floor((pixel % width) / block));
      }
      return set;
    };
    const near = changed(b!.data, e1!.data), far = changed(m!.data, e6!.data);
    // A billboard's block counts as standing on a model when the model changed it or a neighbouring block.
    // The map for the eye: the billboard shot, its blocks on a model green, off any model red.
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = b!.data.length / 4 / width;
    const context = canvas.getContext("2d")!;
    context.putImageData(new ImageData(new Uint8ClampedArray(b!.data), width, canvas.height), 0, 0);
    let inside = 0;
    for (const cell of near) {
      const x = cell % columns, y = Math.floor(cell / columns);
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy += 1) for (let dx = -1; dx <= 1 && !hit; dx += 1) hit = far.has((y + dy) * columns + x + dx);
      if (hit) inside += 1;
      context.fillStyle = hit ? "rgba(0, 255, 0, 0.35)" : "rgba(255, 0, 0, 0.6)";
      context.fillRect(x * block, y * block, block, block);
    }
    const map = canvas.toDataURL("image/png").split(",")[1]!;
    return { near: near.size, far: far.size, inside, precision: near.size ? inside / near.size : 0, map };
  }, [shots.emptyNear, shots.near, shots.emptyFar, shots.far].map((image) => image.toString("base64")));
}

/** Share of pixels whose luminance differs by more than 10 / 255. */
async function changedShare(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async (images) => {
    const data = await Promise.all(images.map(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    }));
    const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    let changed = 0;
    for (let i = 0; i < data[0]!.length; i += 4) if (Math.abs(lum(data[0]!, i) - lum(data[1]!, i)) > 10) changed += 1;
    return changed / (data[0]!.length / 4);
  }, [a, b].map((image) => image.toString("base64")));
}

test.use({ viewport: SMOKE_VIEWPORT });
test.setTimeout(480_000);

for (const kind of ["glb", "family"] as const) for (const backend of ["webgpu", "webgl"] as const) test(`foliage far (${backend}, ${kind}): billboards stand where the models stand, the tint darkens the far ground`, async ({ page }, testInfo) => {
  const webgl = backend === "webgl";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text());
    if (/Foliage worker failed|impostor bake worker (failed|unavailable)|far billboards not drawn|nothing to bake/.test(message.text())) errors.push(message.text());
  });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  const p2 = scene.poses.find((pose) => pose.id === "p2")!;
  // No ?debug: its readout changes between the shots and would count as changed blocks.
  await openSmokeLevel(page, scene.level, p2, webgl ? "&forceWebGL" : "");
  await expect(page.locator(`canvas[data-forge-backend='${webgl ? "webgl2" : "webgpu"}']`)).toBeVisible();
  const canvas = page.getByTestId("forge-canvas");
  const shot = () => canvas.screenshot();

  await grow(page, NONE, 6, false, kind);
  const emptyFar = await shot();
  // Models out to 1,500 m: the authored 250 m at scale 6 (1,500 m authored would change the cell size).
  await grow(page, NO_FAR, 6, false, kind);
  const models = await shot();
  await grow(page, NONE, 1, false, kind);
  const emptyNear = await shot();
  await grow(page, NO_FAR, 1, false, kind);
  const nearOnly = await shot();
  const started = Date.now();
  await grow(page, FAR, 1, true, kind);
  const farMs = Date.now() - started;
  const billboards = await shot();
  const far = (await forge<{ blocks: number; instances: number }>(page, "(d) => d.gpuDriven.levelFar()"))!;
  const checks = (await forge<Check[]>(page, "(d) => d.gpuDriven.check()")).filter((check) => check.name.startsWith("foliage-far/"));
  for (const check of checks) {
    check.gpu.forEach((gpu, lod) => {
      expect(gpu, `${check.name} LOD ${lod}: GPU ${gpu}, CPU certain ${check.cpu.certain[lod]}, possible ${check.cpu.possible[lod]}`)
        .toBeGreaterThanOrEqual(check.cpu.certain[lod]!);
      expect(gpu).toBeLessThanOrEqual(check.cpu.possible[lod]!);
    });
  }
  const visible = checks.reduce((sum, check) => sum + check.gpu.reduce((a, b) => a + b, 0), 0);
  expect(visible, "billboards are drawn").toBeGreaterThan(0);
  const added = await changedShare(page, nearOnly, billboards);
  const { map: placementMap, ...placement } = await blocks(page, { emptyNear, near: billboards, emptyFar, far: models });
  await grow(page, TINT, 1, true, kind);
  const tinted = await shot();
  const tint = await changedShare(page, billboards, tinted);
  // The family in winter: bare models near, bare billboards far (both shots in winter).
  let winter: { added: number; billboards: Buffer } | null = null;
  if (kind === "family") {
    await forge(page, "(d) => d.setSeason('winter')");
    await grow(page, NO_FAR, 1, false, kind);
    const nearWinter = await shot();
    await grow(page, FAR, 1, true, kind);
    const billboardsWinter = await shot();
    winter = { added: await changedShare(page, nearWinter, billboardsWinter), billboards: billboardsWinter };
    await forge(page, "(d) => d.setSeason('summer')");
  }
  await forge(page, "(d) => d.resume()");
  for (const guid of CONIFERS) await forge(page, "(d, arg) => d.foliageType(arg, null)", guid);

  console.log(`foliage far (${backend}, ${kind}): ${far.blocks} blocks, ${far.instances} billboards, ${visible} visible; billboards add ${(added * 100).toFixed(2)} %, `
    + `placement ${placement.inside} / ${placement.near} blocks (${(placement.precision * 100).toFixed(1)} %, models ${placement.far}), tint ${(tint * 100).toFixed(2)} %${winter ? `, winter billboards add ${(winter.added * 100).toFixed(2)} %` : ""}, far ready ${farMs} ms`);
  const record = {
    schema: 1,
    kind: "phase 5c F3 far foliage smoke",
    backend,
    typeKind: kind,
    date: new Date().toISOString(),
    commit: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    level: scene.level,
    pose: "p2",
    override: { conifers: CONIFERS, far: FAR, tint: TINT, family: kind === "family" ? BROADLEAF : null },
    far,
    visible,
    billboardsAdd: added,
    placement,
    tint,
    winterBillboardsAdd: winter?.added ?? null,
    farReadyMs: farMs,
    checks,
  };
  const stamp = record.date.replace(/[:.]/g, "-");
  const suffix = `${kind === "family" ? "-family" : ""}${webgl ? "-webgl" : ""}`;
  mkdirSync(join(RENDER_REFS, "runs"), { recursive: true });
  mkdirSync(join(RENDER_REFS, "candidates"), { recursive: true });
  writeFileSync(join(RENDER_REFS, "runs", `${stamp}-foliage-far${suffix}.json`), `${JSON.stringify(record, null, 2)}\n`);
  for (const [name, image] of [["far-billboards", billboards], ["far-models", models], ["far-tint", tinted], ["far-placement", Buffer.from(placementMap, "base64")], ...(winter ? [["far-billboards-winter", winter.billboards] as const] : [])] as const) {
    writeFileSync(join(RENDER_REFS, "candidates", `derekavak-p2-${name}${suffix}.png`), image);
    await testInfo.attach(`derekavak-p2-${name}${suffix}`, { body: image, contentType: "image/png" });
  }

  expect(added, "the billboards change the image").toBeGreaterThan(0.002);
  expect(placement.precision, "billboards stand where the models stand").toBeGreaterThan(0.85);
  expect(tint, "the far tint changes the far ground").toBeGreaterThan(0.002);
  if (winter) expect(winter.added, "bare in winter: the family's billboards add less than in summer").toBeLessThan(added * 0.8);
  expect(errors).toEqual([]);
});
