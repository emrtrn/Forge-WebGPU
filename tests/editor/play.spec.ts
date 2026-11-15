// Play (plan phase 4 step 8; decision 8, architecture A6): on a one-cube
// level of this run's temporary project copy (never samples/, D14), an edit
// that is not saved plays in a new game tab (the button and P), the project's
// files stay as they were, the game tab plays the same state after a reload,
// a later Play replaces the session, and a session the server does not hold
// shows the information screen. The game tab's world is read through the
// dev-only `window.__forgeDev.actor`.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const LEVEL = "content/levels/play-smoke";
const CUBE = "act_11112222333344445555666677778888";
const WEBGPU = process.env.FORGE_EDITOR_WEBGPU === "1";
const query = (): string => `/?editor&level=${encodeURIComponent(LEVEL)}${WEBGPU ? "" : "&forceWebGL"}`;
let folder = "";

test.beforeAll(() => {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) throw new Error("FORGE_EDITOR_SMOKE_PROJECT is not set (the editor smoke config sets it).");
  folder = join(project, ...LEVEL.split("/"));
  mkdirSync(folder, { recursive: true });
  const identity = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
  const level = {
    schema: "forge.level/1",
    id: "lvl_11112222333344445555666677778888",
    settings: { cellSize: 128 },
    actors: [
      {
        id: CUBE,
        name: "Play Cube",
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

/** The level folder's files and their text. */
function disk(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else out[`${prefix}${entry.name}`] = readFileSync(join(dir, entry.name), "utf8");
    }
  };
  walk(folder, "");
  return out;
}

async function setX(page: Page, value: number): Promise<void> {
  const x = page.getByTestId("detail-transform.p[0]");
  await x.fill(String(value));
  await x.press("Tab");
  await expect(page.getByTestId("editor-save")).toBeEnabled();
}

/** Waits until the game tab's world has the cube at `x`. */
async function cubeAt(game: Page, x: number): Promise<void> {
  await game.waitForFunction(
    ([id, want]) => {
      const dev = (window as unknown as { __forgeDev?: { actor(id: string): { transform: { p: number[] } } | null } }).__forgeDev;
      return dev?.actor(id as string)?.transform.p[0] === want;
    },
    [CUBE, x] as const,
    { timeout: 60_000 },
  );
}

test("Play opens the unsaved level in a new tab; nothing is saved; a reload and P play the latest", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(query());
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  const before = disk();

  await page.locator(`[data-testid="outliner-row"][data-actor-id="${CUBE}"]`).click();
  await setX(page, 5);
  const opened = context.waitForEvent("page");
  await page.getByTestId("editor-play").click();
  const game = await opened;
  await game.waitForURL(/[?&]play=/);
  game.on("pageerror", (error) => errors.push(`game: ${error.message}`));
  await expect(page.getByTestId("editor-status")).toHaveText("Playing the unsaved level in a new tab (nothing was saved)");
  expect(new URL(game.url()).searchParams.get("play")).toMatch(/^[0-9a-f]{32}$/);
  expect(new URL(game.url()).searchParams.has("forceWebGL")).toBe(!WEBGPU);
  await cubeAt(game, 5);
  // Play is not a save: the level's files are as they were and the editor still has the edit unsaved.
  expect(disk()).toEqual(before);
  await expect(page.getByTestId("editor-save")).toBeEnabled();

  // The game tab plays the same session after a reload.
  await game.reload();
  await cubeAt(game, 5);

  // Another edit and P: a new tab plays it; the first tab plays it after a reload (one session per editor tab).
  await setX(page, 7);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const second = context.waitForEvent("page");
  await page.keyboard.press("KeyP");
  const again = await second;
  await again.waitForURL(/[?&]play=/);
  expect(new URL(again.url()).searchParams.get("play")).toBe(new URL(game.url()).searchParams.get("play"));
  await cubeAt(again, 7);
  await game.reload();
  await cubeAt(game, 7);
  expect(disk()).toEqual(before);
  await again.close();
  await game.close();
  expect(errors).toEqual([]);
});

test("a play session the server does not hold shows the information screen", async ({ page }) => {
  await page.goto(`/?play=${"0".repeat(32)}${WEBGPU ? "" : "&forceWebGL"}`);
  await expect(page.getByText("Play session ended")).toBeVisible();
});
