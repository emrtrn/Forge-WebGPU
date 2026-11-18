// Forge's `editor-authoring` smoke, in full (plan phase 4 step 10, the
// phase's gate): on an empty level, the four tool buttons, an Add Actor cube
// dragged into the viewport, a Move gizmo drag, Location X typed in Details,
// undo back past the placement and redo, Save (busy until its response: a
// Ctrl+S meanwhile starts no second save), the file on disk, a reload that
// finds the actor with its id and X, and Play in a new tab running it. Both
// tabs end without an error. CI runs it with WebGL forced; `npm run
// smoke:editor:webgpu` on the real GPU.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { BACKEND, dragHandle, named, openEditor, row, watchErrors, writeLevel } from "./support.ts";

const LEVEL = "content/levels/authoring-smoke";
const TOOLS = ["select", "move", "rotate", "scale"] as const;
let folder = "";

test.beforeAll(() => {
  folder = writeLevel(LEVEL, "lvl_a07401a07401a07401a07401a07401a0", []);
});

interface ActorJson {
  readonly id: string;
  readonly transform?: { readonly p?: readonly number[] };
}

/** Every actor the level's files hold on disk: `level.json` and its cells (a placed cube is spatially loaded). */
const disk = (): ActorJson[] => {
  const read = (path: string): ActorJson[] => (JSON.parse(readFileSync(path, "utf8")) as { actors?: ActorJson[] }).actors ?? [];
  const cells = join(folder, "cells");
  return [read(join(folder, "level.json")), ...(existsSync(cells) ? readdirSync(cells).map((file) => read(join(cells, file))) : [])].flat();
};

/** Drags the Add Actor menu's cube into the viewport (the browser's drag as events, as Forge's smoke). */
async function placeCube(page: Page): Promise<void> {
  const canvas = page.getByTestId("forge-canvas");
  const box = (await canvas.boundingBox())!;
  await page.getByTestId("add-actor-button").hover();
  await page.locator(".add-actor-category-label", { hasText: "Shapes" }).hover();
  const cube = page.getByTestId("add-shape-cube");
  await expect(cube).toBeVisible();
  const data = await page.evaluateHandle(() => new DataTransfer());
  const at = { clientX: box.x + box.width / 2 - 80, clientY: box.y + box.height / 2 + 40 };
  await cube.dispatchEvent("dragstart", { dataTransfer: data });
  await canvas.dispatchEvent("dragover", { dataTransfer: data, ...at });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await canvas.dispatchEvent("dragover", { dataTransfer: data, ...at });
  await canvas.dispatchEvent("drop", { dataTransfer: data, ...at });
  await cube.dispatchEvent("dragend", { dataTransfer: data });
}

test("Forge's editor-authoring: place, gizmo tools, Details X, undo / redo, save, reopen, Play", async ({ page, context }) => {
  test.slow(); // ~100 s in CI (software WebGL); a slower runner passed 120 s.
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  const summary = page.getByTestId("outliner-summary");
  const undo = page.getByTestId("editor-undo");
  const redo = page.getByTestId("editor-redo");
  const save = page.getByTestId("editor-save");
  const status = page.getByTestId("editor-status");
  await expect(summary).toHaveText("0 actors (0 selected)");
  await expect(undo).toBeDisabled();
  await expect(save).toBeDisabled();

  // The tool buttons: one pressed at a time.
  for (const tool of TOOLS) {
    await page.getByTestId(`tool-${tool}`).click();
    for (const other of TOOLS) await expect(page.getByTestId(`tool-${other}`)).toHaveAttribute("aria-pressed", String(other === tool));
  }
  await page.getByTestId("tool-move").click();

  // Place: one actor, selected, its transform in Details.
  await placeCube(page);
  const cube = named(page, "Cube");
  await expect(cube).toHaveClass(/active/);
  await expect(summary).toHaveText("1 actors (1 selected)");
  const id = (await cube.getAttribute("data-actor-id"))!;
  expect(id).toMatch(/^act_[0-9a-f]{32}$/);
  const x = page.getByTestId("detail-transform.p[0]");
  const placed = await x.inputValue();

  // The Move gizmo drags it along X (one undo step).
  const canvas = page.getByTestId("forge-canvas");
  await dragHandle(page, canvas, "move:x", 240);
  await expect(x).not.toHaveValue(placed);
  const dragged = await x.inputValue();

  // Location X typed in Details.
  await x.fill("2");
  await x.press("Tab");
  await expect(x).toHaveValue("2");

  // Undo back past the placement, then redo all of it.
  await undo.click();
  await expect(x).toHaveValue(dragged);
  await undo.click();
  await expect(x).toHaveValue(placed);
  await undo.click();
  await expect(summary).toHaveText("0 actors (0 selected)");
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect(summary).toHaveText(/^1 actors/);
  await row(page, id).click();
  await redo.click();
  await redo.click();
  await expect(x).toHaveValue("2");
  await expect(redo).toBeDisabled();

  // Save stays busy until its response: a Ctrl+S meanwhile starts no second save.
  let saves = 0;
  let release = (): void => {};
  const held = new Promise<void>((done) => (release = done));
  await page.route("**/__forge/save", async (route) => {
    saves += 1;
    await held;
    await route.continue();
  });
  await save.click();
  await expect(status).toHaveText("Saving");
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("aria-busy", "true");
  await page.locator("body").press("Control+s");
  await expect(save).toBeDisabled();
  await expect(status).toHaveText("Saving");
  expect(saves).toBe(1);
  release();
  await expect(status).toHaveText(/^Saved \d+ files?$/);
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("aria-busy", "false");
  expect(saves).toBe(1);
  await page.unrouteAll();
  expect(disk().find((actor) => actor.id === id)?.transform?.p?.[0]).toBe(2);

  // Reopen: the same actor, same id, same X.
  const reopened = await openEditor(page, { level: LEVEL, drawn: true });
  await expect(summary).toHaveText("1 actors (0 selected)");
  await row(page, id).click();
  await expect(page.getByTestId("detail-transform.p[0]")).toHaveValue("2");

  // Play: a new tab runs the level with the actor where the editor left it.
  const opened = context.waitForEvent("page");
  await page.getByTestId("editor-play").click();
  const game = await opened;
  const gameErrors = watchErrors(game);
  await game.waitForURL(/[?&]play=/);
  const gameCanvas = game.getByTestId("forge-canvas");
  await expect(gameCanvas).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  await expect(gameCanvas).toHaveAttribute("data-forge-backend", BACKEND);
  await game.waitForFunction(
    (actor) => (window as unknown as { __forgeDev?: { actor(id: string): { transform: { p: number[] } } | null } }).__forgeDev?.actor(actor)?.transform.p[0] === 2,
    id,
    { timeout: 60_000 },
  );
  await game.close();

  expect(errors).toEqual([]);
  expect(reopened).toEqual([]);
  expect(gameErrors).toEqual([]);
});
