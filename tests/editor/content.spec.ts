// The Content Browser (plan phase 4 step 6a; INV-A23; Forge's
// `content-drawer-redesign` and `content-drawer-state` smokes): the drawer
// opens from its title and with Ctrl + Space, its folder tree has the
// project's content and the engine's read-only roots, a folder shows its
// sub-folders and cards, search and the type filter narrow the open folder,
// the thumbnail size cycles, Back / Forward walk the folders visited, the
// open level's card is the Active one, an outside click closes the drawer
// unless it is locked, and the folder is remembered across a reload; a large
// folder draws only the rows in view (virtualised grid); a model's and a
// material's thumbnails are drawn once, then come from the server's cache
// (step 6b). The level
// and the files are written into this run's temporary project copy (D14).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { cubeGlb } from "./glb.ts";

const LEVEL = "content/levels/content-smoke";
const MODEL = "ast_000000000000000000000000000c0001";
const TEXTURE = "ast_000000000000000000000000000c0002";
const CUBE = "ast_000000000000000000000000000c0003";
const MATERIALS = "engine:content/packs/starter/starter-content/Materials";
const OPS_LEVEL = "content/levels/ops-smoke";
const ROCK = "ast_000000000000000000000000000c0004";
const PAINT = "ast_000000000000000000000000000c0005";
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
  mkdirSync(at("content/thumbs"), { recursive: true });
  writeFileSync(at("content/thumbs/cube.glb"), cubeGlb());
  writeFileSync(at("content/thumbs/cube.glb.meta.json"), meta(CUBE, "forge.model@2"));
  // Step 6c: a model the ops level places, a texture nothing uses, a folder to paste into.
  mkdirSync(at("content/ops/sub"), { recursive: true });
  writeFileSync(at("content/ops/rock.glb"), cubeGlb());
  writeFileSync(at("content/ops/rock.glb.meta.json"), meta(ROCK, "forge.model@2"));
  writeFileSync(at("content/ops/paint.png"), "png");
  writeFileSync(at("content/ops/paint.png.meta.json"), meta(PAINT, "forge.texture@2"));
  // A material in another folder uses the texture (the server lists it when the texture is deleted).
  mkdirSync(at("content/ops-materials"), { recursive: true });
  writeFileSync(
    at("content/ops-materials/painted.material.json"),
    `${JSON.stringify({ schema: "forge.material/1", id: "ast_000000000000000000000000000c0006", baseColorTexture: PAINT }, null, 2)}\n`,
  );
  mkdirSync(at(OPS_LEVEL), { recursive: true });
  const rockActor = {
    id: "act_000000000000000000000000000c0001",
    name: "Rock",
    class: null,
    parent: null,
    spatiallyLoaded: false,
    transform: { p: [0, 0.5, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { mesh: { type: "forge.staticMesh@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, mesh: ROCK, materials: [], color: null, castShadow: true } },
  };
  writeFileSync(
    at(`${OPS_LEVEL}/level.json`),
    `${JSON.stringify({ schema: "forge.level/1", id: "lvl_0000000000000000000000000000c002", settings: { cellSize: 128 }, actors: [rockActor] }, null, 2)}\n`,
  );
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

/** The thumbnail's centre pixel (what the card shows), read from its image. */
const centre = (thumb: Locator) =>
  thumb.locator("img").evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data];
  });

test("thumbnails: a model and a material are drawn once, stored in the server's cache, and read from it after a reload", async ({ page }) => {
  await open(page);
  await page.locator("[data-content-toggle]").click();
  await folderRow(page, "content/thumbs").click();
  const cubeThumb = card(page, "content/thumbs/cube.glb").locator("[data-asset-thumb]");
  await expect(cubeThumb).toHaveAttribute("data-thumbnail", "ready", { timeout: 30_000 });
  // The cube fills the centre: not Forge's background (#191b1f).
  expect((await centre(cubeThumb)).slice(0, 3)).not.toEqual([0x19, 0x1b, 0x1f]);

  // A pack's material, on a sphere: the pack's root is folded at first.
  await folderRow(page, "engine:content/packs/starter").click();
  await folderRow(page, "engine:content/packs/starter/starter-content").click();
  await folderRow(page, MATERIALS).click();
  const ground = card(page, `${MATERIALS}/Ground.material.json`).locator("[data-asset-thumb]");
  await expect(ground).toHaveAttribute("data-thumbnail", "ready", { timeout: 30_000 });

  // Both stored in the server's cache (the image shows before it is stored).
  const groundId = (await card(page, `${MATERIALS}/Ground.material.json`).getAttribute("data-asset-id"))!;
  const cached = () => readdirSync(join(process.env.FORGE_EDITOR_SMOKE_PROJECT!, ".forge-cache", "thumbnails"));
  await expect.poll(() => [CUBE, groundId].every((id) => cached().some((file) => file.startsWith(`${id}-`)))).toBe(true);

  // After a reload the server's cache answers: neither is drawn or stored again (the folder's other
  // materials may still be drawing).
  const stored: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (request.method() === "POST" && url.includes("/__forge/thumbnail") && (url.includes(CUBE) || url.includes(groundId))) stored.push(url);
  });
  await page.reload();
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  await page.locator("[data-content-toggle]").click();
  await expect(ground).toHaveAttribute("data-thumbnail", "ready", { timeout: 30_000 });
  await folderRow(page, "content/thumbs").click();
  await expect(cubeThumb).toHaveAttribute("data-thumbnail", "ready", { timeout: 30_000 });
  expect(stored).toEqual([]);
});

