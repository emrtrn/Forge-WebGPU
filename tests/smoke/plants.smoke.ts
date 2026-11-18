// Generated plants (vegetation plan PG2): the starter pack's Broadleaf
// (deciduous) and Conifer (evergreen) families as single `forge.plant`
// actors in L03, drawn on the foliage path with the shared response to WES.
// Paused and stepped, wind calm, per backend:
// - the plants draw (the image changes when they are spawned);
// - winter takes the deciduous leaves (the image changes), a timed change
//   back to summer brings them back to the summer image;
// - snow covers the up-facing wood and leaves (the image changes);
// - no page or GPU error.
// WebGPU shots go to render-refs/candidates/pg2-plants-<state>.png for the
// eye (colour, light and look are the user's); nothing compares with a
// reference image. WebGL2 runs the CPU twin (never a WebGPU acceptance).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { difference, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface Dev {
  pause(): void;
  step(ms: number): Promise<{ ran: boolean }>;
  spawn(raw: unknown[]): string[];
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  levelSettings(patch: unknown): unknown;
  setSeason(season: string): void;
  transitionSeason(request: { season: string; seconds: number }): void;
  setSurface(surface: { snowCoverage?: number; wetness?: number }): void;
}
const forge = <T>(page: Page, run: string, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => (new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown)(
    (window as unknown as { __forgeDev: Dev }).__forgeDev, value), [run, arg] as const) as Promise<T>;
const steps = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await forge(page, "(d) => d.step(1000 / 60)");
};

const BROADLEAF = "ast_e6beb70fb2c3ee3f49dc40b4d332462c";
const CONIFER = "ast_07a452d81c19c7908b08569cde5297e9";

function plantActors(): unknown[] {
  const actors: unknown[] = [];
  let n = 0;
  for (const [family, z] of [[BROADLEAF, 318], [CONIFER, 332]] as const) {
    for (let prototype = 0; prototype < 3; prototype += 1, n += 1) {
      const yaw = n * 1.7;
      actors.push({
        id: `act_${(0xc0000 + n).toString(16).padStart(32, "0")}`,
        name: `Plant ${n}`, class: null, parent: null, spatiallyLoaded: true,
        transform: { p: [292 + prototype * 8, 0, z], r: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], s: [1, 1, 1] },
        components: { plant: { type: "forge.plant@1", family, prototype, seed: 11 + n } },
      });
    }
  }
  return actors;
}

test.use({ viewport: SMOKE_VIEWPORT });

for (const backend of ["webgpu", "webgl"] as const) test(`plants (${backend}): generated trees respond to the season and snow`, async ({ page }) => {
  test.setTimeout(300_000);
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
  await forge(page, "(d) => d.moveCamera(300, 4, 296, [300, 6, 326])");
  await steps(page, 30);
  const shot = () => page.getByTestId("forge-canvas").screenshot();
  const empty = await shot();
  await forge(page, "(d, a) => d.spawn(a)", plantActors());
  // Models and materials load, programs compile: step until the image settles.
  let summer = await shot();
  for (let i = 0; i < 20; i += 1) {
    await steps(page, 15);
    const next = await shot();
    if ((await difference(page, summer, next)) < 0.02 && (await difference(page, empty, next)) > 0.5) { summer = next; break; }
    summer = next;
  }
  const save = (name: string, image: Buffer): void => {
    if (webgl) return;
    mkdirSync(join(RENDER_REFS, "candidates"), { recursive: true });
    writeFileSync(join(RENDER_REFS, "candidates", `pg2-plants-${name}.png`), image);
  };
  const drawn = await difference(page, empty, summer);
  expect(drawn, "the plants draw").toBeGreaterThan(0.5);
  save("summer", summer);

  await forge(page, "(d) => d.setSeason('winter')");
  await steps(page, 6);
  const winter = await shot();
  const shed = await difference(page, summer, winter);
  expect(shed, "winter takes the deciduous leaves").toBeGreaterThan(0.2);
  save("winter", winter);

  // A timed change back: 2 simulation seconds, stepped through.
  await forge(page, "(d) => d.transitionSeason({ season: 'summer', seconds: 2 })");
  await steps(page, 140);
  const back = await shot();
  expect(await difference(page, summer, back), "summer again after the timed change").toBeLessThan(shed * 0.25);

  await forge(page, "(d) => d.setSurface({ snowCoverage: 1, wetness: 0 })");
  await steps(page, 6);
  const snow = await shot();
  expect(await difference(page, summer, snow), "snow covers the plants").toBeGreaterThan(0.1);
  save("snow", snow);
  console.log(`plants (${backend}): drawn ${drawn.toFixed(3)}, winter ${shed.toFixed(3)}`);
  expect(errors).toEqual([]);
});
