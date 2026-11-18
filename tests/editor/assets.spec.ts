// Phase 4 / 7: a complete temporary game (including its own JSON asset
// schema), no writes to real engine/sample content. Real GPU mode uses the
// same scenarios with the WebGPU smoke command and --headed.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { forgeServerPlugin } from "../../tools/server/vitePlugin.ts";
import { cubeGlb } from "./glb.ts";
import { openEditor, WEBGL_QUERY, SAVE_CONFLICT } from "./support.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LEVEL = "content/levels/assets", FOLDER = "content/asset-editors";
const MODEL = `ast_${"a".repeat(31)}1`, MATERIAL = `ast_${"a".repeat(31)}2`, CLASS = `ast_${"a".repeat(31)}3`, DATA = `ast_${"a".repeat(31)}4`;
const MESH = `act_${"b".repeat(31)}1`, INSTANCE = `act_${"b".repeat(31)}2`, CHILD = `act_${"b".repeat(31)}3`;
let temp: string, project: string, server: ViteDevServer | undefined, base: string;
const disk = (path: string) => join(project, ...path.split("/"));
const json = async (path: string) => JSON.parse(await readFile(disk(path), "utf8"));
const write = (path: string, value: unknown) => writeFile(disk(path), JSON.stringify(value));

test.beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "forge-asset-editors-smoke-")); project = join(temp, "game");
  await cp(join(REPO, "samples/starter"), project, { recursive: true });
  await mkdir(disk(FOLDER), { recursive: true }); await mkdir(disk(LEVEL), { recursive: true });
  await writeFile(disk("src/game.ts"), `import { defineGameModule, defineFeature, defineJsonAssetType, array, object, text, num } from '@forge/sdk';
const Values = defineJsonAssetType('test.values', 1, { suffix: '.values.json', fields: { title: text({default:'Values'}), rows: array(object({ label: text(), value: num({default:0,min:0,max:100}) })) } });
export default defineGameModule({ id:'starter.assets', features:[defineFeature({id:'test.values',assetTypes:[Values]})] });\n`);
  await writeFile(disk(`${FOLDER}/cube.glb`), cubeGlb());
  await write(`${FOLDER}/cube.glb.meta.json`, { schema: "forge.assetMeta/1", id: MODEL, type: "forge.model@2", license: "CC0-1.0", source: { origin: "asset editor smoke" }, import: { materials: [MATERIAL] } });
  await write(`${FOLDER}/surface.material.json`, { schema: "forge.material/1", id: MATERIAL, baseColor: "#aa2200", roughness: 0.5 });
  await write(`${FOLDER}/item.actor.json`, { schema: "forge.actorClass/1", id: CLASS, name: "Item", components: { shape: { type: "forge.shape@2", primitive: "cube", color: "#c8c8c8" } } });
  await write(`${FOLDER}/data.values.json`, { schema: "test.values/1", id: DATA, title: "Values", rows: Array.from({ length: 1000 }, (_, index) => ({ label: `Row ${index}`, value: index % 100 })) });
  await write(`${LEVEL}/level.json`, { schema: "forge.level/1", id: `lvl_${"c".repeat(32)}`, actors: [
    { id: MESH, name: "Mesh", spatiallyLoaded: false, components: { mesh: { type: "forge.staticMesh@2", mesh: MODEL } } },
    { id: INSTANCE, name: "Instance", class: CLASS, spatiallyLoaded: false, transform: { p: [2, 0, 0] }, overrides: { shape: { type: "forge.shape@2", castShadow: false } } },
    { id: CHILD, name: "Child", parent: MESH, spatiallyLoaded: false, transform: { p: [0, 1, 0] } },
  ] });
  server = await createServer({ root: REPO, configFile: false, logLevel: "error", plugins: [forgeServerPlugin({ projectRoot: project })],
    resolve: { alias: { "@forge/sdk": join(REPO, "src/sdk/index.ts"), "@forge/editor-sdk": join(REPO, "src/editor-sdk/index.ts") } }, server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen(); base = server.resolvedUrls!.local[0]!;
});
test.afterAll(async () => { await server?.close(); if (temp) await rm(temp, { recursive: true, force: true }); });

