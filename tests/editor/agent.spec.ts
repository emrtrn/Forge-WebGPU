// The agent's edit commands and the editor (plan phase 4 step 9g; A12,
// phase 4 decisions 4 and 5).
//
// - Acceptance of A12: the same change made in the editor (Details, Delete,
//   Add Actor, Save) and made by `npm run forge -- edit` on a copy of the same
//   project writes the same canonical files, byte for byte (an added actor's
//   GUID aside).
// - Live refresh: a command that changes the open level while the editor
//   has no unsaved changes shows up by itself (no page reload, undo history
//   cleared); with unsaved changes, the 409 strip opens (Compare / Reload);
//   the editor's own save is not mistaken for someone else's.
//
// On a three-cube level of this run's temporary project copy (never samples/, D14).

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { shape, smokeProject, row, openEditor, writeLevel, projectPath } from "./support.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LEVEL = "content/levels/agent-smoke";
const A = "act_aaaa9999333344445555666677778888";
const B = "act_bbbb9999333344445555666677778888";
const C = "act_cccc9999333344445555666677778888";

const cube = (id: string, name: string, x: number) => ({
  id,
  name,
  class: null,
  parent: null,
  spatiallyLoaded: true,
  transform: { p: [x, 1, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
  components: {
    shape: shape("cube", "#c8c8c8"),
  },
});

let project = "";

test.beforeEach(() => {
  project = smokeProject();
  const folder = projectPath(LEVEL);
  rmSync(folder, { recursive: true, force: true });
  const actors = [cube(A, "Cube A", 0), cube(B, "Cube B", 4), cube(C, "Cube C", 8)];
  writeLevel(LEVEL, "lvl_aaaa9999333344445555666677770000", actors);
});

/** `npm run forge -- edit` on a project, as an agent runs it. */
function forgeEdit(root: string, args: readonly string[], stdin?: string): string {
  const result = spawnSync(process.execPath, ["tools/forge.ts", "edit", "--project", root, "--level", LEVEL, ...args], { cwd: REPO_ROOT, encoding: "utf8", ...(stdin === undefined ? {} : { input: stdin }) });
  if (result.status !== 0) throw new Error(`forge edit failed (${result.status}): ${result.stderr}${result.stdout}`);
  return result.stdout;
}

/** The level folder's files, by path inside it. */
function levelFiles(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), path);
      else out[path] = readFileSync(join(dir, entry.name), "utf8");
    }
  };
  walk(join(root, ...LEVEL.split("/")), "");
  return out;
}

async function open(page: Page): Promise<string[]> {
  return openEditor(page, { level: LEVEL });
}

async function setField(page: Page, testId: string, value: string): Promise<void> {
  const field = page.getByTestId(testId);
  await field.fill(value);
  await field.press("Tab");
}

async function save(page: Page): Promise<void> {
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
}