test("operations: rename in place, a delete refused while the level uses it (who uses it is listed), cut / copy / paste, Delete, the open level locked", async ({ page }) => {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT!;
  const onDisk = (path: string): boolean => existsSync(join(project, ...path.split("/")));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(`/?editor&level=${encodeURIComponent(OPS_LEVEL)}${webgl}`);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  await page.locator("[data-content-toggle]").click();
  await folderRow(page, "content/ops").click();

  // Rename in place: the meta file follows; the level still finds the model by its GUID.
  await card(page, "content/ops/rock.glb").click({ button: "right" });
  await page.getByTestId("content-menu-rename").click();
  await page.getByTestId("content-rename").fill("boulder");
  await page.getByTestId("content-rename").press("Enter");
  await expect(card(page, "content/ops/boulder.glb")).toBeVisible();
  expect([onDisk("content/ops/boulder.glb"), onDisk("content/ops/boulder.glb.meta.json"), onDisk("content/ops/rock.glb")]).toEqual([true, true, false]);

  // The open level places it: the delete is refused, naming the actor.
  await card(page, "content/ops/boulder.glb").click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("editor-toast")).toContainText("Rock");
  expect(onDisk("content/ops/boulder.glb")).toBe(true);

  // A material uses the texture: the server refuses and lists it; picking it shows the material's card.
  await card(page, "content/ops/paint.png").click();
  await page.keyboard.press("Delete");
  const referrers = page.getByTestId("content-referrers");
  await expect(referrers).toBeVisible();
  await referrers.locator('[data-testid="content-referrers-item"]').first().click();
  await expect(card(page, "content/ops-materials/painted.material.json")).toHaveClass(/is-selected/);
  expect(onDisk("content/ops/paint.png")).toBe(true);

  // The open level's card: Rename, Cut and Delete are off.
  await folderRow(page, "content/levels").click();
  await card(page, OPS_LEVEL).click({ button: "right" });
  await expect(page.getByTestId("content-menu-rename")).toBeDisabled();
  await expect(page.getByTestId("content-menu-delete")).toBeDisabled();
  await page.keyboard.press("Escape");

  // Cut, then Paste into a folder's empty space: the cut card is dimmed until then.
  await folderRow(page, "content/ops").click();
  await card(page, "content/ops/paint.png").click();
  await page.keyboard.press("Control+x");
  await expect(card(page, "content/ops/paint.png")).toHaveClass(/is-cut/);
  await page.locator("[data-folder-path='content/ops/sub']").dblclick();
  await page.locator(".content-list").click({ button: "right", position: { x: 300, y: 60 } });
  await page.getByTestId("content-menu-paste").click();
  await expect(card(page, "content/ops/sub/paint.png")).toBeVisible();
  expect([onDisk("content/ops/sub/paint.png.meta.json"), onDisk("content/ops/paint.png")]).toEqual([true, false]);

  // Copy and Paste in the same folder: a free name and a new GUID; Delete takes the copy away.
  await card(page, "content/ops/sub/paint.png").click();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  const copy = card(page, "content/ops/sub/paint_2.png");
  await expect(copy).toBeVisible();
  await expect(copy).not.toHaveAttribute("data-asset-id", PAINT);
  await copy.click();
  await page.keyboard.press("Delete");
  await expect(copy).toHaveCount(0);
  expect([onDisk("content/ops/sub/paint_2.png"), onDisk("content/ops/sub/paint_2.png.meta.json")]).toEqual([false, false]);
  // The actor shortcuts did not run meanwhile: the level still has its one actor.
  await expect(page.locator('[data-testid="outliner-row"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("new: a folder, a material from its Metal preset, an actor class, a level with Forge's default actors", async ({ page }) => {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT!;
  const json = (path: string) => JSON.parse(readFileSync(join(project, ...path.split("/")), "utf8")) as Record<string, unknown>;
  const names = ["made", "Steel", "Door", "Fresh"];
  page.on("dialog", (dialog) => void dialog.accept(names.shift()));
  await open(page);
  await page.locator("[data-content-toggle]").click();
  await folderRow(page, "content").click();

  await drawer(page).locator("[data-content-add]").click();
  await page.getByTestId("content-menu-new-folder").click();
  await expect(page.locator("[data-folder-path='content/made']")).toBeVisible();
  await page.locator("[data-folder-path='content/made']").dblclick();
  await expect(lastCrumb(page)).toHaveAttribute("title", "content/made");

  // A material from a preset: the picker first, then the name.
  await drawer(page).locator("[data-content-add]").click();
  await page.getByTestId("content-menu-new-forge.material").click();
  await page.locator('[data-testid="content-new-template-item"][data-id="2"]').click();
  await expect(card(page, "content/made/Steel.material.json")).toBeVisible();
  expect(json("content/made/Steel.material.json")).toMatchObject({ schema: "forge.material/1", metalness: 1, roughness: 0.3 });

  // An actor class from the empty space's menu.
  await page.locator(".content-list").click({ button: "right", position: { x: 400, y: 60 } });
  await page.getByTestId("content-menu-new-actorClass").click();
  await expect(card(page, "content/made/Door.actor.json").locator(".asset-type-line")).toHaveText("Actor Class");
  expect(json("content/made/Door.actor.json")).toMatchObject({ schema: "forge.actorClass/1", name: "Door" });

  // A level: Forge's default (environment, sun, floor, cube), its index written by the server.
  await drawer(page).locator("[data-content-add]").click();
  await page.getByTestId("content-menu-new-level").click();
  await expect(card(page, "content/made/Fresh")).toBeVisible();
  const level = json("content/made/Fresh/level.json") as { actors: { name: string }[] };
  expect(level.actors.map((actor) => actor.name)).toEqual([
    "Sky Atmosphere",
    "Sky Light",
    "Exponential Height Fog",
    "Cloud Layer",
    "World Environment",
    "Post Process",
    "Sun",
    "Floor",
    "Cube",
  ]);
  expect(existsSync(join(project, "content", "made", "Fresh", "cells.json"))).toBe(true);
});
