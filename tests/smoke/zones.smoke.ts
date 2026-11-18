// Zones (plan 5c R9b Z3) on both backends: two rooms of the synthetic interior
// (`tools/scenes/indoorScene.ts`) spawned into L03 with a zone per room and a
// portal in the door between them. From room A the camera sees room B
// through the door; turned away, B's batches are hidden; from above (in no
// zone) everything draws. Read through `__forgeDev.zones()` after a frame.

import { expect, test, type Page } from "@playwright/test";
import { indoorScene } from "../../tools/scenes/indoorScene.ts";
import { SMOKE_SCENES, SMOKE_VIEWPORT } from "./renderScenes.ts";
import { isOptionalHlodMiss, openSmokeLevel } from "./smokePage.ts";

interface ZoneStats { zones: number; portals: number; cameraZone: string | null; visible: number; tracked: number; shadowOnly: number; hidden: number }
interface Dev {
  pause(): void;
  step(ms: number): Promise<unknown>;
  moveCamera(x: number, y: number, z: number, look?: readonly [number, number, number]): void;
  spawn(raw: unknown[]): string[];
  zones(): ZoneStats | null;
}
const forge = <T>(page: Page, run: string, arg?: unknown): Promise<T> =>
  page.evaluate(([source, value]) => (new Function("dev", "arg", `return (${source})(dev, arg);`) as (dev: Dev, arg: unknown) => unknown)(
    (window as unknown as { __forgeDev: Dev }).__forgeDev, value), [run, arg] as const) as Promise<T>;
const steps = async (page: Page, count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await forge(page, "(d) => d.step(1000 / 60)");
};

const ORIGIN = [300, 0, 300] as const;
const LOCAL = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
const zoneActor = (id: string, x: number) => ({
  id, name: `Zone ${id.slice(-1)}`, class: null, parent: null, spatiallyLoaded: false,
  transform: { p: [x, 1.5, ORIGIN[2] + 4], r: [0, 0, 0, 1], s: [1, 1, 1] },
  components: { zone: { type: "forge.zone@1", parent: null, local: LOCAL, size: [7.7, 3, 7.7], zoneName: "", alwaysCastShadows: false, generated: false } },
});

test.use({ viewport: SMOKE_VIEWPORT });
for (const backend of ["webgpu", "webgl"] as const) test(`R9b zones (${backend}): a room behind the camera is hidden, through the door it shows`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !isOptionalHlodMiss(message)) errors.push(message.text()); });
  const scene = SMOKE_SCENES.find((entry) => entry.id === "l03")!;
  await openSmokeLevel(page, scene.level, scene.poses[0]!, backend === "webgl" ? "&forceWebGL" : "");
  await expect(page.locator(`canvas[data-forge-backend='${backend === "webgpu" ? "webgpu" : "webgl2"}']`)).toBeVisible();
  await forge(page, "(d) => d.pause()");
  const rooms = indoorScene({ origin: [...ORIGIN], roomsX: 2, roomsZ: 1, propsPerRoom: 4 });
  const zoneA = "act_e0000000000000000000000000000a01", zoneB = "act_e0000000000000000000000000000b01";
  const half = Math.SQRT1_2;
  const portal = {
    id: "act_e0000000000000000000000000000c01", name: "Portal AB", class: null, parent: null, spatiallyLoaded: false,
    transform: { p: [ORIGIN[0] + 8, 1.1, ORIGIN[2] + 4], r: [0, half, 0, half], s: [1, 1, 1] },
    components: { portal: { type: "forge.portal@1", parent: null, local: LOCAL, size: [1.6, 2.2], zoneA: null, zoneB: null, generated: false } },
  };
  await forge(page, "(d, a) => d.spawn(a)", [...rooms.actors, zoneActor(zoneA, ORIGIN[0] + 4), zoneActor(zoneB, ORIGIN[0] + 12), portal]);
  const look = async (position: readonly number[], target: readonly number[]): Promise<ZoneStats> => {
    await forge(page, "(d, a) => d.moveCamera(a[0][0], a[0][1], a[0][2], a[1])", [position, target]);
    // Stepped WebGL2 frames do not all draw; several make sure the zones were updated.
    await steps(page, 10);
    return (await forge<ZoneStats | null>(page, "(d) => d.zones()"))!;
  };
  // Batches build over a few frames.
  await steps(page, 30);
  const eye = [ORIGIN[0] + 2, 1.7, ORIGIN[2] + 4];
  const through = await look(eye, [ORIGIN[0] + 20, 1.7, ORIGIN[2] + 4]);
  expect(through).toMatchObject({ zones: 2, portals: 1, cameraZone: zoneA, visible: 2, hidden: 0 });
  expect(through.tracked).toBeGreaterThan(1);
  const away = await look(eye, [ORIGIN[0] - 20, 1.7, ORIGIN[2] + 4]);
  expect(away).toMatchObject({ cameraZone: zoneA, visible: 1, shadowOnly: 0 });
  expect(away.hidden).toBeGreaterThan(0);
  const above = await look([ORIGIN[0] + 8, 30, ORIGIN[2] + 4], [ORIGIN[0] + 8, 0, ORIGIN[2] + 4.01]);
  expect(above).toMatchObject({ cameraZone: null, visible: 2, hidden: 0 });
  expect(errors).toEqual([]);
});