async function open(page: Page, allow: readonly RegExp[] = []) {
  return openEditor(page, { level: LEVEL, base, allow });
}
async function asset(page: Page, file: string) {
  await page.locator("[data-content-toggle]").click();
  await page.locator(`button.folder-row[title="${FOLDER}"]`).click();
  await page.locator(`[data-asset-path="${FOLDER}/${file}"]`).dblclick();
  await expect(page.getByTestId("asset-editor")).toHaveAttribute("data-asset-ready", "1");
}
async function save(page: Page) {
  await page.getByTestId("asset-editor-save").click();
  await expect(page.getByTestId("asset-editor-status")).toHaveText(/^Saved /);
  await expect(page.getByTestId("asset-editor-save")).toBeDisabled();
}
async function close(page: Page) {
  await page.getByTestId("asset-editor-close").click();
  await expect(page.getByTestId("asset-editor")).toHaveCount(0);
}
async function previewShot(page: Page, name: string, info: TestInfo) {
  await expect(page.getByTestId("asset-editor-preview")).toHaveAttribute("data-preview-ready", "1");
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  const clip = (await page.getByTestId("asset-editor-preview").boundingBox())!;
  const shot = await page.screenshot({ clip, path: join(REPO, ".forge-cache/asset-editor-visual", `${name}-${WEBGL_QUERY ? "webgl" : "webgpu"}.png`) });
  const deviation = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0, squares = 0; const count = data.length / 4;
    for (let i = 0; i < data.length; i += 4) { const value = data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722; sum += value; squares += value * value; }
    return Math.sqrt(Math.max(0, squares / count - (sum / count) ** 2));
  }, shot.toString("base64"));
  expect(deviation, "the asset preview draws visible geometry").toBeGreaterThan(4);
  await page.screenshot({ path: join(REPO, ".forge-cache/asset-editor-visual", `${name}-window-${WEBGL_QUERY ? "webgl" : "webgpu"}.png`) });
  await info.attach(`${name}-preview`, { body: shot, contentType: "image/png" });
}

test("game JSON data: virtual table, compound row form, undo, canonical save and reopen", async ({ page }) => {
  const errors = await open(page); await asset(page, "data.values.json");
  const rows = page.getByTestId("asset-table-row"); expect(await rows.count()).toBeLessThanOrEqual(200);
  const value = page.getByTestId("asset-cell-0-value-value"); await value.fill("37"); await value.press("Tab");
  await expect(page.getByTestId("asset-row-row.value")).toHaveValue("37");
  await page.getByTestId("asset-editor-undo").click(); await expect(value).toHaveValue("0");
  await page.getByTestId("asset-editor-redo").click(); await expect(value).toHaveValue("37");
  await page.getByTestId("asset-table-add").click(); await page.getByTestId("asset-editor-undo").click();
  await page.getByTestId("asset-table-viewport").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('[data-testid="asset-table-row"][data-row="999"]')).toBeVisible(); expect(await rows.count()).toBeLessThanOrEqual(200);
  await save(page); expect((await json(`${FOLDER}/data.values.json`)).rows[0].value).toBe(37);
  await close(page); await asset(page, "data.values.json"); await expect(value).toHaveValue("37"); await close(page); expect(errors).toEqual([]);
});

test("material: private sphere preview, asset-only undo and save; the dirty level and child survive", async ({ page }, info) => {
  const errors = await open(page);
  const levelBefore = await readFile(disk(`${LEVEL}/level.json`), "utf8");
  await page.locator(`[data-actor-id="${MESH}"]`).first().click();
  await page.getByTestId("detail-name").fill("Unsaved Mesh"); await page.getByTestId("detail-name").press("Tab");
  await expect(page.getByTestId("editor-save")).toBeEnabled();
  await asset(page, "surface.material.json");
  await expect(page.getByTestId("asset-editor-preview")).toHaveAttribute("data-preview-ready", "1");
  await expect(page.getByTestId("forge-canvas")).toHaveCount(1);
  const roughness = page.getByTestId("asset-field-roughness"); await roughness.fill("0.75"); await roughness.press("Tab");
  await page.keyboard.press("Control+z"); await expect(roughness).toHaveValue("0.5");
  await page.keyboard.press("Control+y"); await expect(roughness).toHaveValue("0.75");
  const color = page.getByTestId("asset-field-baseColor");
  await color.evaluate((element) => { (element as HTMLInputElement).value = "#22aa00"; element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); });
  await previewShot(page, "material", info);
  await save(page); await close(page);
  await expect(page.getByTestId("detail-name")).toHaveValue("Unsaved Mesh"); await expect(page.getByTestId("editor-save")).toBeEnabled();
  await expect(page.locator(`[data-testid="outliner-row"][data-actor-id="${CHILD}"]`)).toBeVisible();
  expect(await readFile(disk(`${LEVEL}/level.json`), "utf8")).toBe(levelBefore);
  expect((await json(`${FOLDER}/surface.material.json`)).baseColor).toBe("#22aa00");
  // Clear the unsaved level edit without writing the fixture.
  await page.getByTestId("editor-undo").click(); expect(errors).toEqual([]);
});

