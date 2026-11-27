// World Settings and the environment's Details (plan phase 4 step 5e;
// INV-A30, A15; Forge's `world-environment` and `wind-editor` smokes where they
// still apply): the main menu opens World Settings with the level's Cell Size
// and its one-per-level actors (select one, add a missing one); Ground Mist
// Setup as one undo step; the World Environment preview (season, hour, play)
// never dirtying the level until Make Default, and Reset; Play starts from
// Make Default (step 10). The level is
// written into this run's temporary project copy (D14).

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { row, openEditor, writeLevel, IDENTITY, projectPath } from "./support.ts";

const LEVEL = "content/levels/world-smoke";
const SNOW_LEVEL = "content/levels/world-smoke-snow";
const id = (n: number): string => `act_${n.toString(16).padStart(32, "0")}`;
const WES = id(0xa1);
const FOG = id(0xa2);

test.beforeAll(() => {
  const actor = (actorId: string, name: string, components: Record<string, unknown>) => ({ id: actorId, name, class: null, parent: null, spatiallyLoaded: false, transform: IDENTITY, components });
  const actors = [
    actor(WES, "World Environment", { environment: { type: "forge.worldEnvironment@1", hour: 12 } }),
    actor(FOG, "Fog", { fog: { type: "forge.heightFog@1" } }),
  ];
  writeLevel(LEVEL, "lvl_0000000000000000000000000000a5a1", actors);
  writeLevel(SNOW_LEVEL, "lvl_0000000000000000000000000000a5a2", [
    actor(WES, "World Environment", { environment: { type: "forge.worldEnvironment@3", hour: 12, surface: { weatherDrivesSurface: true } } }),
  ]);
});

async function open(page: Page): Promise<string[]> {
  return openEditor(page, { level: LEVEL, drawn: true });
}

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

test("View Distance is a level setting with one undo step; the fog's Fit to View Distance follows it (phase 5b)", async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId("editor-main-menu").click();
  await page.getByTestId("main-menu-world-settings").click();
  await expect(page.getByTestId("world-settings-streaming")).toBeVisible();
  const view = page.getByTestId("world-settings-viewDistance");
  await expect(view).toHaveValue("0");
  await expect(page.getByTestId("world-settings-loadRange")).toHaveValue("384");
  await view.fill("50"); // the default fog (density 0.03) is ~78 % there: a hard edge
  await view.press("Tab");
  await expect(view).toHaveValue("50");

  await page.getByTestId("world-settings-select-forge.heightFog").click();
  await expect(page.getByTestId("fog-view-opacity")).toContainText("At 50 m");
  await expect(page.getByTestId("fog-view-warning")).toBeVisible();
  await page.getByTestId("fog-fit-view").click();
  await expect(page.getByTestId("fog-view-opacity")).toContainText("98% fog");
  await expect(page.getByTestId("fog-view-warning")).toHaveCount(0);

  await page.getByTestId("editor-undo").click(); // the fit
  await expect(page.getByTestId("fog-view-warning")).toBeVisible();
  await page.getByTestId("editor-undo").click(); // the view distance
  await expect(page.getByTestId("fog-view-distance")).toContainText("World Settings > Streaming > View Distance");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
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
  // The form's groups start closed and one is open at a time; the preview leads the panel.
  const group = (name: string) => page.getByTestId(`detail-environment-section-${name}`);
  const toggle = (name: string) => group(name).locator(":scope > .detail-section-heading > .detail-section-toggle");
  await expect(toggle("surface")).toHaveAttribute("aria-expanded", "false");
  await toggle("wind").click();
  await toggle("surface").click();
  await expect(toggle("surface")).toHaveAttribute("aria-expanded", "true");
  await expect(toggle("wind")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-testid="wes-preview"] ~ [data-testid="detail-component-environment"]')).toBeVisible();
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
  for (const field of ["snowCoverage", "wetness"]) {
    await page.getByTestId(`wes-preview-${field}`).evaluate((slider) => {
      (slider as HTMLInputElement).value = ".8";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.getByRole("spinbutton", { name: field === "snowCoverage" ? "Snow Coverage" : "Wetness", exact: true })).toHaveValue("0");
  }
  await expect(page.getByTestId("editor-undo")).toBeDisabled();

  await page.getByTestId("wes-preview-default").click();
  await expect(page.getByTestId("detail-environment-hour")).toHaveValue("18.5");
  await expect(page.getByTestId("detail-environment-season")).toHaveValue("winter");
  await expect(page.getByRole("spinbutton", { name: "Snow Coverage", exact: true })).toHaveValue("0.8");
  await expect(page.getByTestId("wes-preview-default")).toBeDisabled();
  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("detail-environment-hour")).toHaveValue("12");
  await expect(page.getByRole("spinbutton", { name: "Snow Coverage", exact: true })).toHaveValue("0");
  await expect(page.getByTestId("wes-preview-snowCoverage")).toHaveValue("0");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();

  await page.getByTestId("wes-preview-weather-rain").click();
  await expect(page.getByTestId("wes-preview-reset")).toBeEnabled();
  await page.getByTestId("wes-preview-reset").click();
  await expect(page.getByTestId("wes-preview-weather-clear")).toHaveClass(/\bon\b/);
  await expect(page.getByTestId("wes-preview-reset")).toBeDisabled();

  // A timed weather change (plan phase W2): the time is the preview's, never undone; Reset ends it.
  await page.getByTestId("wes-preview-transition").fill("30");
  await page.getByTestId("wes-preview-weather-snow").click();
  await expect(page.getByTestId("wes-preview-weather-snow")).toHaveClass(/\bon\b/);
  await expect(page.getByTestId("wes-preview-transition-progress")).toHaveText(/^\d+%$/);
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  await page.getByTestId("wes-preview-reset").click();
  await expect(page.getByTestId("wes-preview-transition-progress")).toHaveText("");
  await expect(page.getByTestId("wes-preview-weather-clear")).toHaveClass(/\bon\b/);

  await page.getByTestId("wes-preview-play").click();
  await expect(page.getByTestId("wes-preview-play")).toHaveText("Pause");
  await expect(label).not.toHaveText("12:00");
  await page.getByTestId("wes-preview-play").click();
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  expect(errors).toEqual([]);
});

