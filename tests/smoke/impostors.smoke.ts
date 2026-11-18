// Plant impostors (vegetation plan PG3, §6.4): the starter pack's Broadleaf
// and Conifer as single `forge.plant` actors in L03, each drawn once with
// LOD 0 forced and once with the impostor forced (`__forgeDev.foliageLod`),
// from the same camera. Paused and stepped, wind calm, per backend and
// family:
// - silhouettes (with their shadows) agree from 90 m around the tree (four
//   directions), from 30° and 60° up and from above: intersection over union
//   of what the tree changes, in 6 px blocks (the scale the frames resolve);
// - the same in winter (the deciduous tree bare) and in autumn (part shed);
// - no page or GPU error.
// WebGPU shots of the first view go to render-refs/candidates/pg3-impostor-*.png
// for the eye; the look is the user's. WebGL2 runs the CPU twin (never a
// WebGPU acceptance).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface Dev {
  pause(): void;
  step(ms: number): Promise<{ ran: boolean }>;
  spawn(raw: unknown[]): string[];
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  levelSettings(patch: unknown): unknown;
  setSeason(season: string): void;
  setSurface(surface: { snowCoverage?: number; wetness?: number }): void;
  foliageLod(lod: number | null): Promise<void>;
}
const forge = <T>(page: Page, run: string, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => (new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown)(
    (window as unknown as { __forgeDev: Dev }).__forgeDev, value), [run, arg] as const) as Promise<T>;
const steps = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await forge(page, "(d) => d.step(1000 / 60)");
};

const FAMILIES = { broadleaf: "ast_e6beb70fb2c3ee3f49dc40b4d332462c", conifer: "ast_07a452d81c19c7908b08569cde5297e9" } as const;
const TREE: readonly [number, number] = [300, 322];
/** The impostor is the batch's last LOD (three model LODs + impostor). */
const IMPOSTOR_LOD = 3;

/**
 * Intersection over union of what `a` and `b` change against `empty` (luminance step > 10 / 255), in 6 px blocks
 * (a block counts when any of its pixels changed): the silhouette at the scale the impostor's frames resolve, not
 * single thin leaves.
 */
