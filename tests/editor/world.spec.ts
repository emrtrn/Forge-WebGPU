// World Settings and the environment's Details (plan phase 4 step 5e;
// INV-A30, A15; Forge's `world-environment` and `wind-editor` smokes where they
// still apply): the main menu opens World Settings with the level's Cell Size
// and its one-per-level actors (select one, add a missing one); Ground Mist
// Setup as one undo step; the World Environment preview (season, hour, play)
// never dirtying the level until Make Default, and Reset. The level is
// written into this run's temporary project copy (D14).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const LEVEL = "content/levels/world-smoke";
const id = (n: number): string => `act_${n.toString(16).padStart(32, "0")}`;
const WES = id(0xa1);
const FOG = id(0xa2);
const IDENTITY = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
const webgl = process.env.FORGE_EDITOR_WEBGPU === "1" ? "" : "&forceWebGL";

test.beforeAll(() => {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) throw new Error("FORGE_EDITOR_SMOKE_PROJECT is not set (the editor smoke config sets it).");
  const folder = join(project, ...LEVEL.split("/"));
  mkdirSync(folder, { recursive: true });
  const actor = (actorId: string, name: string, components: Record<string, unknown>) => ({ id: actorId, name, class: null, parent: null, spatiallyLoaded: false, transform: IDENTITY, components });
  const actors = [
    actor(WES, "World Environment", { environment: { type: "forge.worldEnvironment@1", hour: 12 } }),
    actor(FOG, "Fog", { fog: { type: "forge.heightFog@1" } }),
  ];
  writeFileSync(join(folder, "level.json"), `${JSON.stringify({ schema: "forge.level/1", id: "lvl_0000000000000000000000000000a5a1", settings: { cellSize: 128 }, actors }, null, 2)}\n`);
});

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/?editor&level=${encodeURIComponent(LEVEL)}${webgl}`);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  await expect(page.getByTestId("forge-canvas")).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  return errors;
}

const row = (page: Page, actorId: string): Locator => page.locator(`[data-testid="outliner-row"][data-actor-id="${actorId}"]`);

test("World Settings: the level's Cell Size, its one-per-level actors, select one, add a missing one", async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId("editor-main-menu").click();
  await page.getByTestId("main-menu-world-settings").click();
  const settings = page.getByTestId("world-settings");
  await expect(settings).toBeVisible();
  await expect(page.getByTestId("world-settings-cell-size")).toHaveText("128");
  await expect(page.getByTestId("world-settings-select-forge.worldEnvironment")).toHaveText("World Environment");

  await page.getByTestId("world-settings-add-forge.skyAtmosphere").click();
  await expect(page.getByTestId("world-settings-select-forge.skyAtmosphere")).toHaveText("Sky Atmosphere");
  await expect(page.getByTestId("outliner-summary")).toHaveText("3 actors (1 selected)");

  await page.getByTestId("world-settings-select-forge.heightFog").click();
  await expect(settings).toBeHidden();
  await expect(row(page, FOG)).toHaveClass(/active/);
  await page.getByTestId("editor-main-menu").click();
  await page.getByTestId("main-menu-world-settings").click();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  expect(errors).toEqual([]);
});

test("Ground Mist Setup is one undo step", async ({ page }) => {
  const errors = await open(page);
  await row(page, FOG).click();
  const falloff = page.getByTestId("detail-fog-heightFalloff");
  const before = await falloff.inputValue();
  await page.getByTestId("fog-ground-mist").click();
  await expect(falloff).toHaveValue("0.01");
  await expect(page.getByTestId("detail-fog-sunStrength")).toHaveValue("0.25");
  await page.getByTestId("editor-undo").click();
  await expect(falloff).toHaveValue(before);
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("the World Environment preview never dirties the level; Make Default writes it in one step; Reset goes back", async ({ page }) => {
  const errors = await open(page);
  await row(page, WES).click();
  const label = page.getByTestId("wes-preview-hour-label");
  await expect(label).toHaveText("12:00");
  await expect(page.getByTestId("wes-preview-default")).toBeDisabled();

  await page.getByTestId("wes-preview-season-winter").click();
  await page.getByTestId("wes-preview-hour").evaluate((slider) => {
    (slider as HTMLInputElement).value = "18.5";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(label).toHaveText("18:30");
  await expect(page.getByTestId("wes-preview-season-winter")).toHaveClass(/\bon\b/);
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  await expect(page.getByTestId("detail-environment-hour")).toHaveValue("12");

  await page.getByTestId("wes-preview-default").click();
  await expect(page.getByTestId("detail-environment-hour")).toHaveValue("18.5");
  await expect(page.getByTestId("detail-environment-season")).toHaveValue("winter");
  await expect(page.getByTestId("wes-preview-default")).toBeDisabled();
  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("detail-environment-hour")).toHaveValue("12");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();

  await page.getByTestId("wes-preview-weather-rain").click();
  await expect(page.getByTestId("wes-preview-reset")).toBeEnabled();
  await page.getByTestId("wes-preview-reset").click();
  await expect(page.getByTestId("wes-preview-weather-clear")).toHaveClass(/\bon\b/);
  await expect(page.getByTestId("wes-preview-reset")).toBeDisabled();

  await page.getByTestId("wes-preview-play").click();
  await expect(page.getByTestId("wes-preview-play")).toHaveText("Pause");
  await expect(label).not.toHaveText("12:00");
  await page.getByTestId("wes-preview-play").click();
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  expect(errors).toEqual([]);
});
