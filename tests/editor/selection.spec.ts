// Picking in the editor viewport (plan phase 4 step 3; INV-A04, Forge's
// `editor-authoring` selection steps): a click on a drawn actor selects it
// (Outliner row, Details), a click on nothing clears, Ctrl + click adds or
// takes out, Escape clears, F frames the selection. The level is written into
// this run's temporary project copy (never into samples/, D14): one cube at
// the origin, which the default framing puts in the middle of the view.

import { expect, test } from "@playwright/test";
import { shape, openEditor, writeLevel } from "./support.ts";

const LEVEL = "content/levels/pick-smoke";
const CUBE = "act_0123456789abcdef0123456789abcdef";

test.beforeAll(() => {
  const actors = [
    {
      id: CUBE,
      name: "Pick Cube",
      class: null,
      parent: null,
      spatiallyLoaded: false,
      transform: { p: [0, 1, 0], r: [0, 0, 0, 1], s: [2, 2, 2] },
      components: {
        shape: shape("cube", "#c8c8c8"),
      },
    },
  ];
  writeLevel(LEVEL, "lvl_fedcba9876543210fedcba9876543210", actors);
});

test("click selects the actor under the pointer; empty space, Ctrl + click and Escape change the selection", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  const canvas = page.getByTestId("forge-canvas");
  const box = (await canvas.boundingBox())!;
  const row = page.locator(`[data-testid="outliner-row"][data-actor-id="${CUBE}"]`);

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(row).toHaveClass(/active/);
  await expect(page.getByTestId("detail-transform.p[1]")).toHaveValue("1");

  await page.mouse.click(box.x + 8, box.y + 8);
  await expect(row).not.toHaveClass(/active/);

  // On the cube but off the selected cube's gizmo (its handles sit at the middle and take a press first, as in Forge).
  const [cubeX, cubeY] = [box.x + box.width / 2 - 150, box.y + box.height / 2 - 110];
  await page.keyboard.down("Control");
  await page.mouse.click(cubeX, cubeY);
  await expect(row).toHaveClass(/active/);
  await page.mouse.click(cubeX, cubeY);
  await expect(row).not.toHaveClass(/active/);
  await page.mouse.click(cubeX, cubeY);
  await page.keyboard.up("Control");
  await expect(row).toHaveClass(/active/);

  await page.locator("body").press("KeyF");
  await expect(page.getByTestId("editor-toast")).toBeHidden();
  await page.locator("body").press("Escape");
  await expect(row).not.toHaveClass(/active/);
  await page.locator("body").press("KeyF");
  await expect(page.getByTestId("editor-toast")).toHaveText("No selected object to focus.");
  expect(errors).toEqual([]);
});

// Forge's editor-viewport-panel smoke kept the perspective and orthographic projections aligned
// with the canvas: in the Top view (orthographic, 1.000 m back) a click on the framed cube picks it.
test("the Top view picks what it draws: a click on the framed cube selects it", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  const canvas = page.getByTestId("forge-canvas");
  const row = page.locator(`[data-testid="outliner-row"][data-actor-id="${CUBE}"]`);
  await row.click();
  await page.locator("body").press("Digit1");
  await expect(page.getByTestId("camera-button")).toHaveText("Top");
  await page.locator("body").press("KeyF");
  await page.locator("body").press("Escape");
  await expect(row).not.toHaveClass(/active/);
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(row).toHaveClass(/active/);
  await page.mouse.click(box.x + 8, box.y + 8);
  await expect(row).not.toHaveClass(/active/);
  expect(errors).toEqual([]);
});
