// The Outliner (plan phase 4 step 5a; INV-A12, Forge's `outliner` smoke):
// hierarchy and collapse, click / Ctrl / Shift selection, search, the type
// filter, rename, drag-and-drop parenting with its undo, Lock Movement and the
// editor-only eye (not saved, remembered by the page). A second level of
// 5.000 actors checks that only the rows in view are in the DOM (the timing
// at 50.000 is `npm run bench:outliner`, not the gate). Levels are written
// into this run's temporary project copy (D14).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SMALL = "content/levels/outliner-smoke";
const LARGE = "content/levels/outliner-large";
const id = (n: number): string => `act_${n.toString(16).padStart(32, "0")}`;
const PROPS = id(1);
const CUBE_A = id(2);
const CUBE_B = id(3);
const LAMP = id(4);
const CRATE = id(5);
const IDENTITY = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
const webgl = process.env.FORGE_EDITOR_WEBGPU === "1" ? "" : "&forceWebGL";
const query = (level: string): string => `/?editor&level=${encodeURIComponent(level)}${webgl}`;

const shape = (primitive: string) => ({ shape: { type: "forge.shape@2", parent: null, local: IDENTITY, primitive, color: "#c8c8c8", castShadow: true, collision: true } });
const actor = (actorId: string, name: string, parent: string | null, p: number[], components: Record<string, unknown>) => ({
  id: actorId,
  name,
  class: null,
  parent,
  spatiallyLoaded: false,
  transform: { p, r: [0, 0, 0, 1], s: [1, 1, 1] },
  components,
});

function writeLevel(folder: string, levelId: string, actors: unknown[]): void {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) throw new Error("FORGE_EDITOR_SMOKE_PROJECT is not set (the editor smoke config sets it).");
  const path = join(project, ...folder.split("/"));
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "level.json"), `${JSON.stringify({ schema: "forge.level/1", id: levelId, settings: { cellSize: 128 }, actors }, null, 2)}\n`);
}

test.beforeAll(() => {
  writeLevel(SMALL, "lvl_0000000000000000000000000000a001", [
    actor(PROPS, "Props", null, [4, 0, 0], {}),
    actor(CUBE_A, "Cube A", PROPS, [1, 0.5, 0], shape("cube")),
    actor(CUBE_B, "Cube B", PROPS, [-1, 0.5, 0], shape("sphere")),
    actor(LAMP, "Lamp", null, [0, 3, 0], { light: { type: "forge.pointLight@1", parent: null, local: IDENTITY } }),
    actor(CRATE, "Crate", null, [0, 0.5, 6], shape("cube")),
  ]);
  writeLevel(
    LARGE,
    "lvl_0000000000000000000000000000a002",
    Array.from({ length: 5_000 }, (_, index) => actor(id(0x1000 + index), `Marker ${String(index).padStart(4, "0")}`, null, [index % 100, 0, Math.floor(index / 100)], {})),
  );
});

async function open(page: Page, level: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(query(level));
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  return errors;
}

const row = (page: Page, actorId: string) => page.locator(`[data-testid="outliner-row"][data-actor-id="${actorId}"]`);
const order = async (page: Page): Promise<string[]> =>
  page.getByTestId("outliner-row").evaluateAll((rows) =>
    rows
      .filter((one) => !(one as HTMLElement).hidden)
      .sort((a, b) => parseFloat((a as HTMLElement).style.top) - parseFloat((b as HTMLElement).style.top))
      .map((one) => `${(one as HTMLElement).style.paddingLeft} ${one.querySelector("strong")!.textContent}`),
  );

