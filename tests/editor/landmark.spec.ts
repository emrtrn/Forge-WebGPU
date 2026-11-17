// HLOD landmarks (plan 5c R8.4): a landmark past the view distance shows through
// the level's landmark proxy. The real cube is past the camera's far plane, so the
// red the canvas shows can only be the proxy, drawn pulled inside the far plane.
// The editor frames the whole level, so the beacon sits past the default landmark
// distance (3 view distances): the level sets its own.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { IDENTITY, openEditor, projectPath, shape } from "./support.ts";

const LEVEL = "content/levels/LandmarkSmoke";
const LEVEL_ID = `lvl_${"f".repeat(32)}`;
const NEAR = `act_${"c".repeat(31)}1`, BEACON = `act_${"c".repeat(31)}2`;

test.beforeAll(() => {
  mkdirSync(projectPath(`${LEVEL}/cells`), { recursive: true });
  writeFileSync(projectPath(`${LEVEL}/level.json`), JSON.stringify({ schema: "forge.level/1", id: LEVEL_ID, settings: { cellSize: 128, loadRange: 128, viewDistance: 300, landmarkDistance: 5000 }, actors: [
    { id: BEACON, name: "Beacon", parent: null, class: null, spatiallyLoaded: false, transform: { ...IDENTITY, p: [900, 20, 0], s: [80, 80, 80] },
      components: { shape: { ...shape("cube", "#ff0000"), landmark: true } } },
  ] }));
  writeFileSync(projectPath(`${LEVEL}/cells/0_0.json`), JSON.stringify({ schema: "forge.levelCell/1", level: LEVEL_ID, cell: "0_0", actors: [
    { id: NEAR, name: "Near", parent: null, class: null, spatiallyLoaded: true, transform: { ...IDENTITY, p: [0, 1, 0] }, components: { shape: shape() } },
  ] }));
  writeFileSync(projectPath(`${LEVEL}/cells.json`), JSON.stringify({ schema: "forge.levelCells/1", level: LEVEL_ID, persistent: "1111111111111111", cells: { "0_0": "2222222222222222" } }));
});

test("HLOD landmark: past the view distance the landmark proxy draws what the far plane clips", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await page.getByTestId("outliner-wp-tab").click();
  await expect(page.getByTestId("hlod-state")).toHaveAttribute("data-state", "current", { timeout: 90_000 });
  expect(existsSync(projectPath(`${LEVEL}/hlod/landmarks.glb`))).toBe(true);
  const canvas = page.getByTestId("forge-canvas");
  // The proxy is read after the publication refresh; red pixels then appear.
  await expect.poll(async () => {
    const { data, info } = await sharp(await canvas.screenshot()).raw().toBuffer({ resolveWithObject: true });
    let red = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i]! > 150 && data[i + 1]! < 80 && data[i + 2]! < 80) red += 1;
    return red;
  }, { timeout: 30_000 }).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});
