// All edits are confined to the smoke runner's temporary project, never Island.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { BACKEND, IDENTITY, openEditor, projectPath, row, shape, writeLevel } from "./support.ts";

const id = (n: number) => `act_${n.toString(16).padStart(32, "0")}`;
const levels = ["shadow-gate", "shadow-bulk", "shadow-save", "shadow-image"].map((name) => `content/levels/${name}`);
test.beforeAll(() => {
  for (const [index, level] of levels.entries()) writeLevel(level, `lvl_${(0x5ad0 + index).toString(16).padStart(32, "0")}`, [
    { id: id(1), name: "Enabled Cube", class: null, parent: null, spatiallyLoaded: false,
      transform: { ...IDENTITY, p: [-2, 1, 0], s: [3, 3, 3] }, components: { shape: shape() } },
    { id: id(2), name: "Disabled Cube", class: null, parent: null, spatiallyLoaded: false,
      transform: { ...IDENTITY, p: [2, 1, 0], s: [3, 3, 3] }, components: { shape: { ...shape(), castShadow: false } } },
    { id: id(3), name: "Ground", class: null, parent: null, spatiallyLoaded: false,
      transform: { ...IDENTITY, s: [40, 1, 40] }, components: { shape: shape("plane") } },
  ]);
});

async function settings(page: Page) {
  await page.getByTestId("editor-main-menu").click();
  await page.getByTestId("main-menu-world-settings").click();
}
async function objectFlag(page: Page, actor: number, enabled: boolean) {
  await page.getByTestId("world-settings-close").click();
  await row(page, id(actor)).click();
  if (enabled) await expect(page.getByTestId("detail-shape-castShadow")).toBeChecked();
  else await expect(page.getByTestId("detail-shape-castShadow")).not.toBeChecked();
  await settings(page);
}

test("scene shadows toggle independently, undo and redo, and reach unsaved Play", async ({ page, context }) => {
  const errors = await openEditor(page, { level: levels[0]!, drawn: true });
  const path = projectPath(`${levels[0]}/level.json`), before = readFileSync(path, "utf8");
  await settings(page);
  const gate = page.getByTestId("world-settings-shadows-enabled"), canvas = page.getByTestId("forge-canvas");
  await expect(gate).toBeChecked(); await expect(page.getByTestId("editor-save")).toBeDisabled();
  await expect(canvas).toHaveAttribute("data-forge-shadows", "true");
  await gate.uncheck(); await expect(canvas).toHaveAttribute("data-forge-shadows", "false");
  await objectFlag(page, 1, true); await objectFlag(page, 2, false);
  await page.getByTestId("world-settings-close").click();
  await page.getByTestId("editor-undo").click();
  await expect(canvas).toHaveAttribute("data-forge-shadows", "true");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  await page.getByTestId("editor-redo").click();
  await expect(canvas).toHaveAttribute("data-forge-shadows", "false");
  const opened = context.waitForEvent("page"); await page.getByTestId("editor-play").click();
  const game = await opened;
  game.on("pageerror", (error) => errors.push(error.message));
  await expect(game.getByTestId("forge-canvas")).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  await expect(game.getByTestId("forge-canvas")).toHaveAttribute("data-forge-backend", BACKEND);
  await expect(game.getByTestId("forge-canvas")).toHaveAttribute("data-forge-shadows", "false");
  expect(readFileSync(path, "utf8")).toBe(before);
  await game.close(); expect(errors).toEqual([]);
});