test("model: slots, UVW form/gizmo, vertex fill/remove, undo and metadata-only save", async ({ page }, info) => {
  const errors = await open(page), bytes = await readFile(disk(`${FOLDER}/cube.glb`));
  await asset(page, "cube.glb");
  const preview = page.getByTestId("asset-editor-preview"); await expect(preview).toHaveAttribute("data-preview-ready", "1");
  await expect(page.getByTestId("asset-slot-0-material")).toBeVisible();
  await page.getByTestId("asset-field-import.uvw.mapType").selectOption("box");
  await page.getByTestId("asset-uvw-move").click();
  await expect.poll(async () => JSON.parse(await preview.getAttribute("data-asset-gizmo") ?? "{}")["move:x"] !== undefined).toBe(true);
  const points = JSON.parse((await preview.getAttribute("data-asset-gizmo"))!), box = (await preview.boundingBox())!;
  const point = points["move:x"] as number[];
  const x = box.x + (point[0]! + 1) * box.width / 2, y = box.y + (1 - point[1]!) * box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 50, y, { steps: 6 }); await page.mouse.up();
  const location = page.getByTestId("asset-field-import.uvw.position[0]");
  await expect(location).not.toHaveValue("0");
  await page.getByTestId("asset-editor-undo").click(); await expect(location).toHaveValue("0");
  await page.getByTestId("asset-editor-redo").click();
  await page.getByTestId("asset-vertex-fill").click(); await save(page);
  let meta = await json(`${FOLDER}/cube.glb.meta.json`); expect(meta.import.vertexColors[0].colors).toHaveLength(meta.import.vertexColors[0].vertexCount * 4);
  expect(meta.id).toBe(MODEL); expect(meta.import.materials).toEqual([MATERIAL]); expect(meta.import.uvw.mapType).toBe("box");
  await previewShot(page, "model", info);
  await page.getByTestId("asset-vertex-remove").click(); await page.getByTestId("asset-editor-undo").click();
  await expect(page.getByTestId("asset-editor-save")).toBeDisabled();
  await close(page); await asset(page, "cube.glb"); await expect(page.getByTestId("asset-editor-preview")).toHaveAttribute("data-preview-ready", "1");
  expect(await readFile(disk(`${FOLDER}/cube.glb`))).toEqual(bytes); await close(page); expect(errors).toEqual([]);
});

test("dirty close: Cancel keeps draft, Discard closes; 409 keeps draft and Reload reads disk", async ({ page }) => {
  await open(page); await asset(page, "surface.material.json");
  const roughness = page.getByTestId("asset-field-roughness"); await roughness.fill("0.3"); await roughness.press("Tab");
  await page.getByTestId("asset-editor-close").click(); await page.getByTestId("asset-unsaved-cancel").click(); await expect(roughness).toHaveValue("0.3");
  const next = await json(`${FOLDER}/surface.material.json`); next.roughness = 0.9; await write(`${FOLDER}/surface.material.json`, next);
  await page.getByTestId("asset-editor-save").click(); await expect(page.getByTestId("asset-editor-status")).toContainText("409"); await expect(roughness).toHaveValue("0.3");
  page.once("dialog", (dialog) => void dialog.accept()); await page.getByTestId("asset-editor-reload").click(); await expect(roughness).toHaveValue("0.9");
  await roughness.fill("0.4"); await roughness.press("Tab"); await page.getByTestId("asset-editor-close").click(); await page.getByTestId("asset-unsaved-save").click();
  await expect(page.getByTestId("asset-editor")).toHaveCount(0); expect((await json(`${FOLDER}/surface.material.json`)).roughness).toBe(0.4);
  await asset(page, "surface.material.json"); await roughness.fill("0.6"); await roughness.press("Tab"); await page.getByTestId("asset-editor-close").click(); await page.getByTestId("asset-unsaved-discard").click();
  await expect(page.getByTestId("asset-editor")).toHaveCount(0);
});

