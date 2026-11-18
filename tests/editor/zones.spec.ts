// Zones in the editor (plan 5c R9b Z5): a Zone Volume and a Portal from Add
// Actor's Volumes (their Details from the schema), and World Settings'
// Generate Zones on two rooms of the synthetic interior: two zones and the
// door's portal in one undo step. The level is written into this run's
// temporary project copy (D14).

import { expect, test, type Page } from "@playwright/test";
import { indoorScene } from "../../tools/scenes/indoorScene.ts";
import { named, openEditor, writeLevel } from "./support.ts";

const LEVEL = "content/levels/zones-smoke";

test.beforeAll(() => {
  const rooms = indoorScene({ roomsX: 2, roomsZ: 1, propsPerRoom: 2 });
  writeLevel(LEVEL, "lvl_0000000000000000000000000000a0e1", rooms.actors);
});

async function category(page: Page, label: string): Promise<void> {
  await page.getByTestId("add-actor-button").hover();
  await page.locator(".add-actor-category-label", { hasText: label }).hover();
}

test("a Zone Volume and a Portal from Volumes: placed on the surface, Details from the schema", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await category(page, "Volumes");
  await page.locator('[data-add-key="forge.zone"]').first().click();
  await expect(named(page, "Zone Volume")).toHaveClass(/active/);
  const zone = page.getByTestId("detail-component-zone");
  await expect(zone).toContainText("Size (m)");
  await expect(zone).toContainText("Always Cast Shadows");
  await category(page, "Volumes");
  await page.locator('[data-add-key="forge.portal"]').first().click();
  await expect(named(page, "Portal")).toHaveClass(/active/);
  await expect(page.getByTestId("detail-component-portal")).toContainText("Zone A");
  await page.getByTestId("editor-undo").click();
  await page.getByTestId("editor-undo").click();
  await expect(named(page, "Zone Volume")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Generate Zones: two rooms and their door in one undo step", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await page.getByTestId("editor-main-menu").click();
  await page.getByTestId("main-menu-world-settings").click();
  await page.getByTestId("world-settings-generate-zones").click();
  const status = page.getByTestId("world-settings-zones-status");
  await expect(status).toHaveAttribute("data-zones", "2");
  await expect(status).toHaveAttribute("data-portals", "1");
  await page.getByTestId("world-settings-close").click();
  await expect(named(page, "Zone 1")).toHaveCount(1);
  await expect(named(page, "Zone 2")).toHaveCount(1);
  await expect(named(page, "Portal 1")).toHaveCount(1);
  await page.getByTestId("editor-undo").click();
  await expect(named(page, "Zone 1")).toHaveCount(0);
  await expect(named(page, "Portal 1")).toHaveCount(0);
  expect(errors).toEqual([]);
});