// Forge's world-environment smoke ended with Play starting from Make Default: the unsaved hour
// and season reach the Play tab's World Environment (read through the dev hook, one stepped frame).
test("Play starts from the World Environment's Make Default, unsaved", async ({ page, context }) => {
  const errors = await open(page);
  await row(page, WES).click();
  await page.getByTestId("wes-preview-season-winter").click();
  await page.getByTestId("wes-preview-hour").evaluate((slider) => {
    (slider as HTMLInputElement).value = "18.5";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByTestId("wes-preview-default").click();
  await expect(page.getByTestId("detail-environment-hour")).toHaveValue("18.5");
  await expect(page.getByTestId("editor-save")).toBeEnabled();

  const opened = context.waitForEvent("page");
  await page.getByTestId("editor-play").click();
  const game = await opened;
  game.on("pageerror", (error) => errors.push(`game: ${error.message}`));
  await game.waitForURL(/[?&]play=/);
  await expect(game.getByTestId("forge-canvas")).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  const hour = await game.evaluate(async () => {
    const dev = (window as unknown as { __forgeDev: { pause(): void; resume(): void; step(ms: number): Promise<{ hour: number | null }> } }).__forgeDev;
    dev.pause();
    const frame = await dev.step(16);
    dev.resume();
    return frame.hour;
  });
  expect(hour).toBe(18.5);
  await game.close();
  expect(errors).toEqual([]);
});

test("cover preview stays out of level bytes and Play state", async ({ page, context }) => {
  const errors = await open(page);
  const path = projectPath(`${LEVEL}/level.json`);
  const before = readFileSync(path, "utf8");
  await row(page, WES).click();
  for (const field of ["snowCoverage", "wetness"]) {
    await page.getByTestId(`wes-preview-${field}`).evaluate((slider) => {
      (slider as HTMLInputElement).value = ".9";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  // A running weather change is preview state too.
  await page.getByTestId("wes-preview-transition").fill("60");
  await page.getByTestId("wes-preview-weather-rain").click();
  await expect(page.getByTestId("wes-preview-transition-progress")).toHaveText(/^\d+%$/);
  // Plan phase W5: Simulate runs 20 minutes ahead in a few seconds (the weather change ends), shown, never saved.
  await expect(page.getByTestId("wes-preview-surface")).toHaveText(/^wet 0\.90 · water 0\.00 · snow 0\.90 · 0\.0 cm$/);
  await page.getByTestId("wes-preview-simulate").click();
  await expect(page.getByTestId("wes-preview-simulate")).toHaveText("Stop");
  await expect(page.getByTestId("wes-preview-transition-progress")).toHaveText("", { timeout: 15_000 });
  await expect(page.getByTestId("wes-preview-simulate")).toHaveText("Run", { timeout: 15_000 });
  await expect(page.getByTestId("editor-save")).toBeDisabled();
  await page.keyboard.press("Control+s");
  expect(readFileSync(path, "utf8")).toBe(before);
  const opened = context.waitForEvent("page");
  await page.getByTestId("editor-play").click();
  const game = await opened;
  await expect(game.getByTestId("forge-canvas")).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  const state = await game.evaluate(() => (window as unknown as { __forgeDev: { environmentState(): { surface: unknown; weather: unknown } } }).__forgeDev.environmentState());
  expect(state.surface).toEqual({ snowCoverage: 0, wetness: 0, puddleFill: 0, snowDepth: 0 });
  expect(state.weather).toEqual({ preset: "clear", intensity: 1 });
  expect(state).not.toHaveProperty("weatherProgress");
  expect(readFileSync(path, "utf8")).toBe(before);
  await game.close();
  expect(errors).toEqual([]);
});

test("W7 snow depth from Simulate stays in the editor preview", async ({ page, context }) => {
  const errors = await openEditor(page, { level: SNOW_LEVEL, drawn: true });
  const path = projectPath(`${SNOW_LEVEL}/level.json`);
  const authored = readFileSync(path, "utf8");
  await row(page, WES).click();
  await page.getByTestId("wes-preview-weather-snow").click();
  await page.getByTestId("wes-preview-simulate").click();
  await expect(page.getByTestId("wes-preview-surface")).toContainText("40.0 cm", { timeout: 15_000 });
  await expect(page.getByTestId("wes-preview-simulate")).toHaveText("Run", { timeout: 15_000 });
  await expect(page.getByTestId("editor-save")).toBeDisabled();
  expect(readFileSync(path, "utf8")).toBe(authored);
  const opened = context.waitForEvent("page");
  await page.getByTestId("editor-play").click();
  const game = await opened;
  await expect(game.getByTestId("forge-canvas")).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  const depth = await game.evaluate(() => (window as unknown as { __forgeDev: { environmentState(): { surface: { snowDepth: number } } } }).__forgeDev.environmentState().surface.snowDepth);
  expect(depth).toBe(0);
  await game.close();
  await page.getByTestId("wes-preview-reset").click();
  await expect(page.getByTestId("wes-preview-surface")).toContainText("0.0 cm");
  expect(readFileSync(path, "utf8")).toBe(authored);
  expect(errors).toEqual([]);
});