test("409 Compare (step 8): disjoint changes merge and both are saved; a conflict picked Theirs takes the disk's value", async ({ page }) => {
  const errors = await open(page, [SAVE_CONFLICT]); await asset(page, "surface.material.json");
  const file = `${FOLDER}/surface.material.json`, original = await readFile(disk(file));
  const roughness = page.getByTestId("asset-field-roughness");
  await roughness.fill("0.6"); await roughness.press("Tab");
  await write(file, { ...(await json(file)), baseColor: "#00ff00" });
  await page.getByTestId("asset-editor-save").click(); await expect(page.getByTestId("asset-editor-status")).toContainText("409");
  await page.getByTestId("asset-editor-compare").click();
  await expect(page.getByTestId("asset-compare-summary")).toContainText("0 conflicts");
  await page.getByTestId("asset-compare-apply").click(); await expect(page.getByTestId("asset-compare")).toHaveCount(0);
  await expect(page.getByTestId("asset-editor-status")).toContainText("Merged with the disk; save to write");
  await save(page);
  expect(await json(file)).toMatchObject({ roughness: 0.6, baseColor: "#00ff00" });

  await roughness.fill("0.7"); await roughness.press("Tab");
  await write(file, { ...(await json(file)), roughness: 0.2 });
  await page.getByTestId("asset-editor-save").click(); await expect(page.getByTestId("asset-editor-status")).toContainText("409");
  await page.getByTestId("asset-editor-compare").click();
  const row = page.getByTestId("asset-compare-row"); await expect(row).toHaveCount(1); await expect(row).toContainText("roughness");
  await row.getByTestId("asset-compare-theirs").click(); await page.getByTestId("asset-compare-apply").click();
  await expect(roughness).toHaveValue("0.2"); await expect(page.getByTestId("asset-editor-save")).toBeDisabled();
  // Escape closes the Compare window, not the asset window.
  await page.getByTestId("asset-editor-compare").click(); await expect(page.getByTestId("asset-compare")).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.getByTestId("asset-compare")).toHaveCount(0); await expect(page.getByTestId("asset-editor")).toBeVisible();
  await close(page); expect(errors).toEqual([]);
  // The later tests start from the material as it was.
  await writeFile(disk(file), original);
});

test("actor class: Ctrl+E, component tree/defaults and live instances; destructive override changes refused", async ({ page }, info) => {
  const errors = await open(page), levelBefore = await readFile(disk(`${LEVEL}/level.json`), "utf8");
  await page.locator(`[data-testid="outliner-row"][data-actor-id="${INSTANCE}"]`).click(); await page.keyboard.press("Control+e");
  await expect(page.getByTestId("asset-editor")).toHaveAttribute("data-asset-id", CLASS);
  await expect(page.getByTestId("asset-editor")).toHaveAttribute("data-asset-ready", "1");
  await page.locator('[data-component-id="shape"]').click();
  await page.getByTestId("asset-component-primitive").selectOption("sphere"); await save(page);
  await page.getByTestId("asset-component-add").click(); await page.locator('[data-testid="asset-component-picker-item"][data-id="forge.pointLight"]').click();
  await expect(page.locator('[data-component-id="pointLight"]')).toBeVisible();
  await page.getByTestId("asset-component-parent").selectOption("shape");
  await page.locator('[data-component-id="shape"]').click(); await page.getByTestId("asset-component-primitive").selectOption("cone");
  await page.getByTestId("asset-component-parent").selectOption("pointLight");
  await expect(page.getByTestId("asset-editor-status")).toContainText("loops");
  await expect(page.getByTestId("asset-component-primitive")).toHaveValue("cone"); await expect(page.getByTestId("asset-component-parent")).toHaveValue("");
  await page.getByTestId("asset-editor-undo").click(); await page.getByTestId("asset-editor-undo").click(); await page.getByTestId("asset-editor-undo").click();
  await page.locator('[data-component-id="shape"]').click(); await page.getByTestId("asset-component-remove").click();
  await page.getByTestId("asset-editor-save").click(); await expect(page.getByTestId("asset-editor-status")).toContainText("Instance");
  await page.getByTestId("asset-editor-undo").click();
  await previewShot(page, "class", info);
  await close(page); await expect(page.getByTestId("detail-shape-primitive")).toHaveValue("sphere");
  expect(await readFile(disk(`${LEVEL}/level.json`), "utf8")).toBe(levelBefore); expect(errors).toEqual([]);
});

