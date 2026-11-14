// The Content Browser (plan phase 4 step 6a; INV-A23; Forge's
// `content-drawer-redesign` and `content-drawer-state` smokes): the drawer
// opens from its title and with Ctrl + Space, its folder tree has the
// project's content and the engine's read-only roots, a folder shows its
// sub-folders and cards, search and the type filter narrow the open folder,
// the thumbnail size cycles, Back / Forward walk the folders visited, the
// open level's card is the Active one, an outside click closes the drawer
// unless it is locked, and the folder is remembered across a reload; a large
// folder draws only the rows in view (virtualised grid). The level
// and the files are written into this run's temporary project copy (D14).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const LEVEL = "content/levels/content-smoke";
const MODEL = "ast_000000000000000000000000000c0001";
const TEXTURE = "ast_000000000000000000000000000c0002";
const MANY = 1500;
const webgl = process.env.FORGE_EDITOR_WEBGPU === "1" ? "" : "&forceWebGL";

const meta = (id: string, type: string) =>
  `${JSON.stringify({ schema: "forge.assetMeta/1", id, type, license: "CC0-1.0", source: { origin: "content smoke" }, import: {} }, null, 2)}\n`;

test.beforeAll(() => {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) throw new Error("FORGE_EDITOR_SMOKE_PROJECT is not set (the editor smoke config sets it).");
  const at = (path: string): string => join(project, ...path.split("/"));
  mkdirSync(at(LEVEL), { recursive: true });
  writeFileSync(
    at(`${LEVEL}/level.json`),
    `${JSON.stringify({ schema: "forge.level/1", id: "lvl_0000000000000000000000000000c001", settings: { cellSize: 128 }, actors: [] }, null, 2)}\n`,
  );
  mkdirSync(at("content/props/sub"), { recursive: true });
  writeFileSync(at("content/props/crate.glb"), "glTF");
  writeFileSync(at("content/props/crate.glb.meta.json"), meta(MODEL, "forge.model@2"));
  writeFileSync(at("content/props/wood.png"), "png");
  writeFileSync(at("content/props/wood.png.meta.json"), meta(TEXTURE, "forge.texture@2"));
  writeFileSync(at("content/props/loose.png"), "png");
  mkdirSync(at("content/many"), { recursive: true });
  for (let i = 0; i < MANY; i += 1) writeFileSync(at(`content/many/item${String(i).padStart(4, "0")}.bin`), "x");
});

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/?editor&level=${encodeURIComponent(LEVEL)}${webgl}`);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  return errors;
}

const drawer = (page: Page): Locator => page.locator("[data-content-drawer]");
const folderRow = (page: Page, path: string): Locator => page.locator(`button.folder-row[title="${path}"]`);
const lastCrumb = (page: Page): Locator => page.locator("[data-content-path] .content-breadcrumb").last();
const card = (page: Page, path: string): Locator => page.locator(`[data-asset-path="${path}"]`);

test("the drawer: tree, folders and cards, search, filter, size, Back / Forward, the Active level", async ({ page }) => {
  const errors = await open(page);
  await page.locator("[data-content-toggle]").click();
  await expect(drawer(page)).toHaveClass(/open/);
  await expect(page.getByTestId("forge-editor")).toHaveClass(/content-drawer-open/);
  await expect(drawer(page).getByRole("button", { name: "Save All" })).toBeVisible();

  // The project's content, the engine's content and the starter pack; the engine's are read-only.
  await expect(folderRow(page, "content")).toBeVisible();
  await expect(folderRow(page, "engine:content/engine")).toHaveClass(/is-read-only/);
  await expect(folderRow(page, "engine:content/packs/starter")).toHaveClass(/is-read-only/);

  await folderRow(page, "content/props").click();
  await expect(lastCrumb(page)).toHaveAttribute("title", "content/props");
  await expect(page.locator("[data-folder-path='content/props/sub']")).toBeVisible();
  await expect(card(page, "content/props/crate.glb")).toHaveAttribute("data-asset-id", MODEL);
  await expect(card(page, "content/props/crate.glb").locator(".asset-type-line")).toHaveText("Static Mesh");
  // A file with no meta file is listed, with its issue.
  await expect(card(page, "content/props/loose.png")).toHaveClass(/is-unregistered/);
  await expect(card(page, "content/props/loose.png")).toHaveClass(/has-issues/);
  await expect(drawer(page).locator("[data-content-item-count]")).toHaveText("4 items");

  // Search narrows the open folder.
  await drawer(page).locator("[data-content-search]").fill("cra");
  await expect(drawer(page).locator("[data-content-item-count]")).toHaveText("1 item");
  await drawer(page).locator("[data-content-search]").fill("");

  // The type filter: its popover closes on a pick, the button shows a filter is on.
  const filter = drawer(page).getByRole("button", { name: "Filter assets" });
  await filter.click();
  await expect(filter).toHaveAttribute("aria-expanded", "true");
  await drawer(page).locator("[data-content-type-filter]").selectOption("forge.texture");
  await expect(filter).toHaveAttribute("aria-expanded", "false");
  await expect(filter).toHaveClass(/is-filtered/);
  await expect(drawer(page).locator("[data-content-item-count]")).toHaveText("2 items"); // sub + wood
  await filter.click();
  await drawer(page).locator("[data-content-type-filter]").selectOption("__all__");
  await expect(filter).not.toHaveClass(/is-filtered/);

  // Thumbnail size: medium -> large -> small (Forge).
  await drawer(page).locator("[data-content-view]").click();
  await expect(drawer(page)).toHaveAttribute("data-content-view", "large");
  await drawer(page).locator("[data-content-view]").click();
  await expect(drawer(page)).toHaveAttribute("data-content-view", "small");

  // A folder card opens with a double click; Back / Forward walk the visits.
  await page.locator("[data-folder-path='content/props/sub']").dblclick();
  await expect(lastCrumb(page)).toHaveAttribute("title", "content/props/sub");
  await expect(drawer(page).locator("[data-content-back]")).toBeEnabled();
  await drawer(page).locator("[data-content-back]").click();
  await expect(lastCrumb(page)).toHaveAttribute("title", "content/props");
  await expect(drawer(page).locator("[data-content-forward]")).toBeEnabled();

  // A level folder is a Level card in its parent; the open level's is the Active one.
  await folderRow(page, "content/levels").click();
  await expect(card(page, LEVEL)).toHaveClass(/is-active-level/);
  await expect(card(page, LEVEL).locator(".asset-type-line")).toHaveText("Level");

  // The drawer sits between the Outliner and Details.
  const [drawerBox, detailsBox] = await Promise.all([drawer(page).boundingBox(), page.locator(".editor-details").boundingBox()]);
  expect(drawerBox!.x + drawerBox!.width).toBeLessThanOrEqual(detailsBox!.x + 1);
  expect(errors).toEqual([]);
});

test("an outside click closes the drawer unless it is locked; Ctrl + Space toggles it; the folder is remembered", async ({ page }) => {
  await open(page);
  await page.locator("[data-content-toggle]").click();
  await folderRow(page, "content/props").click();
  await expect(lastCrumb(page)).toHaveAttribute("title", "content/props");

  const viewport = page.locator(".editor-viewport-host canvas");
  const box = (await viewport.boundingBox())!;
  await page.mouse.click(box.x + 40, box.y + 40);
  await expect(drawer(page)).not.toHaveClass(/open/);

  await page.keyboard.press("Control+Space");
  await expect(drawer(page)).toHaveClass(/open/);
  await drawer(page).locator("[data-content-settings]").click();
  await page.getByTestId("content-settings-lock").click();
  await page.mouse.click(box.x + 40, box.y + 40);
  await expect(drawer(page)).toHaveClass(/open/);
  await page.keyboard.press("Control+Space");
  await expect(drawer(page)).not.toHaveClass(/open/);

  await page.reload();
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  await page.locator("[data-content-toggle]").click();
  await expect(lastCrumb(page)).toHaveAttribute("title", "content/props");
});

test("a folder of 1.500 files draws only the cards in view, and scrolling draws the rest", async ({ page }) => {
  await open(page);
  await page.locator("[data-content-toggle]").click();
  await folderRow(page, "content/many").click();
  await expect(drawer(page).locator("[data-content-item-count]")).toHaveText(`${MANY} items`);
  const drawn = await page.locator(".content-list .asset-card").count();
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThan(200);
  await expect(card(page, "content/many/item0000.bin")).toBeVisible();
  await page.locator(".content-list").evaluate((list) => (list.scrollTop = list.scrollHeight));
  await expect(card(page, `content/many/item${String(MANY - 1).padStart(4, "0")}.bin`)).toBeVisible();
  await expect(card(page, "content/many/item0000.bin")).toHaveCount(0);
});
