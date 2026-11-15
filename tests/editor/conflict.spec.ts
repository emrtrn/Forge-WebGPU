// The level's 409 flow (plan phase 4 step 8): the level file changes on disk
// while the editor has unsaved edits (as an agent's command would change it);
// the strip opens as soon as the dev server tells the editor (step 9f), and
// Save is refused with it (409); the strip offers Compare / Reload. Compare merges
// disjoint changes by itself and asks for the rest (Mine / Theirs); Apply
// keeps this session's changes unsaved over the disk's level and the next
// Save writes both. Reload drops the session's changes. On a two-cube level
// of this run's temporary project copy (never samples/, D14).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { shape, openEditor, writeLevel, SAVE_CONFLICT } from "./support.ts";

const LEVEL = "content/levels/conflict-smoke";
const A = "act_aaaa2222333344445555666677778888";
const B = "act_bbbb2222333344445555666677778888";
let file = "";

interface ActorJson {
  id: string;
  name: string;
  transform: { p: number[] };
}
interface LevelJson {
  actors: ActorJson[];
}

const cube = (id: string, name: string, x: number) => ({
  id,
  name,
  class: null,
  parent: null,
  spatiallyLoaded: false,
  transform: { p: [x, 1, 0], r: [0, 0, 0, 1], s: [2, 2, 2] },
  components: {
    shape: shape("cube", "#c8c8c8"),
  },
});

test.beforeEach(() => {
  const actors = [cube(A, "Cube A", 0), cube(B, "Cube B", 4)];
  file = join(writeLevel(LEVEL, "lvl_cccc2222333344445555666677778888", actors), "level.json");
});

const readLevel = (): LevelJson => JSON.parse(readFileSync(file, "utf8")) as LevelJson;
/** What an agent's command does meanwhile: the level file changes on disk. */
function changeOnDisk(change: (level: LevelJson) => void): void {
  const level = readLevel();
  change(level);
  writeFileSync(file, `${JSON.stringify(level, null, 2)}\n`);
}
const actorOf = (level: LevelJson, id: string): ActorJson => level.actors.find((actor) => actor.id === id)!;

async function open(page: Page): Promise<string[]> {
  // Every test here makes the disk refuse a save on purpose.
  return openEditor(page, { level: LEVEL, allow: [SAVE_CONFLICT] });
}

async function moveA(page: Page, x: number): Promise<void> {
  await page.locator(`[data-testid="outliner-row"][data-actor-id="${A}"]`).click();
  const field = page.getByTestId("detail-transform.p[0]");
  await field.fill(String(x));
  await field.press("Tab");
  await expect(page.getByTestId("editor-save")).toBeEnabled();
}

async function saveRefused(page: Page): Promise<void> {
  // The dev server tells the editor at once (step 9f): with unsaved changes, the strip opens before any Save.
  await expect(page.getByTestId("level-conflict-text")).toContainText("while you have unsaved changes", { timeout: 15_000 });
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("level-conflict")).toBeVisible();
  await expect(page.getByTestId("level-conflict-text")).toContainText("Changed on disk since it was read (level.json)");
}

test("Compare merges disjoint changes by itself; the next Save writes both", async ({ page }) => {
  const errors = await open(page);
  await moveA(page, 5);
  changeOnDisk((level) => (actorOf(level, B).name = "Renamed on disk"));
  await saveRefused(page);

  await page.getByTestId("level-conflict-compare").click();
  await expect(page.getByTestId("level-compare-summary")).toContainText("1 of your change kept · 1 from disk taken · 0 conflicts");
  await expect(page.getByTestId("level-compare-row")).toHaveCount(0);
  await page.getByTestId("level-compare-apply").click();
  await expect(page.getByTestId("level-compare")).toHaveCount(0);
  await expect(page.getByTestId("level-conflict")).toBeHidden();
  await expect(page.locator(`[data-testid="outliner-row"][data-actor-id="${B}"]`)).toContainText("Renamed on disk");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();

  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
  const saved = readLevel();
  expect(actorOf(saved, A).transform.p[0]).toBe(5);
  expect(actorOf(saved, B).name).toBe("Renamed on disk");
  expect(errors).toEqual([]);
});

test("a conflict asks Mine / Theirs; Theirs takes the disk's value and leaves nothing to save", async ({ page }) => {
  const errors = await open(page);
  await moveA(page, 7);
  changeOnDisk((level) => (actorOf(level, A).transform.p = [9, 1, 0]));
  await saveRefused(page);

  await page.getByTestId("level-conflict-compare").click();
  const row = page.getByTestId("level-compare-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Cube A");
  await expect(row).toContainText("transform.p");
  await expect(row).toContainText("[7,1,0]");
  await expect(row).toContainText("[9,1,0]");
  await expect(row.getByTestId("level-compare-mine")).toHaveClass(/active/);
  await row.getByTestId("level-compare-theirs").click();
  await expect(row.getByTestId("level-compare-theirs")).toHaveClass(/active/);
  await page.getByTestId("level-compare-apply").click();
  await expect(page.getByTestId("editor-status")).toHaveText("Merged with the disk; nothing left to save");
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("9");
  await expect(page.getByTestId("editor-save")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("Reload drops the editor's changes and reads the disk's level", async ({ page }) => {
  const errors = await open(page);
  await moveA(page, 3);
  changeOnDisk((level) => (actorOf(level, B).transform.p = [6, 1, 0]));
  await saveRefused(page);

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("level-conflict-reload").click();
  await expect(page.getByTestId("level-conflict")).toBeHidden();
  await expect(page.getByTestId("editor-status")).toHaveText("Reloaded the level from disk (undo history cleared)");
  await expect(page.getByTestId("editor-save")).toBeDisabled();
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  await page.locator(`[data-testid="outliner-row"][data-actor-id="${A}"]`).click();
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("0");
  await page.locator(`[data-testid="outliner-row"][data-actor-id="${B}"]`).click();
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("6");
  expect(errors).toEqual([]);
});
