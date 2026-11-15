// A game project's editor side (INV-A32, plan phase 4 step 10): the game
// defines a component in its game module and its editor side in
// `src/beacon/editor.ts` with `@forge/editor-sdk`; the editor shows its Add
// Actor entry in the game's own category (after Forge's), places it, shows
// the Outliner icon and type group it names, and runs its Details extension
// as one undo step. A second editor file that exports something else stops
// the editor with the file named. Its own dev server on a temporary copy of
// the starter (never samples/, D14), like the asset editor smoke.

import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { ADD_ACTOR_CATEGORIES } from "../../src/editor/host/featureEditor.ts";
import { forgeServerPlugin } from "../../tools/server/vitePlugin.ts";
import { editorUrl, named, openEditor, writeLevel } from "./support.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LEVEL = "content/levels/game-editor-smoke";
let temp = "";
let project = "";
let server: ViteDevServer | undefined;
let base = "";

const GAME = `import { defineComponent, defineFeature, defineGameModule, num } from "@forge/sdk";
export const Beacon = defineComponent("game.beacon", 1, { range: num({ default: 5, min: 0, max: 50 }) }, { label: "Beacon" });
export default defineGameModule({ id: "smoke.game", features: [defineFeature({ id: "game.beacon", components: [Beacon] })] });
`;

const EDITOR = `import { defineFeatureEditor } from "@forge/editor-sdk";
export default defineFeatureEditor({
  feature: "game.beacon",
  components: { "game.beacon": { icon: "light", outliner: "gameplay" } },
  addActor: [{ key: "game.beacon", label: "Signal Beacon", category: "Beacons", icon: "light", components: { beacon: { type: "game.beacon@1" } }, lift: 1 }],
  details: {
    "game.beacon": (ctx) => {
      const button = ctx.document.createElement("button");
      button.type = "button";
      button.dataset.testid = "beacon-max-range";
      button.textContent = "Max Range";
      button.addEventListener("click", () => ctx.edit("Max Range", { range: 50 }));
      return { element: button };
    },
  },
});
`;

async function startServer(): Promise<void> {
  server = await createServer({
    root: REPO, configFile: false, logLevel: "error", plugins: [forgeServerPlugin({ projectRoot: project })],
    resolve: { alias: { "@forge/sdk": join(REPO, "src/sdk/index.ts"), "@forge/editor-sdk": join(REPO, "src/editor-sdk/index.ts") } },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  base = server.resolvedUrls!.local[0]!;
}

test.beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "forge-game-editor-smoke-"));
  project = join(temp, "game");
  await cp(join(REPO, "samples/starter"), project, { recursive: true });
  await writeFile(join(project, "src/game.ts"), GAME);
  await mkdir(join(project, "src/beacon"), { recursive: true });
  await writeFile(join(project, "src/beacon/editor.ts"), EDITOR);
  writeLevel(LEVEL, `lvl_${"9".repeat(32)}`, [], project);
  await startServer();
});

test.afterAll(async () => {
  await server?.close();
  if (temp) await rm(temp, { recursive: true, force: true });
});

test("the game's editor side: its Add Actor entry in its own category, its Outliner icon and group, its Details extension", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, base, drawn: true });
  await page.getByTestId("add-actor-button").hover();
  // The game's own category comes after Forge's (the project's classes come last).
  const labels = (await page.locator(".add-actor-category-label").allTextContents()).map((label) => label.trim());
  const lastForge = Math.max(...ADD_ACTOR_CATEGORIES.map((category) => labels.indexOf(category.label)));
  expect(lastForge).toBeGreaterThanOrEqual(0);
  expect(labels.indexOf("Beacons")).toBeGreaterThan(lastForge);
  await page.locator(".add-actor-category-label", { hasText: "Beacons" }).hover();
  await page.locator('[data-add-key="game.beacon"]').click();

  const beacon = named(page, "Signal Beacon");
  await expect(beacon).toHaveClass(/active/);
  await expect(beacon).toHaveAttribute("data-outliner-type", "gameplay");
  await expect(beacon.locator("[data-icon]")).toHaveAttribute("data-icon", "light");
  await expect(page.getByTestId("detail-transform.p[1]")).toHaveValue("1");

  const range = page.getByTestId("detail-beacon-range");
  await expect(range).toHaveValue("5");
  await page.getByTestId("beacon-max-range").click();
  await expect(range).toHaveValue("50");
  await page.getByTestId("editor-undo").click();
  await expect(range).toHaveValue("5");
  expect(errors).toEqual([]);
});

test("an editor.ts that does not export a feature editor stops the editor with its path", async ({ page }) => {
  await mkdir(join(project, "src/broken"), { recursive: true });
  await writeFile(join(project, "src/broken/editor.ts"), "export default { feature: \"game.beacon\" };\n");
  // A file added while the server runs: the next editor load lists it.
  await expect.poll(async () => (await fetch(`${base}@id/__x00__virtual:forge/game-editors`).then((response) => response.text())).includes("src/broken/editor.ts"), { timeout: 15_000 }).toBe(true);
  await page.goto(editorUrl(LEVEL, base));
  await expect(page.getByTestId("editor-status")).toContainText("src/broken/editor.ts: the default export is not defineFeatureEditor(...)", { timeout: 60_000 });
});