async function silhouetteIou(page: Page, empty: Buffer, a: Buffer, b: Buffer): Promise<{ iou: number; pixels: number }> {
  return page.evaluate(async (images) => {
    const pixels = async (base64: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const [e, x, y] = await Promise.all(images.map(pixels));
    const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    const width = 1920, block = 6, columns = Math.ceil(width / block);
    const blocksA = new Set<number>(), blocksB = new Set<number>();
    let inA = 0;
    for (let i = 0; i < e!.length; i += 4) {
      const pixel = i / 4, cell = Math.floor(Math.floor(pixel / width) / block) * columns + Math.floor((pixel % width) / block);
      if (Math.abs(lum(x!, i) - lum(e!, i)) > 10) { blocksA.add(cell); inA += 1; }
      if (Math.abs(lum(y!, i) - lum(e!, i)) > 10) blocksB.add(cell);
    }
    let both = 0;
    for (const cell of blocksA) if (blocksB.has(cell)) both += 1;
    const either = blocksA.size + blocksB.size - both;
    return { iou: either ? both / either : 0, pixels: inA };
  }, [empty, a, b].map((image) => image.toString("base64")));
}

test.use({ viewport: SMOKE_VIEWPORT });

for (const backend of ["webgpu", "webgl"] as const) for (const [name, family] of Object.entries(FAMILIES)) {
  test(`impostors (${backend}, ${name}): the impostor keeps the tree's silhouette and season`, async ({ page }) => {
    test.setTimeout(400_000);
    const webgl = backend === "webgl";
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
    const scene = SMOKE_SCENES.find((entry) => entry.id === "l03")!;
    await openSmokeLevel(page, scene.level, scene.poses[0]!, webgl ? "&forceWebGL" : "");
    await expect(page.locator(`canvas[data-forge-backend='${webgl ? "webgl2" : "webgpu"}']`)).toBeVisible();
    await page.waitForTimeout(800);
    await forge(page, "(d) => d.pause()");
    await forge(page, "(d) => d.levelSettings({ wind: { directionDeg: 45, strength: 0, gust: 0 } })");
    await forge(page, "(d) => d.setSeason('summer')");
    await forge(page, "(d) => d.setSurface({ snowCoverage: 0, wetness: 0 })");
    const shot = () => page.getByTestId("forge-canvas").screenshot();
    const [x, z] = TREE;
    // A distance the impostor is meant for (the tree ~ 120 px tall), not a close-up of its 128 px frames.
    const D = 90;
    const views: { name: string; eye: [number, number, number]; look: [number, number, number] }[] = [0, 90, 180, 270].map((deg) => ({
      name: `${deg}°`, eye: [x + D * Math.sin(deg * Math.PI / 180), 5, z + D * Math.cos(deg * Math.PI / 180)], look: [x, 6, z],
    }));
    for (const elevation of [30, 60]) {
      const r = elevation * Math.PI / 180;
      views.push({ name: `${elevation}° up`, eye: [x + D * Math.cos(r) * 0.6, 6 + D * Math.sin(r), z + D * Math.cos(r) * 0.8], look: [x, 6, z] });
    }
    views.push({ name: "above", eye: [x, 95, z + 15], look: [x, 0, z] });
    const look = async (view: (typeof views)[number]) => {
      await forge(page, "(d, a) => d.moveCamera(a[0], a[1], a[2], a[3])", [...view.eye, view.look]);
      await steps(page, 24);
    };
    const empties: Buffer[] = [];
    for (const view of views) { await look(view); empties.push(await shot()); }

    await forge(page, "(d, a) => d.spawn(a)", [{
      id: "act_000000000000000000000000000d0001", name: "Impostor Tree", class: null, parent: null, spatiallyLoaded: true,
      transform: { p: [x, 0, z], r: [0, Math.sin(0.35), 0, Math.cos(0.35)], s: [1, 1, 1] },
      components: { plant: { type: "forge.plant@1", family, prototype: 0, seed: 7 } },
    }]);
    // Models, textures and programs: step until both representations draw.
    await look(views[0]!);
    for (const lod of [0, IMPOSTOR_LOD]) {
      await forge(page, "(d, a) => d.foliageLod(a)", lod);
      await steps(page, 120);
    }
    const save = (file: string, image: Buffer): void => {
      if (webgl) return;
      mkdirSync(join(RENDER_REFS, "candidates"), { recursive: true });
      writeFileSync(join(RENDER_REFS, "candidates", `pg3-impostor-${name}-${file}.png`), image);
    };
    const compare = async (view: (typeof views)[number], empty: Buffer, label: string) => {
      await look(view);
      await forge(page, "(d, a) => d.foliageLod(a)", 0);
      await steps(page, 24);
      const model = await shot();
      await forge(page, "(d, a) => d.foliageLod(a)", IMPOSTOR_LOD);
      await steps(page, 24);
      const impostor = await shot();
      const { iou, pixels } = await silhouetteIou(page, empty, model, impostor);
      console.log(`impostors (${backend}, ${name}) ${label} ${view.name}: IoU ${iou.toFixed(3)}, ${pixels} model pixels`);
      return { iou, pixels, model, impostor };
    };

    expect(errors, "no error before the comparisons").toEqual([]);
    // Side views (with the shadow) are held to 0.75; from above a conifer's needles fall below a pixel on the
    // model at this distance while the supersampled bake keeps them, so 0.55 there.
    const summer: { iou: number; floor: number }[] = [];
    for (const [index, view] of views.entries()) {
      const result = await compare(view, empties[index]!, "summer");
      expect(result.pixels, `the tree draws (${view.name})`).toBeGreaterThan(1000);
      expect(result.pixels, `only the tree and its shadow change (${view.name})`).toBeLessThan(1920 * 1080 * 0.5);
      summer.push({ iou: result.iou, floor: view.name.endsWith("°") ? 0.75 : 0.55 });
      if (index === 0) { save("summer-model", result.model); save("summer-impostor", result.impostor); }
    }
    for (const [season, label] of [["winter", "winter"], ["autumn", "autumn"]] as const) {
      await forge(page, "(d, a) => d.setSeason(a)", season);
      const result = await compare(views[0]!, empties[0]!, label);
      summer.push({ iou: result.iou, floor: 0.75 });
      save(`${label}-model`, result.model); save(`${label}-impostor`, result.impostor);
    }
    await forge(page, "(d) => d.foliageLod(null)");
    for (const { iou, floor } of summer) expect(iou, "silhouettes agree").toBeGreaterThan(floor);
    expect(errors).toEqual([]);
  });
}
