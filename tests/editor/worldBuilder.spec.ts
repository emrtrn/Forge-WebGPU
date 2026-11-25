// The World Builder window in the editor (plan 5d step 8, INV-B13), on its own
// dev server and project copy (the window restarts the server, D14): a project
// without the `worldbuilder` pack adds it with one button; the choices draw a
// preview; Create builds a new level, opens it and the Content Browser lists
// it; a level that exists is replaced only after a question. Its nature comes
// from the starter pack's recipes (vegetation plan PG5): a single tree and
// foliage rules of the generated families, edited, saved and read again, and
// the families no family sheet approves in the status.

import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { expect, test, type Page } from "@playwright/test";
import { forgeServerPlugin } from "../../tools/server/vitePlugin.ts";
import { BACKEND, named, openEditor, row } from "./support.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** What the page meets while the server restarts under it. */
const RESTARTING = [/WebSocket/, /ERR_CONNECTION/, /\[vite\]/, /Failed to fetch/];
let temp: string, project: string, server: ViteDevServer, base: string;
const LEVEL = "content/levels/Smoke";
/** Of the starter pack's recipes: their families and Foliage Types are what the world must name. */
const PLANTS = ["trees/Broadleaf", "trees/Hazel", "grass/MeadowGrass"].map((name) => join(REPO, "content/packs/starter/procgen", name));
const text = (path: string) => readFile(join(project, ...path.split("/")), "utf8");

test.beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "forge-world-builder-smoke-"));
  project = join(temp, "game");
  await cp(join(REPO, "samples/starter"), project, { recursive: true });
  await writeFile(join(project, "content/nature.familysheet.json"), JSON.stringify({ schema: "forge.familySheet/1", id: `ast_${"5".repeat(32)}`, entries: [] }));
  server = await createServer({
    root: REPO, configFile: false, logLevel: "error", plugins: [forgeServerPlugin({ projectRoot: project })],
    resolve: { alias: { "@forge/sdk": join(REPO, "src/sdk/index.ts"), "@forge/editor-sdk": join(REPO, "src/editor-sdk/index.ts") } }, server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  base = server.resolvedUrls!.local[0]!;
});

test.afterAll(async () => {
  await server?.close();
  if (temp) await rm(temp, { recursive: true, force: true });
});

const field = (page: Page, key: string) => page.getByTestId(`world-builder-${key}`);
const panel = (page: Page) => page.getByTestId("random-world-panel");

type Actor = { id: string; name: string; transform: { p: [number, number, number] }; components?: Record<string, { type: string; [field: string]: unknown }> };

/** The level's actors with the file each is stored in (`level.json` or a cell). */
async function actorsOf(): Promise<(Actor & { file: string })[]> {
  const files = [`${LEVEL}/level.json`, ...(await readdir(join(project, LEVEL, "cells"))).map((name) => `${LEVEL}/cells/${name}`)];
  return (await Promise.all(files.map(async (file) => (JSON.parse(await text(file)) as { actors: Actor[] }).actors.map((actor) => ({ ...actor, file }))))).flat();
}
const treesOf = async () => (await actorsOf()).filter((actor) => Object.values(actor.components ?? {}).some(({ type }) => type.startsWith("forge.plant@")));

/** Loads the actor's cell (a fresh world's camera looks from afar) and selects the actor. */
async function selectIn(page: Page, actor: { id: string; name: string; file: string }): Promise<void> {
  const key = /cells\/(.+)\.json$/.exec(actor.file)![1]!;
  await page.getByTestId("outliner-wp-tab").click();
  await page.getByTestId("wp-cell-search").fill(key);
  const cell = page.getByTestId("wp-cell").filter({ hasText: new RegExp(`^${key}`) });
  await cell.locator('input[type="checkbox"]').check();
  await page.getByTestId("wp-load").click();
  await expect(cell).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
  await page.getByTestId("outliner-actors-tab").click();
  await page.getByTestId("outliner-search").fill(actor.name);
  await row(page, actor.id).click();
}

