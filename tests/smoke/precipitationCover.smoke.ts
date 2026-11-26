// The precipitation cover on the actual GPU (plan phase W3, HV-02): no rain or
// snow falls under a roof or in a room, and the ground under it stays dry and
// snowless; at the door it falls outside only. A hut of shapes (four walls, a
// door, a roof) is spawned on Derekavak's terrain in front of the camera
// (development hook; the reference project is not written), seen from inside,
// from its door and from outside. Removing the hut lets the rain in again and
// putting it back keeps it out (what a streamed building does: actors come
// and go). The candidates are for the eye.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RENDER_REFS, SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { difference, isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

type Vec3 = [number, number, number];
interface Dev {
  spawn(raw: unknown[]): string[];
  destroy(ids: string[]): void;
  pause(): void;
  step(ms: number): Promise<unknown>;
  setWeather(preset: string, intensity: number): void;
  setSurface(surface: Record<string, number>): void;
  setLateVisible(visible: boolean): void;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  streaming(): { camera: Vec3 };
  terrainHeights(points: readonly (readonly [number, number])[]): Promise<(number | null)[]>;
  precipitationCover(): { redraws: number; lastFrameRedraws: number } | null;
}

const FRAME_MS = 1000 / 60;
/** A shape primitive's edge at scale 1 (tools/scenes/indoorScene.ts). */
const SHAPE_SIZE = 0.5;
test.use({ viewport: SMOKE_VIEWPORT });

const evaluate = <T>(page: Page, run: (dev: Dev, arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => {
    const fn = new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown;
    return fn((window as unknown as { __forgeDev: Dev }).__forgeDev, value);
  }, [run.toString(), arg] as const) as Promise<T>;
const steps = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await evaluate(page, (d, ms) => d.step(ms as number), FRAME_MS);
};
const shot = async (page: Page): Promise<Buffer> => {
  await page.waitForTimeout(60);
  return page.screenshot();
};
const candidate = (name: string, data: Buffer): void => {
  const folder = join(RENDER_REFS, "candidates");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `cover-${name}.png`), data);
};

/** A box of shapes: centre, size (m); a flat grey shape that casts and has no collider. */
function box(index: number, centre: Vec3, size: Vec3): unknown {
  return {
    id: `act_c0fe${index.toString(16).padStart(28, "0")}`, name: `Cover hut ${index}`, spatiallyLoaded: false,
    transform: { p: centre, r: [0, 0, 0, 1], s: [size[0] / SHAPE_SIZE, size[1] / SHAPE_SIZE, size[2] / SHAPE_SIZE] },
    components: { shape: { type: "forge.shape@2", primitive: "cube", color: "#8a8f96", castShadow: true, collision: false, landmark: false } },
  };
}

/** A 6 m square room, 3 m walls, a door 1.6 m wide on its -x side, a roof with a 0.5 m overhang. */
function hut(c: Vec3): unknown[] {
  const [x, y, z] = c;
  const half = 3, t = 0.3, height = 3, base = y - 0.6, wall = height + 0.6, door = 1.6, doorTop = 2.2;
  const side = (half * 2 - door) / 2;
  return [
    box(1, [x + half, base + wall / 2, z], [t, wall, half * 2 + t]),
    box(2, [x, base + wall / 2, z - half], [half * 2 + t, wall, t]),
    box(3, [x, base + wall / 2, z + half], [half * 2 + t, wall, t]),
    // The door's side: two pieces and a lintel.
    box(4, [x - half, base + wall / 2, z - half + side / 2], [t, wall, side]),
    box(5, [x - half, base + wall / 2, z + half - side / 2], [t, wall, side]),
    box(6, [x - half, y + (doorTop + height) / 2, z], [t, height - doorTop, door]),
    box(7, [x, y + height + 0.1, z], [half * 2 + 1, 0.2, half * 2 + 1]),
  ];
}
const HUT_IDS = Array.from({ length: 7 }, (_, i) => `act_c0fe${(i + 1).toString(16).padStart(28, "0")}`);

