// Picking in the editor viewport (plan phase 4 step 3; INV-A04, Forge's
// `editor-authoring` selection steps): a click on a drawn actor selects it
// (Outliner row, Details), a click on nothing clears, Ctrl + click adds or
// takes out, Escape clears, F frames the selection. The level is written into
// this run's temporary project copy (never into samples/, D14): one cube at
// the origin, which the default framing puts in the middle of the view.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const LEVEL = "content/levels/pick-smoke";
const CUBE = "act_0123456789abcdef0123456789abcdef";
const query = (): string => `/?editor&level=${encodeURIComponent(LEVEL)}${process.env.FORGE_EDITOR_WEBGPU === "1" ? "" : "&forceWebGL"}`;

test.beforeAll(() => {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) throw new Error("FORGE_EDITOR_SMOKE_PROJECT is not set (the editor smoke config sets it).");
  const folder = join(project, ...LEVEL.split("/"));
  mkdirSync(folder, { recursive: true });
  const identity = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
  const level = {
    schema: "forge.level/1",
    id: "lvl_fedcba9876543210fedcba9876543210",
    settings: { cellSize: 128 },
    actors: [
      {
        id: CUBE,
        name: "Pick Cube",
        class: null,
        parent: null,
        spatiallyLoaded: false,
        transform: { p: [0, 1, 0], r: [0, 0, 0, 1], s: [2, 2, 2] },
        components: {
          shape: { type: "forge.shape@2", parent: null, local: identity, primitive: "cube", color: "#c8c8c8", castShadow: true, collision: true },
        },
      },
    ],
  };
  writeFileSync(join(folder, "level.json"), `${JSON.stringify(level, null, 2)}\n`);
});

test("click selects the actor under the pointer; empty space, Ctrl + click and Escape change the selection", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(query());
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  const canvas = page.getByTestId("forge-canvas");
  await expect(canvas).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  const box = (await canvas.boundingBox())!;
  const row = page.locator(`[data-testid="outliner-row"][data-actor-id="${CUBE}"]`);

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(row).toHaveClass(/active/);
  await expect(page.getByTestId("detail-transform.p[1]")).toHaveValue("1");

  await page.mouse.click(box.x + 8, box.y + 8);
  await expect(row).not.toHaveClass(/active/);

  await page.keyboard.down("Control");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(row).toHaveClass(/active/);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(row).not.toHaveClass(/active/);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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
