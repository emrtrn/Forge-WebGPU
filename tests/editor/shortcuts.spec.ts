// Keyboard shortcuts and the Outliner's row menu (plan phase 4 step 5f;
// INV-A31, A08; Forge's `EditorUi.handleKeyDown` table and
// `openOutlinerContextMenu`): Ctrl + A, Escape, H / Shift + H, the tool keys,
// Space, X, the view keys, keys staying out of a text field; and the row
// menu's Duplicate, Rename, Group Selected, Ungroup, Parent to active,
// Unparent, Go To and Delete. The level is written into this run's temporary
// project copy (D14).

import { expect, test, type Page } from "@playwright/test";
import { shape, row, named, openEditor, writeLevel } from "./support.ts";

const LEVEL = "content/levels/shortcuts-smoke";
const id = (n: number): string => `act_${n.toString(16).padStart(32, "0")}`;
const A = id(0xc1);
const B = id(0xc2);
const C = id(0xc3);

test.beforeAll(() => {
  const cube = (actorId: string, name: string, x: number) => ({
    id: actorId,
    name,
    class: null,
    parent: null,
    spatiallyLoaded: false,
    transform: { p: [x, 1, 0], r: [0, 0, 0, 1], s: [2, 2, 2] },
    components: { shape: shape("cube", "#c8c8c8") },
  });
  const actors = [cube(A, "Cube A", 0), cube(B, "Cube B", 4), cube(C, "Cube C", -4)];
  writeLevel(LEVEL, "lvl_0000000000000000000000000000c5c1", actors);
});

async function open(page: Page): Promise<string[]> {
  return openEditor(page, { level: LEVEL, drawn: true });
}

const summary = (page: Page) => page.getByTestId("outliner-summary");
const press = (page: Page, keys: string) => page.locator("body").press(keys);
const menu = async (page: Page, actorId: string, item: string): Promise<void> => {
  await row(page, actorId).click({ button: "right" });
  await page.getByTestId(`outliner-menu-${item}`).click();
};

test("Forge's keys: Ctrl + A, Escape, H / Shift + H, the tools, Space, X, the views; none while typing in a field", async ({ page }) => {
  const errors = await open(page);
  await press(page, "Control+KeyA");
  await expect(summary(page)).toHaveText("3 actors (3 selected)");
  await press(page, "Escape");
  await expect(summary(page)).toHaveText("3 actors (0 selected)");

  await row(page, A).click();
  await press(page, "KeyH");
  await expect(row(page, A)).toHaveClass(/is-hidden/);
  await expect(summary(page)).toHaveText("3 actors (0 selected)");
  await press(page, "Control+KeyA");
  await expect(summary(page)).toHaveText("3 actors (2 selected)");
  await press(page, "Shift+KeyH");
  await expect(row(page, A)).not.toHaveClass(/is-hidden/);

  for (const [key, tool] of [["KeyQ", "select"], ["KeyE", "rotate"], ["KeyR", "scale"], ["KeyW", "move"]] as const) {
    await press(page, key);
    await expect(page.getByTestId(`tool-${tool}`)).toHaveAttribute("aria-pressed", "true");
  }
  await press(page, "Space");
  await expect(page.getByTestId("tool-rotate")).toHaveAttribute("aria-pressed", "true");
  await press(page, "KeyX");
  await expect(page.getByTestId("transform-space")).toHaveClass(/active/);
  await press(page, "KeyX");
  await press(page, "Digit1");
  await expect(page.getByTestId("camera-button")).toHaveText("Top");
  await press(page, "Digit4");
  await expect(page.getByTestId("camera-button")).toHaveText("Perspective");

  // Typing in the Outliner's search keeps the keys: W is a letter there, not the Move tool.
  await page.getByTestId("outliner-search").fill("");
  await page.getByTestId("outliner-search").press("KeyQ");
  await expect(page.getByTestId("tool-rotate")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("outliner-search")).toHaveValue("q");
  expect(errors).toEqual([]);
});

test("the Outliner's row menu: Duplicate, Rename, Group, Ungroup, Parent to active, Unparent, Go To, Delete", async ({ page }) => {
  test.slow(); // ~100 s in CI (software WebGL); a slower runner passed 120 s.
  const errors = await open(page);
  await menu(page, B, "duplicate");
  await expect(named(page, "Cube B 2")).toHaveClass(/active/);

  page.once("dialog", (dialog) => void dialog.accept("Crate"));
  await menu(page, A, "rename");
  await expect(row(page, A).locator("strong")).toHaveText("Crate");

  await row(page, A).click();
  await row(page, B).click({ modifiers: ["Control"] });
  await row(page, B).click({ button: "right" });
  await expect(page.getByTestId("outliner-menu-ungroup")).toBeDisabled();
  await page.getByTestId("outliner-menu-group").click();
  const group = named(page, "Group");
  await expect(group).toHaveClass(/active/);
  await expect(row(page, B)).toHaveCSS("padding-left", "22px");
  await menu(page, B, "ungroup");
  await expect(named(page, "Group")).toHaveCount(0);
  await expect(row(page, B)).toHaveCSS("padding-left", "8px");

  // Parent to active: the primary (selected first) is the parent.
  await row(page, A).click();
  await row(page, C).click({ modifiers: ["Control"] });
  await menu(page, C, "parent");
  await expect(row(page, C)).toHaveCSS("padding-left", "22px");
  await menu(page, C, "unparent");
  await expect(row(page, C)).toHaveCSS("padding-left", "8px");

  await menu(page, B, "goto");
  await expect(row(page, B)).toHaveClass(/active/);
  await menu(page, B, "delete");
  await expect(row(page, B)).toHaveCount(0);
  await expect(page.getByTestId("outliner-menu")).toHaveCount(0);
  expect(errors).toEqual([]);
});