test("read-only pack assets open for inspection with no write controls", async ({ page }) => {
  const errors = await open(page); await page.locator("[data-content-toggle]").click();
  await page.locator('button.folder-row[title="engine:content/packs/starter"]').click();
  await page.locator('button.folder-row[title="engine:content/packs/starter/classes"]').click();
  await page.locator('[data-asset-type="forge.actorClass"]').first().dblclick();
  await expect(page.getByTestId("asset-editor")).toHaveAttribute("data-asset-ready", "1");
  await expect(page.getByTestId("asset-editor-save")).toBeDisabled(); await expect(page.getByTestId("asset-component-add")).toBeDisabled();
  await expect(page.getByTestId("asset-field-name")).toBeDisabled(); await close(page); expect(errors).toEqual([]);
});

test("switching assets confirms dirty state and a closed, late load cannot replace the next asset", async ({ page }) => {
  await open(page); await asset(page, "surface.material.json");
  const roughness = page.getByTestId("asset-field-roughness"); await roughness.fill("0.2"); await roughness.press("Tab");
  await page.getByTestId("asset-editor-open").click(); await page.locator(`[data-testid="asset-open-picker-item"][data-id="${MODEL}"]`).click();
  await expect(page.getByTestId("asset-unsaved")).toBeVisible(); await page.getByTestId("asset-unsaved-cancel").click();
  await expect(page.getByTestId("asset-editor")).toHaveAttribute("data-asset-id", MATERIAL); await expect(roughness).toHaveValue("0.2");
  await page.getByTestId("asset-editor-open").click(); await page.locator(`[data-testid="asset-open-picker-item"][data-id="${MODEL}"]`).click();
  await page.getByTestId("asset-unsaved-discard").click(); await expect(page.getByTestId("asset-editor")).toHaveAttribute("data-asset-id", MODEL); await close(page);

  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/__forge/read?path=*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("path") === `${FOLDER}/data.values.json`) await held;
    await route.continue();
  });
  await page.locator("[data-content-toggle]").click(); await page.locator(`button.folder-row[title="${FOLDER}"]`).click();
  await page.locator(`[data-asset-path="${FOLDER}/data.values.json"]`).dblclick();
  await expect(page.getByTestId("asset-editor")).toBeVisible(); await close(page);
  await asset(page, "surface.material.json");
  const response = page.waitForResponse((response) => new URL(response.url()).searchParams.get("path") === `${FOLDER}/data.values.json`);
  release(); await response;
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await expect(page.getByTestId("asset-editor")).toHaveAttribute("data-asset-id", MATERIAL); await close(page);
});

test("repeated preview windows release their private GPU geometry and retain one canvas", async ({ page }) => {
  const errors = await open(page), samples: { geometries: number; textures: number }[] = [];
  // Five windows; the first is a warm-up: the main viewport may create a shared geometry once around it (seen alone, without the rest of the file).
  for (let i = 0; i < 5; i++) {
    await asset(page, "cube.glb"); await expect(page.getByTestId("asset-editor-preview")).toHaveAttribute("data-preview-ready", "1");
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await expect(page.getByTestId("forge-canvas")).toHaveCount(1); await close(page);
    if (i > 0) samples.push(JSON.parse((await page.getByTestId("forge-canvas").getAttribute("data-asset-preview-memory"))!));
  }
  expect(samples.at(-1)!.geometries).toBeLessThanOrEqual(samples[0]!.geometries);
  expect(samples.at(-1)!.textures).toBeLessThanOrEqual(samples[0]!.textures);
  expect(errors).toEqual([]);
});
