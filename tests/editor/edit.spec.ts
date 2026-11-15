// Edit operations and groups (plan phase 4 step 5c; INV-A08, Forge's
// `editor-authoring` / `actor-identity` intents): Ctrl + D and Delete with
// their undo, a singleton that is not duplicated, copy / paste in place,
// Ctrl + G / Shift + G with one undo step each, a viewport click on a grouped
// cube selecting the group, and Alt + gizmo drag duplicating as one undo
// step. The level is written into this run's temporary project copy (D14).

import { expect, test, type Page } from "@playwright/test";
import { shape, row, named, openEditor, writeLevel, IDENTITY } from "./support.ts";

const LEVEL = "content/levels/edit-smoke";
const id = (n: number): string => `act_${n.toString(16).padStart(32, "0")}`;
const CUBE_A = id(0xe1);
const CUBE_B = id(0xe2);
const FOG = id(0xe3);

const cube = (actorId: string, name: string, x: number) => ({
  id: actorId,
  name,
  class: null,
  parent: null,
  spatiallyLoaded: false,
  transform: { p: [x, 1, 0], r: [0, 0, 0, 1], s: [2, 2, 2] },
  components: { shape: shape("cube", "#c8c8c8") },
});

test.beforeAll(() => {
  const actors = [
    cube(CUBE_A, "Cube A", 0),
    cube(CUBE_B, "Cube B", 6),
    { id: FOG, name: "Fog", class: "ast_d01ad35f291add6b77e6eb9737e62b69", parent: null, spatiallyLoaded: false, transform: IDENTITY, overrides: {} },
  ];
  writeLevel(LEVEL, "lvl_0000000000000000000000000000e001", actors);
});

async function open(page: Page): Promise<string[]> {
  return openEditor(page, { level: LEVEL });
}

const summary = (page: Page) => page.getByTestId("outliner-summary");
const press = (page: Page, keys: string) => page.locator("body").press(keys);

test("Ctrl + D, Delete, copy and paste; each one undo step; a singleton is not duplicated", async ({ page }) => {
  const errors = await open(page);
  await row(page, CUBE_A).click();
  await press(page, "Control+KeyD");
  await expect(named(page, "Cube A 2")).toHaveClass(/active/);
  await expect(summary(page)).toHaveText("4 actors (1 selected)");
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("0");
  await page.getByTestId("editor-undo").click();
  await expect(named(page, "Cube A 2")).toHaveCount(0);

  await row(page, CUBE_A).click();
  await press(page, "Delete");
  await expect(row(page, CUBE_A)).toHaveCount(0);
  await page.getByTestId("editor-undo").click();
  await expect(row(page, CUBE_A)).toHaveCount(1);

  await row(page, CUBE_B).click();
  await press(page, "Control+KeyC");
  await press(page, "Control+KeyV");
  await expect(named(page, "Cube B 2")).toHaveClass(/active/);
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("6");
  await page.getByTestId("editor-undo").click();
  await expect(named(page, "Cube B 2")).toHaveCount(0);

  await row(page, FOG).click();
  await press(page, "Control+KeyD");
  await expect(page.getByTestId("editor-toast")).toContainText("one per level");
  await expect(summary(page)).toHaveText("3 actors (1 selected)");
  expect(errors).toEqual([]);
});

test("Ctrl + G groups, Shift + G ungroups, one undo step each; a click on a grouped cube selects the group", async ({ page }) => {
  const errors = await open(page);
  const canvas = page.getByTestId("forge-canvas");
  await expect(canvas).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  await row(page, CUBE_A).click();
  await row(page, CUBE_B).click({ modifiers: ["Control"] });
  await press(page, "Control+KeyG");
  const group = named(page, "Group");
  await expect(group).toHaveClass(/active/);
  await expect(row(page, CUBE_A)).toHaveCSS("padding-left", "22px");
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("3");

  // Frame Cube A (the Outliner selects the row itself), then click it in the viewport: the group is selected.
  await row(page, CUBE_A).click();
  await press(page, "KeyF");
  await press(page, "Escape");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(group).toHaveClass(/active/);
  await expect(row(page, CUBE_A)).not.toHaveClass(/active/);

  await press(page, "Shift+KeyG");
  await expect(group).toHaveCount(0);
  await expect(row(page, CUBE_A)).toHaveCSS("padding-left", "8px");
  await page.getByTestId("editor-undo").click();
  await expect(named(page, "Group")).toHaveCount(1);
  await page.getByTestId("editor-undo").click();
  await expect(named(page, "Group")).toHaveCount(0);
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("Alt + gizmo drag duplicates and moves the copy: one undo step", async ({ page }) => {
  const errors = await open(page);
  const canvas = page.getByTestId("forge-canvas");
  await expect(canvas).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  await row(page, CUBE_A).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let notch = 0; notch < 4; notch += 1) await page.mouse.wheel(0, 300);
  await expect(canvas).toHaveAttribute("data-forge-gizmo", /move:x/);
  const points = JSON.parse((await canvas.getAttribute("data-forge-gizmo"))!) as Record<string, [number, number]>;
  const [ox, oy] = points.origin!;
  const [hx, hy] = points["move:x"]!;
  const length = Math.hypot(hx - ox, hy - oy);
  await page.mouse.move(hx, hy);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(hx + ((hx - ox) / length) * 30 * step, hy + ((hy - oy) / length) * 30 * step);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const copy = named(page, "Cube A 2");
  await expect(copy).toHaveClass(/active/);
  await expect(page.getByTestId("detail-transform.p[0]")).not.toHaveValue("0");
  await row(page, CUBE_A).click();
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("0");
  await page.getByTestId("editor-undo").click();
  await expect(copy).toHaveCount(0);
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  expect(errors).toEqual([]);
});