test("hierarchy, collapse, selection, search and the type filter", async ({ page }) => {
  const errors = await open(page, SMALL);
  expect(await order(page)).toEqual(["8px Props", "22px Cube A", "22px Cube B", "8px Lamp", "8px Crate"]);
  await expect(page.getByTestId("outliner-summary")).toHaveText("5 actors (0 selected)");

  await row(page, PROPS).getByTestId("outliner-expander").click();
  expect(await order(page)).toEqual(["8px Props", "8px Lamp", "8px Crate"]);
  await row(page, PROPS).getByTestId("outliner-expander").click();

  await row(page, CUBE_A).click();
  await row(page, LAMP).click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("outliner-summary")).toHaveText("5 actors (3 selected)");
  await row(page, CUBE_B).click({ modifiers: ["Control"] });
  await expect(row(page, CUBE_B)).not.toHaveClass(/active/);
  await expect(row(page, LAMP)).toHaveClass(/active/);
  await row(page, CRATE).click();
  await expect(page.getByTestId("outliner-summary")).toHaveText("5 actors (1 selected)");

  await page.getByTestId("outliner-search").fill("cu");
  expect(await order(page)).toEqual(["8px Cube A", "8px Cube B"]);
  await page.getByTestId("outliner-search").fill("");

  await page.getByTestId("outliner-filter").click();
  await page.locator('[data-outliner-type-filter="light"]').uncheck();
  await expect(row(page, LAMP)).toHaveCount(0);
  await expect(page.getByTestId("outliner-filter")).toHaveClass(/is-filtered/);
  await page.locator('[data-outliner-type-filter="light"]').check();
  await expect(row(page, LAMP)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("rename, drag-and-drop parenting and Lock Movement are undo steps", async ({ page }) => {
  const errors = await open(page, SMALL);
  page.once("dialog", (dialog) => void dialog.accept("Wooden Crate"));
  await row(page, CRATE).dblclick();
  await expect(row(page, CRATE).locator("strong")).toHaveText("Wooden Crate");

  // Crate goes under Props (at x = 4) and keeps its place in the world: its local x is -4.
  await row(page, CRATE).dragTo(row(page, PROPS));
  expect(await order(page)).toEqual(["8px Props", "22px Cube A", "22px Cube B", "22px Wooden Crate", "8px Lamp"]);
  await row(page, CRATE).click();
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("-4");
  await page.getByTestId("editor-undo").click();
  expect(await order(page)).toEqual(["8px Props", "22px Cube A", "22px Cube B", "8px Lamp", "8px Wooden Crate"]);
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("0");
  // An actor cannot go under its own child.
  await row(page, PROPS).dragTo(row(page, CUBE_A));
  await expect(page.getByTestId("editor-toast")).toHaveText("An actor cannot go under itself or its own child.");

  await row(page, CRATE).getByTestId("outliner-lock").click();
  await expect(page.getByTestId("detail-locked")).toBeChecked();
  await expect(page.getByTestId("detail-transform.p[0]")).toBeDisabled();
  await expect(page.getByTestId("snap-floor")).toBeDisabled();
  await page.getByTestId("detail-locked").uncheck();
  await expect(page.getByTestId("detail-transform.p[0]")).toBeEnabled();
  await page.getByTestId("editor-undo").click();
  await expect(row(page, CRATE).getByTestId("outliner-lock")).toHaveClass(/on/);
  await page.getByTestId("editor-undo").click();
  await page.getByTestId("editor-undo").click();
  await expect(row(page, CRATE).locator("strong")).toHaveText("Crate");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("the eye hides in the editor only: children too, the selection lets go, no undo step, nothing to save; the page remembers it", async ({ page }) => {
  const errors = await open(page, SMALL);
  await row(page, CUBE_A).click();
  await row(page, PROPS).getByTestId("outliner-hide").click();
  await expect(row(page, CUBE_A)).toHaveClass(/is-hidden/);
  await expect(row(page, CUBE_A)).not.toHaveClass(/active/);
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  await expect(page.getByTestId("editor-save")).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  await expect(row(page, PROPS).getByTestId("outliner-hide")).toHaveClass(/on/);
  await row(page, PROPS).getByTestId("outliner-hide").click();
  await expect(row(page, CUBE_A)).not.toHaveClass(/is-hidden/);
  expect(errors).toEqual([]);
});

test("5.000 actors: only the rows in view are in the DOM; scrolling reaches the last", async ({ page }) => {
  const errors = await open(page, LARGE);
  await expect(page.getByTestId("outliner-summary")).toHaveText("5000 actors (0 selected)");
  const drawn = await page.getByTestId("outliner-row").count();
  expect(drawn).toBeGreaterThan(5);
  expect(drawn).toBeLessThanOrEqual(200);
  await page.getByTestId("outliner-list").evaluate((list) => (list.scrollTop = list.scrollHeight));
  await expect(page.getByTestId("outliner-row").filter({ hasText: "Marker 4999" })).toBeVisible();
  expect(await page.getByTestId("outliner-row").count()).toBeLessThanOrEqual(200);
  await page.getByTestId("outliner-row").filter({ hasText: "Marker 4999" }).click();
  await expect(page.getByTestId("outliner-summary")).toHaveText("5000 actors (1 selected)");
  expect(errors).toEqual([]);
});
