// 6g browser acceptance: real sample stays read-only; only a temporary
// engine content repository is writable. This server uses an ephemeral port.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { expect, test } from "@playwright/test";
import { forgeServerPlugin } from "../../tools/server/vitePlugin.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ENGINE = "engine:content/engine";
const LEVEL = `${ENGINE}/levels/workbench`;
const ACTOR = `act_${"4".repeat(32)}`;
const webgl = process.env.FORGE_EDITOR_WEBGPU === "1" ? "" : "&forceWebGL";
let engineRoot: string;
let server: ViteDevServer | undefined;
let base: string;

test.beforeAll(async () => {
  engineRoot = await mkdtemp(join(tmpdir(), "forge-editor-engine-content-"));
  await mkdir(join(engineRoot, "content/engine/levels/workbench"), { recursive: true });
  await mkdir(join(engineRoot, "content/packs/unselected"), { recursive: true });
  await mkdir(join(engineRoot, "content/packs/starter"), { recursive: true });
  await cp(join(REPO, "content/packs/starter/classes/exponential-height-fog.json"), join(engineRoot, "content/packs/starter/fog.actor.json"));
  await writeFile(join(engineRoot, "content/engine/levels/workbench/level.json"), JSON.stringify({
    schema: "forge.level/1", id: `lvl_${"4".repeat(32)}`, actors: [{ id: ACTOR, name: "Engine Actor", spatiallyLoaded: false }],
  }));
  server = await createServer({
    root: REPO, configFile: false, logLevel: "error",
    plugins: [forgeServerPlugin({ projectRoot: join(REPO, "samples/starter"), engineContent: { root: engineRoot } })],
    resolve: { alias: { "@forge/sdk": join(REPO, "src/sdk/index.ts"), "@forge/editor-sdk": join(REPO, "src/editor-sdk/index.ts") } },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  base = server.resolvedUrls!.local[0]!;
});

test.afterAll(async () => {
  await server?.close();
  if (engineRoot) await rm(engineRoot, { recursive: true, force: true });
});

test("engine level: edit, save, reopen; Content Browser writes and refreshes classes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}?editor&level=${encodeURIComponent(LEVEL)}${webgl}`);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  await page.locator(`[data-testid="outliner-row"][data-actor-id="${ACTOR}"]`).click();
  const x = page.getByTestId("detail-transform.p[0]");
  await x.fill("12");
  await x.press("Tab");
  await expect(page.getByTestId("editor-save")).toBeEnabled();
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-status")).toHaveText(/^Saved \d+ files?$/);
  await expect(page.getByTestId("editor-save")).toBeDisabled();
  expect(JSON.parse(await readFile(join(engineRoot, "content/engine/levels/workbench/level.json"), "utf8")).actors[0].transform.p[0]).toBe(12);
  await page.reload();
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  await page.locator(`[data-testid="outliner-row"][data-actor-id="${ACTOR}"]`).click();
  await expect(x).toHaveValue("12");

  await page.locator("[data-content-toggle]").click();
  const drawer = page.locator("[data-content-drawer]");
  await page.locator(`button.folder-row[title="${ENGINE}"]`).click();
  // A pack not selected by the sample is nevertheless visible in this mode.
  await expect(page.locator('button.folder-row[title="engine:content/packs/unselected"]')).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept("BrowserClass"));
  await drawer.locator("[data-content-add]").click();
  await page.getByTestId("content-menu-new-actorClass").click();
  await expect(page.locator(`[data-asset-path="${ENGINE}/BrowserClass.actor.json"]`)).toBeVisible();
  const response = await page.request.get(`${base}__forge/classes`, { headers: { "X-Forge-Request": "1" } });
  const cls = (await response.json()).classes.find((item: { name: string }) => item.name === "BrowserClass");
  expect(cls).toBeDefined();
  // Engine authoring does not enable writes to the sample project.
  await page.locator('button.folder-row[title="content"]').click();
  await drawer.locator("[data-content-add]").click();
  await expect(page.getByTestId("content-menu-new-folder")).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.locator("[data-content-toggle]").click();
  await page.getByTestId("add-actor-button").hover();
  await page.getByTestId("add-actor-search").fill("BrowserClass");
  await expect(page.locator(`.add-actor-results [data-add-key="class:${cls.id}"]`)).toBeVisible();
  expect(errors).toEqual([]);
});

test("opening the sample itself still leaves Save disabled after an edit", async ({ page }) => {
  // A minimal sample level is already committed; no test writes its bytes.
  await page.goto(`${base}?editor${webgl}`);
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  await page.getByTestId("outliner-row").first().click();
  const x = page.getByTestId("detail-transform.p[0]");
  await x.fill("13");
  await x.press("Tab");
  await expect(page.getByTestId("editor-undo")).toBeEnabled();
  await expect(page.getByTestId("editor-save")).toBeDisabled();
});