test("bulk enable and disable are each one undo step and leave the scene gate unchanged", async ({ page }) => {
  // Every shadow flip rebuilds a shape batch and compiles its pipelines; with software WebGL
  // (CI has no GPU) this test's ten round trips take ~2.6 min, over the 2 min default.
  test.slow();
  const errors = await openEditor(page, { level: levels[1]!, drawn: true });
  await settings(page);
  await page.getByTestId("world-settings-object-shadows-on").click();
  await objectFlag(page, 1, true); await objectFlag(page, 2, true);
  await page.getByTestId("world-settings-object-shadows-off").click();
  await objectFlag(page, 1, false); await objectFlag(page, 2, false);
  await expect(page.getByTestId("world-settings-shadows-enabled")).toBeChecked();
  await page.getByTestId("world-settings-close").click();
  await page.getByTestId("editor-undo").click();
  await settings(page); await objectFlag(page, 1, true); await objectFlag(page, 2, true);
  await page.getByTestId("world-settings-close").click();
  await page.getByTestId("editor-undo").click();
  await settings(page); await objectFlag(page, 1, true); await objectFlag(page, 2, false);
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("saved scene gate and bulk object flags survive reopening", async ({ page }) => {
  const errors = await openEditor(page, { level: levels[2]!, drawn: true });
  await settings(page);
  await page.getByTestId("world-settings-shadows-enabled").uncheck();
  await page.getByTestId("world-settings-object-shadows-on").click();
  await page.getByTestId("world-settings-close").click();
  await page.getByTestId("editor-save").click(); await expect(page.getByTestId("editor-save")).toBeDisabled();
  await openEditor(page, { level: levels[2]!, drawn: true });
  await expect(page.getByTestId("forge-canvas")).toHaveAttribute("data-forge-shadows", "false");
  await settings(page); await expect(page.getByTestId("world-settings-shadows-enabled")).not.toBeChecked();
  await objectFlag(page, 1, true); await objectFlag(page, 2, true);
  await page.getByTestId("world-settings-shadows-enabled").check();
  await expect(page.getByTestId("forge-canvas")).toHaveAttribute("data-forge-shadows", "true");
  expect(errors).toEqual([]);
});

test("the scene switch visibly removes and restores shadows; quality Low still takes precedence", async ({ page }, info) => {
  await page.addInitScript(({ level }) => {
    localStorage.setItem(`forge.editor.cameraPose.${encodeURIComponent(`Starter/${level}`)}`, JSON.stringify({
      position: [0, 8, 8], quaternion: [-Math.sin(Math.PI / 8), 0, 0, Math.cos(Math.PI / 8)], up: [0, 1, 0],
    }));
  }, { level: levels[3]! });
  const errors = await openEditor(page, { level: levels[3]!, drawn: true });
  const canvas = page.getByTestId("forge-canvas");
  await page.getByTestId("quality-button").hover();
  await page.locator('[data-quality-choice="high"]').click();
  await page.mouse.move(0, 0);
  // Let the hover menu close and the new profile finish its first shadow frame.
  await page.waitForTimeout(500);
  const on = await canvas.screenshot({ path: info.outputPath("scene-shadows-on.png") });
  await settings(page); await page.getByTestId("world-settings-shadows-enabled").uncheck();
  await page.getByTestId("world-settings-close").click();
  await expect(canvas).toHaveAttribute("data-forge-shadows", "false");
  await page.waitForTimeout(500);
  const off = await canvas.screenshot({ path: info.outputPath("scene-shadows-off.png") });
  await settings(page); await page.getByTestId("world-settings-shadows-enabled").check();
  await page.getByTestId("world-settings-close").click();
  await expect(canvas).toHaveAttribute("data-forge-shadows", "true");
  await page.waitForTimeout(500);
  const restored = await canvas.screenshot({ path: info.outputPath("scene-shadows-restored.png") });
  const changes = await page.evaluate(async (shots) => {
    const pixels = await Promise.all(shots.map(async (base64) => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    }));
    const delta = (other: Uint8ClampedArray) => {
      let sum = 0;
      for (let i = 0; i < pixels[0]!.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(pixels[0]![i + c]! - other[i + c]!);
      return sum / (pixels[0]!.length / 4 * 3);
    };
    return { off: delta(pixels[1]!), restored: delta(pixels[2]!) };
  }, [on, off, restored].map((shot) => shot.toString("base64")));
  console.log(`Scene shadow image deltas: ${JSON.stringify(changes)}`);
  await info.attach("scene-shadows-on.png", { body: on, contentType: "image/png" });
  await info.attach("scene-shadows-off.png", { body: off, contentType: "image/png" });
  await info.attach("scene-shadows-restored.png", { body: restored, contentType: "image/png" });
  expect(changes.off, "the switch changes actual shaded pixels").toBeGreaterThan(0.02);
  expect(changes.restored, "the original shadow image returns").toBeLessThan(0.02);
  await page.getByTestId("quality-button").hover(); await page.locator('[data-quality-choice="low"]').click();
  await expect(canvas).toHaveAttribute("data-forge-shadows", "false");
  await settings(page); await expect(page.getByTestId("world-settings-shadows-enabled")).toBeChecked();
  expect(errors).toEqual([]);
});
