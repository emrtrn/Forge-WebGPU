// The editor's first authoring path (plan phase 4 step 2): open the project's
// start level, select an actor, change its transform in Details, undo / redo,
// save, reopen and find the change on disk. The full Forge `editor-authoring`
// counterpart (place, gizmo tools, Play) grows with the later steps.

import { expect, test, type Page } from "@playwright/test";

const QUERY = process.env.FORGE_EDITOR_WEBGPU === "1" ? "/?editor" : "/?editor&forceWebGL";

async function openEditor(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(QUERY);
  const shell = page.getByTestId("forge-editor");
  await expect(shell).toBeVisible();
  await expect(shell).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  return errors;
}

test("open, edit a transform, undo / redo, save, reopen", async ({ page }) => {
  const errors = await openEditor(page);
  const rows = page.getByTestId("outliner-row");
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  await expect(page.getByTestId("editor-save")).toBeDisabled();

  const first = rows.first();
  const actor = await first.getAttribute("data-actor-id");
  await first.click();
  await expect(first).toHaveClass(/active/);
  const x = page.getByTestId("detail-transform.p[0]");
  await expect(x).toBeVisible();
  const original = await x.inputValue();
  const next = String(Number(original) + 2);

  await x.fill(next);
  await x.press("Tab");
  await expect(page.getByTestId("editor-undo")).toBeEnabled();
  await expect(page.getByTestId("editor-save")).toBeEnabled();

  await page.getByTestId("editor-undo").click();
  await expect(x).toHaveValue(original);
  await page.getByTestId("editor-redo").click();
  await expect(x).toHaveValue(next);

  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
  await expect(page.getByTestId("editor-save")).toBeDisabled();

  await openEditor(page);
  await expect(page.getByTestId("outliner-row")).toHaveCount(count);
  await page.locator(`[data-testid="outliner-row"][data-actor-id="${actor}"]`).click();
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue(next);
  expect(errors).toEqual([]);
});