test("precipitation cover: no rain or snow under a roof, dry ground inside, rain outside the door", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(`${message.text()} (${message.location().url})`); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "derekavak")!;
  await openSmokeLevel(page, scene.level, scene.poses.find((entry) => entry.id === "p1")!);
  await expect(page.locator("canvas[data-forge-backend='webgpu']")).toBeVisible();
  await page.waitForTimeout(2500);
  await evaluate(page, (d) => d.pause());

  const camera = (await evaluate(page, (d) => d.streaming())).camera;
  const cx = camera[0] + 12, cz = camera[2];
  const [ground] = await evaluate(page, (d, at) => d.terrainHeights([at as [number, number]]), [cx, cz]);
  expect(ground, "the hut stands on loaded terrain").not.toBeNull();
  const c: Vec3 = [cx, ground!, cz];
  await evaluate(page, (d, raw) => d.spawn(raw as unknown[]), hut(c));

  const poses: Record<string, { at: Vec3; look: Vec3 }> = {
    // Inside, looking at the back wall and the floor: no opening in view.
    inside: { at: [c[0] - 1.5, c[1] + 1.6, c[2]], look: [c[0] + 3, c[1] + 0.4, c[2] + 0.5] },
    // In the doorway under the lintel, looking out.
    door: { at: [c[0] - 2.6, c[1] + 1.6, c[2]], look: [c[0] - 12, c[1] + 0.5, c[2]] },
    // Outside, looking at the door.
    outside: { at: [c[0] - 9, c[1] + 1.8, c[2]], look: [c[0], c[1] + 1, c[2]] },
  };
  const go = async (pose: string): Promise<void> => {
    const { at, look } = poses[pose]!;
    await evaluate(page, (d, arg) => { const [p, l] = arg as [Vec3, Vec3]; d.moveCamera(p[0], p[1], p[2], l); }, [at, look]);
    await steps(page, 20);
  };
  /** What the late layer (rain, snow) adds to the picture now. */
  const falling = async (): Promise<{ amount: number; on: Buffer }> => {
    const on = await shot(page);
    await evaluate(page, (d) => { d.setLateVisible(false); return d.step(0); });
    const off = await shot(page);
    await evaluate(page, (d) => { d.setLateVisible(true); return d.step(0); });
    return { amount: await difference(page, on, off), on };
  };
  /** What a snowy, wet surface changes in the picture now (the shapes take none before phase W4). */
  const covered = async (): Promise<number> => {
    await evaluate(page, (d) => { d.setSurface({ snowCoverage: 0, wetness: 0 }); return d.step(0); });
    const dry = await shot(page);
    await evaluate(page, (d) => { d.setSurface({ snowCoverage: 1, wetness: 1 }); return d.step(0); });
    const white = await shot(page);
    await evaluate(page, (d) => { d.setSurface({ snowCoverage: 0, wetness: 0 }); return d.step(0); });
    return difference(page, dry, white);
  };

  await evaluate(page, (d) => d.setWeather("rain", 1));
  const results: Record<string, number> = {};
  for (const pose of ["inside", "door", "outside"]) {
    await go(pose);
    const rain = await falling();
    results[`${pose} rain`] = rain.amount;
    candidate(`${pose}-rain`, rain.on);
  }
  await evaluate(page, (d) => d.setWeather("snow", 1));
  for (const pose of ["inside", "outside"]) {
    await go(pose);
    results[`${pose} snow`] = (await falling()).amount;
    results[`${pose} ground`] = await covered();
  }
  await evaluate(page, (d) => d.setSurface({ snowCoverage: 1 }));
  await go("door");
  candidate("door-snow-ground", await shot(page));
  await evaluate(page, (d) => d.setSurface({ snowCoverage: 0 }));

  // The hut goes: the rain comes in; it comes back: the rain stays out again.
  await evaluate(page, (d) => d.setWeather("rain", 1));
  await go("inside");
  await evaluate(page, (d, ids) => d.destroy(ids as string[]), HUT_IDS);
  await steps(page, 30);
  results["inside rain, hut removed"] = (await falling()).amount;
  await evaluate(page, (d, raw) => d.spawn(raw as unknown[]), hut(c));
  await page.waitForTimeout(500);
  await steps(page, 40);
  results["inside rain, hut back"] = (await falling()).amount;
  const stats = await evaluate(page, (d) => d.precipitationCover());
  console.log(`precipitation cover: ${Object.entries(results).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(", ")}; redraws ${stats?.redraws}`);

  expect(results["outside rain"], "rain falls outside").toBeGreaterThan(0.1);
  expect(results["inside rain"], "no rain under the roof").toBeLessThan(results["outside rain"]! * 0.05);
  expect(results["door rain"], "at the door it falls outside").toBeGreaterThan(results["inside rain"]! + 0.02);
  expect(results["inside snow"], "no snow under the roof").toBeLessThan(results["outside snow"]! * 0.05);
  expect(results["outside ground"], "the open ground turns white and wet").toBeGreaterThan(1);
  expect(results["inside ground"], "the ground inside stays as it is").toBeLessThan(results["outside ground"]! * 0.05);
  expect(results["inside rain, hut removed"], "without the hut it rains there").toBeGreaterThan(0.1);
  expect(results["inside rain, hut back"], "the hut back keeps it out").toBeLessThan(results["outside rain"]! * 0.05);
  expect(errors).toEqual([]);
});