async function openWindow(page: Page): Promise<void> {
  await page.getByTestId("add-actor-button").hover();
  await page.locator(".add-actor-menu").getByText("Terrain", { exact: true }).first().hover();
  await page.locator("[data-testid='add-action-forge.worldBuilder']:visible").click();
  await expect(page.getByTestId("world-builder")).toBeVisible();
}

test("World Builder: add the pack, preview, build a new level and open it, replace only after a question", async ({ page }) => {
  test.setTimeout(360_000);
  await page.addInitScript((level) => localStorage.setItem(`forge.editor.hlod.auto:Starter/${level}`, "false"), LEVEL);
  const errors = await openEditor(page, { base, allow: RESTARTING });
  await openWindow(page);

  // The pack is missing: nothing can be built; one button adds it and the server restarts under the page.
  await expect(page.getByTestId("world-builder-pack")).toContainText("worldbuilder");
  await expect(page.getByTestId("random-world-create")).toBeDisabled();
  await page.getByTestId("world-builder-add-pack").click();
  await expect(page.getByTestId("world-builder-pack")).toBeHidden({ timeout: 60_000 });
  expect(JSON.parse(await text("forge.project.json"))).toMatchObject({ contentPacks: ["starter", "worldbuilder"] });
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });

  // The choices: the preview follows them, water says it waits, an island narrows the others.
  await expect(panel(page)).toHaveAttribute("data-preview-state", "ready", { timeout: 30_000 });
  await expect(page.getByTestId("random-world-summary")).toContainText("2 × 2 km");
  await expect(page.getByTestId("world-builder-water-note")).toBeHidden();
  await field(page, "landform").selectOption("island");
  await expect(page.getByTestId("world-builder-water-note")).toBeVisible();
  await expect(field(page, "roads")).toHaveValue("between");
  await expect(field(page, "rivers")).toHaveCount(0);
  await expect(field(page, "size").locator("option")).toHaveCount(2);
  await field(page, "landform").selectOption("plain");
  await field(page, "size").selectOption("small");
  await field(page, "cover").selectOption("steppe");
  await field(page, "forest").selectOption("low");
  await page.getByTestId("random-world-settlement").first().getByTestId("random-world-remove").click();
  await expect(page.getByTestId("random-world-settlement")).toHaveCount(1);
  await expect(panel(page)).toHaveAttribute("data-preview-state", "ready");
  await expect(page.getByTestId("random-world-summary")).toContainText("1 × 1 km · 1 yerleşim");

  // A name that cannot be a folder keeps Create off; the target is a new level folder.
  await expect(page.getByTestId("random-world-level")).toHaveText("content/levels/World_1");
  await field(page, "name").fill("no/slash");
  await field(page, "name").press("Tab");
  await expect(page.getByTestId("random-world-create")).toBeDisabled();
  await field(page, "name").fill("Smoke");
  await field(page, "name").press("Tab");
  await page.getByTestId("random-world-create").click();
  await expect(page).toHaveURL(/level=content%2Flevels%2FSmoke/, { timeout: 90_000 });
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 90_000 });
  await expect(page.getByTestId("editor-status")).toContainText("World built");
  // The project has a family sheet that lists none of them.
  await expect(page.getByTestId("editor-status")).toContainText(/Not approved: .*Broadleaf \(pending\)/);

  // On disk: the brief beside the level, plant rules on the terrain, rocks and trees from the starter pack.
  const level = JSON.parse(await text("content/levels/Smoke/level.json")) as { id: string; actors: { name: string; components: Record<string, { type: string; rules?: unknown[] }> }[] };
  const terrain = level.actors.find((actor) => actor.components.terrain)!;
  expect(terrain.components.foliage).toMatchObject({ type: "forge.landscapeFoliage@1" });
  expect(terrain.components.foliage!.rules!.length).toBeGreaterThan(0);
  expect((JSON.parse(await text("content/levels/Smoke/Smoke.worldbrief.json")) as { data: { cover: { file: string } } }).data.cover.file).toContain("steppe");
  await expect(named(page, terrain.name)).toBeVisible();

  // The Content Browser lists it.
  await page.locator("[data-content-toggle]").click();
  await page.locator('button.folder-row[title="content/levels"]').click();
  await expect(page.locator('[data-asset-path="content/levels/Smoke/level.json"], [data-asset-path="content/levels/Smoke"]').first()).toBeVisible();
  await page.locator("[data-content-toggle]").click();

  // Nature is generated: the rules name the recipes' Foliage Types, and one tree of the Broadleaf family stands in the settlement.
  const types = new Map<string, string>(), families = new Map<string, string>();
  for (const folder of PLANTS) for (const name of await readdir(folder)) {
    if (!/\.(foliagetype|plantfamily)\.json$/.test(name)) continue;
    const { id } = JSON.parse(await readFile(join(folder, name), "utf8")) as { id: string };
    (name.endsWith(".plantfamily.json") ? families : types).set(id, name);
  }
  const grown = (terrain.components.foliage!.rules as { foliageType: string }[]).map((rule) => types.get(rule.foliageType));
  expect(grown).not.toContain(undefined);
  expect(grown).toEqual(expect.arrayContaining(["MeadowGrass_1.foliagetype.json", "MeadowGrass_3.foliagetype.json", "Hazel_2.foliagetype.json"]));
  const [tree, ...more] = await treesOf();
  expect(more).toEqual([]);
  expect(families.get(tree!.components!.plant!.family as string)).toBe("Broadleaf.plantfamily.json");

  // Edit the tree, save, open the level again: the same family, the new place.
  await selectIn(page, tree!);
  const raised = Number((tree!.transform.p[1] + 2).toFixed(2));
  await page.getByTestId("detail-transform.p[1]").fill(String(raised));
  await page.getByTestId("detail-transform.p[1]").press("Enter");
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved /);
  const [saved] = await treesOf();
  expect(saved).toMatchObject({ id: tree!.id, components: tree!.components });
  expect(saved!.transform.p[1]).toBeCloseTo(raised, 2);
  await page.reload();
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 90_000 });
  await selectIn(page, tree!);
  await expect(page.getByTestId("detail-transform.p[1]")).toHaveValue(String(raised));
  await page.getByTestId("forge-canvas").hover();
  await page.keyboard.press("f");
  for (let step = 0; step < 14; step += 1) { await page.mouse.wheel(0, 240); await page.waitForTimeout(60); }
  await page.waitForTimeout(6_000); // Its models and the foliage round it, for the one picture.
  await page.screenshot({ path: join(REPO, ".forge-cache/world-builder", `nature-${BACKEND}.png`) });

  // The sheet is in the Content Browser.
  await page.locator("[data-content-toggle]").click();
  await page.locator('button.folder-row[title="content"]').click();
  await expect(page.locator('[data-asset-path="content/nature.familysheet.json"]')).toBeVisible();
  await page.locator("[data-content-toggle]").click();

  // The window offers the open world's name again: it is replaced only after a question, with its level id.
  await openWindow(page);
  await expect(page.getByTestId("random-world-level")).toHaveText("content/levels/Smoke");
  await expect(page.getByTestId("random-world-target")).toContainText("yerini almadan önce sorar");
  await expect(panel(page)).toHaveAttribute("data-preview-state", "ready", { timeout: 30_000 });
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByTestId("random-world-create").click();
  await expect(panel(page)).toHaveAttribute("data-create-state", "cancelled");
  await field(page, "cover").selectOption("desert");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.evaluate(() => { (window as unknown as { beforeReplace: boolean }).beforeReplace = true; });
  await page.getByTestId("random-world-create").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { beforeReplace?: boolean }).beforeReplace ?? false).catch(() => true), { timeout: 90_000 }).toBe(false);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 90_000 });
  expect((JSON.parse(await text("content/levels/Smoke/level.json")) as { id: string }).id).toBe(level.id);
  expect((JSON.parse(await text("content/levels/Smoke/Smoke.worldbrief.json")) as { data: { cover: { file: string } } }).data.cover.file).toContain("desert");
  expect(errors).toEqual([]);
});