test("A12: the same change from the editor and from forge edit writes the same files", async ({ page }) => {
  const copy = join(mkdtempSync(join(tmpdir(), "forge-agent-smoke-")), "project");
  cpSync(project, copy, { recursive: true });
  try {
    const errors = await open(page);
    // Details' X, a component field, Delete; then Save.
    await row(page, A).click();
    await setField(page, "detail-transform.p[0]", "3");
    await row(page, B).click();
    await page.getByTestId("detail-shape-primitive").selectOption("sphere");
    await row(page, C).click();
    await page.locator("body").press("Delete");
    await expect(row(page, C)).toHaveCount(0);
    await save(page);
    forgeEdit(copy, ["-"], [`move ${A} --to 3,1,0`, `set ${B} shape.primitive=sphere`, `delete ${C}`].join("\n"));
    const edited = levelFiles(project);
    expect(Object.keys(edited).sort()).toEqual(["cells.json", "cells/0_0.json", "level.json"]);
    expect(levelFiles(copy)).toEqual(edited);

    // Add Actor's Empty Actor, placed by Details at 2, 0, 4; the command adds it there.
    await page.getByTestId("add-actor-button").hover();
    await page.getByTestId("add-actor-search").fill("empty");
    await page.getByTestId("add-actor-search").press("Enter");
    await expect(page.getByTestId("detail-name")).toHaveValue("Empty Actor");
    for (const [axis, value] of [["0", "2"], ["1", "0"], ["2", "4"]] as const) await setField(page, `detail-transform.p[${axis}]`, value);
    await save(page);
    const out = forgeEdit(copy, ["add", "--at", "2,0,4"]);
    expect(out).toMatch(/^added act_[0-9a-f]{32} "Empty Actor" empty @ 2,0,4\n/);
    const cell = (root: string) => JSON.parse(levelFiles(root)["cells/0_0.json"]!) as { actors: { id: string; name: string }[] };
    const strip = (actors: { id: string; name: string }[]) => actors.map((actor) => (actor.name === "Empty Actor" ? { ...actor, id: "<new>" } : actor));
    expect(strip(cell(copy).actors)).toEqual(strip(cell(project).actors));
    expect(levelFiles(copy)["level.json"]).toBe(levelFiles(project)["level.json"]);
    expect(errors).toEqual([]);
  } finally {
    rmSync(dirname(copy), { recursive: true, force: true });
  }
});

test("a clean level follows a command by itself: no reload of the page, the undo history cleared", async ({ page }) => {
  const errors = await open(page);
  await row(page, A).click();
  await setField(page, "detail-transform.p[0]", "1");
  await save(page);
  await expect(page.getByTestId("editor-undo")).toBeEnabled();
  await page.evaluate(() => ((window as unknown as { __agentSmoke: number }).__agentSmoke = 1));

  forgeEdit(project, ["move", A, "--to", "6,1,0"]);
  await expect(page.getByTestId("editor-status")).toContainText("Level updated from disk", { timeout: 15_000 });
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("6");
  await expect(page.getByTestId("level-conflict")).toBeHidden();
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  await expect(page.getByTestId("editor-save")).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { __agentSmoke?: number }).__agentSmoke)).toBe(1);

  forgeEdit(project, ["delete", B]);
  await expect(row(page, B)).toHaveCount(0, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("a dirty level shows the strip when a command changes it; Compare merges both", async ({ page }) => {
  const errors = await open(page);
  await row(page, A).click();
  await setField(page, "detail-transform.p[0]", "5");
  await expect(page.getByTestId("editor-save")).toBeEnabled();

  forgeEdit(project, ["set", B, "actor.name=Renamed by agent"]);
  await expect(page.getByTestId("level-conflict")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("level-conflict-text")).toContainText("while you have unsaved changes");
  await expect(row(page, B)).toContainText("Cube B");

  await page.getByTestId("level-conflict-compare").click();
  await expect(page.getByTestId("level-compare-summary")).toContainText("1 of your change kept · 1 from disk taken · 0 conflicts");
  await page.getByTestId("level-compare-apply").click();
  await expect(row(page, B)).toContainText("Renamed by agent");
  await save(page);
  const saved = JSON.parse(levelFiles(project)["cells/0_0.json"]!) as { actors: { id: string; name: string; transform: { p: number[] } }[] };
  expect(saved.actors.find((actor) => actor.id === A)!.transform.p[0]).toBe(5);
  expect(saved.actors.find((actor) => actor.id === B)!.name).toBe("Renamed by agent");
  expect(errors).toEqual([]);
});

test("the editor's own save is not someone else's change", async ({ page }) => {
  const errors = await open(page);
  await row(page, A).click();
  await setField(page, "detail-transform.p[0]", "2");
  await save(page);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
  await expect(page.getByTestId("level-conflict")).toBeHidden();
  await expect(page.getByTestId("editor-undo")).toBeEnabled();
  expect(errors).toEqual([]);
});
