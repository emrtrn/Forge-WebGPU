// Foliage wind (vegetation plan PG2): Derekavak's foliage types sway
// (`sway.enabled`, Forge's height formula, render/foliage/foliageWind.ts) on
// both draw paths. At P2, paused and stepped: with the level wind at 0 two
// frames half a second apart differ only by the frame's noise (TRAA, grain);
// at strength 2 with gusts the foliage moves and the same pair differs
// clearly more. No page or GPU error. WebGL2 runs the CPU twin (never a
// WebGPU acceptance).

import { expect, test, type Page } from "@playwright/test";
import { SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { difference, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface Dev {
  pause(): void;
  step(ms: number): Promise<{ ran: boolean }>;
  levelSettings(patch: unknown): unknown;
  gpuDriven: { level(): Promise<{ pending: number } | null> };
}
const forge = <T>(page: Page, run: string, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => (new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown)(
    (window as unknown as { __forgeDev: Dev }).__forgeDev, value), [run, arg] as const) as Promise<T>;
const steps = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await forge(page, "(d) => d.step(1000 / 60)");
};

test.use({ viewport: SMOKE_VIEWPORT });

for (const backend of ["webgpu", "webgl"] as const) test(`foliage wind (${backend}): the level's foliage sways in the wind`, async ({ page }) => {
  const webgl = backend === "webgl";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  const p2 = scene.poses.find((pose) => pose.id === "p2")!;
  await openSmokeLevel(page, scene.level, p2, webgl ? "&forceWebGL" : "");
  await expect(page.locator(`canvas[data-forge-backend='${webgl ? "webgl2" : "webgpu"}']`)).toBeVisible();
  await expect.poll(() => forge<{ pending: number } | null>(page, "(d) => d.gpuDriven.level()"), { timeout: 30_000 }).toMatchObject({ pending: 0 });
  await forge(page, "(d) => d.pause()");
  await steps(page, 10);

  const pair = async (strength: number): Promise<number> => {
    await forge(page, "(d, s) => d.levelSettings({ wind: { directionDeg: 45, strength: s, gust: s > 0 ? 1 : 0 } })", strength);
    await steps(page, 4);
    const a = await page.getByTestId("forge-canvas").screenshot();
    await steps(page, 30);
    const b = await page.getByTestId("forge-canvas").screenshot();
    return difference(page, a, b);
  };
  const calm = await pair(0);
  const windy = await pair(2);
  console.log(`foliage wind (${backend}): calm ${calm.toFixed(3)}, windy ${windy.toFixed(3)}`);
  expect(windy, "the wind moves the foliage").toBeGreaterThan(calm * 1.5 + 0.05);
  expect(errors).toEqual([]);
});
