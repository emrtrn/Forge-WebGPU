// The Outliner (plan phase 4 step 5a; INV-A12, Forge's `outliner` smoke):
// hierarchy and collapse, click / Ctrl / Shift selection, search, the type
// filter, rename, drag-and-drop parenting with its undo, Lock Movement and the
// editor-only eye (not saved, remembered by the page). A second level of
// 5.000 actors checks that only the rows in view are in the DOM (the timing
// at 50.000 is `npm run bench:outliner`, not the gate). Levels are written
// into this run's temporary project copy (D14).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { shape, writeLevel, row, openEditor, projectPath, IDENTITY } from "./support.ts";

const SMALL = "content/levels/outliner-smoke";
/** The folder test saves: a level of its own. */
const FOLDERS = "content/levels/outliner-folders";
const LARGE = "content/levels/outliner-large";
const id = (n: number): string => `act_${n.toString(16).padStart(32, "0")}`;
const PROPS = id(1);
const CUBE_A = id(2);
const CUBE_B = id(3);
const LAMP = id(4);
const CRATE = id(5);

const actor = (actorId: string, name: string, parent: string | null, p: number[], components: Record<string, unknown>) => ({
  id: actorId,
  name,
  class: null,
  parent,
  spatiallyLoaded: false,
  transform: { p, r: [0, 0, 0, 1], s: [1, 1, 1] },
  components,
});

const smallActors = () => [
  actor(PROPS, "Props", null, [4, 0, 0], {}),
  actor(CUBE_A, "Cube A", PROPS, [1, 0.5, 0], { shape: shape("cube") }),
  actor(CUBE_B, "Cube B", PROPS, [-1, 0.5, 0], { shape: shape("sphere") }),
  actor(LAMP, "Lamp", null, [0, 3, 0], { light: { type: "forge.pointLight@1", parent: null, local: IDENTITY } }),
  actor(CRATE, "Crate", null, [0, 0.5, 6], { shape: shape("cube") }),
];

test.beforeAll(() => {
  writeLevel(SMALL, "lvl_0000000000000000000000000000a001", smallActors());
  writeLevel(FOLDERS, "lvl_0000000000000000000000000000a003", smallActors());
  writeLevel(
    LARGE,
    "lvl_0000000000000000000000000000a002",
    Array.from({ length: 5_000 }, (_, index) => actor(id(0x1000 + index), `Marker ${String(index).padStart(4, "0")}`, null, [index % 100, 0, Math.floor(index / 100)], {})),
  );
});

async function open(page: Page, level: string): Promise<string[]> {
  return openEditor(page, { level });
}

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
  await expect(page.getByTestId("detail-locked")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("detail-transform.p[0]")).toBeDisabled();
  await expect(page.getByTestId("snap-floor")).toBeDisabled();
  await page.getByTestId("detail-locked").click();
  await expect(page.getByTestId("detail-transform.p[0]")).toBeEnabled();
  await page.getByTestId("editor-undo").click();
  await expect(row(page, CRATE).getByTestId("outliner-lock")).toHaveClass(/on/);
  await page.getByTestId("editor-undo").click();
  await page.getByTestId("editor-undo").click();
  await expect(row(page, CRATE).locator("strong")).toHaveText("Crate");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("folders: New Folder takes the selection, rows are dragged in and out, rename and remove keep the actors; each is an undo step and is saved", async ({ page }) => {
  const errors = await open(page, FOLDERS);
  const folder = (path: string) => page.locator(`[data-testid="outliner-folder"][data-folder="${path}"]`);
  await row(page, CRATE).click();
  await row(page, CRATE).click({ button: "right" });
  page.once("dialog", (dialog) => void dialog.accept("Yard / Goods"));
  await page.getByTestId("outliner-menu-folder").click();
  await expect(folder("Yard")).toContainText("1 actor");
  await expect(row(page, CRATE)).toBeVisible();

  // A root, then a parented child: the child leaves its parent and keeps its place (Props is at x = 4).
  await row(page, LAMP).dragTo(folder("Yard/Goods"));
  await row(page, CUBE_A).dragTo(folder("Yard"));
  await expect(folder("Yard")).toContainText("3 actors");
  await row(page, CUBE_A).click();
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("5");

  // Closed, it hides what is in it; a selection made elsewhere is revealed.
  await folder("Yard").click();
  await expect(row(page, LAMP)).toHaveCount(0);
  await folder("Yard").click();
  await folder("Yard").click({ button: "right" });
  await page.getByTestId("outliner-folder-select").click();
  await expect(page.getByTestId("outliner-summary")).toHaveText("5 actors (3 selected)");
  await folder("Yard").getByTestId("outliner-lock").click();
  await expect(row(page, LAMP).getByTestId("outliner-lock")).toHaveClass(/on/);
  await page.getByTestId("editor-undo").click();
  await expect(row(page, LAMP).getByTestId("outliner-lock")).not.toHaveClass(/on/);

  await folder("Yard/Goods").click({ button: "right" });
  page.once("dialog", (dialog) => void dialog.accept("Stock"));
  await page.getByTestId("outliner-folder-rename").click();
  await expect(folder("Yard/Stock")).toContainText("2 actors");
  await page.getByTestId("editor-undo").click();
  await expect(folder("Yard/Goods")).toContainText("2 actors");
  await page.getByTestId("editor-redo").click();
  await folder("Yard").click({ button: "right" });
  await page.getByTestId("outliner-folder-remove").click();
  await expect(folder("Yard")).toHaveCount(0);
  await expect(folder("Stock")).toContainText("2 actors");

  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved /);
  const saved = JSON.parse(readFileSync(join(projectPath(FOLDERS), "level.json"), "utf8")) as { actors: { id: string; folder?: string; parent: string | null }[] };
  expect(saved.actors.filter((one) => one.folder !== undefined).map((one) => [one.id, one.folder])).toEqual([[LAMP, "Stock"], [CRATE, "Stock"]]);
  expect(saved.actors.find((one) => one.id === CUBE_A)!.parent).toBeNull();
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

// Forge's outliner smokes: Ctrl + Shift adds a range to the selection; a range follows the rows in
// view (a collapsed group's children are not in it); an anchor the search hides starts no range.
test("ranges: Ctrl + Shift adds one, collapsed children stay out, a hidden anchor starts none", async ({ page }) => {
  const errors = await open(page, SMALL);
  const summary = page.getByTestId("outliner-summary");
  await row(page, CRATE).click();
  await row(page, PROPS).click({ modifiers: ["Control"] });
  await row(page, CUBE_B).click({ modifiers: ["Control", "Shift"] });
  await expect(summary).toHaveText("5 actors (4 selected)");
  await expect(row(page, LAMP)).not.toHaveClass(/active/);

  await row(page, PROPS).getByTestId("outliner-expander").click();
  await row(page, PROPS).click();
  await row(page, CRATE).click({ modifiers: ["Shift"] });
  await expect(summary).toHaveText("5 actors (3 selected)");
  await row(page, PROPS).getByTestId("outliner-expander").click();
  await expect(row(page, CUBE_A)).not.toHaveClass(/active/);

  await row(page, LAMP).click();
  await page.getByTestId("outliner-search").fill("cu");
  await row(page, CUBE_B).click({ modifiers: ["Shift"] });
  await expect(summary).toHaveText("5 actors (1 selected)");
  await expect(row(page, CUBE_B)).toHaveClass(/active/);
  await page.getByTestId("outliner-search").fill("");
  expect(errors).toEqual([]);
});
