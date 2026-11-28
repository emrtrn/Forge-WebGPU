import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openEditor, projectPath, watchErrors, EXPECTED_MISSES, WEBGPU, writeLevel } from "./support.ts";

const LEVEL = "content/levels/game-mode-smoke";
const PAWN = "act_f013e046136d439d8e24129da7791002";

function pawnYAndZ(page: Page) {
  return page.evaluate((id) => {
    const dev = (window as unknown as { __forgeDev?: { actor(key: string): { transform: { p: number[] } } | null } }).__forgeDev;
    return dev?.actor(id)?.transform.p.slice(1) ?? [];
  }, PAWN);
}

test("World Settings Game Mode starts the selected TPS controller in unsaved Play", async ({ page, context }, info) => {
  const data = JSON.parse(readFileSync(projectPath("content/levels/tps-pilot/level.json"), "utf8")) as { actors: unknown[] };
  const folder = writeLevel(LEVEL, "lvl_ab48480931054324abfd164d1bd69000", data.actors);
  const levelFile = join(folder, "level.json");
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  await page.getByTestId("editor-main-menu").click();
  await page.getByTestId("main-menu-world-settings").click();
  const selector = page.getByTestId("world-settings-game-mode");
  await expect(selector).toHaveValue("");
  await selector.selectOption("starter.tps");
  await expect(selector).toHaveValue("starter.tps");
  await page.getByTestId("world-settings-close").click();
  await expect(page.getByTestId("editor-save")).toBeEnabled();
  const opened = context.waitForEvent("page");
  await page.getByTestId("editor-play").click();
  const game = await opened;
  const gameErrors = watchErrors(game, EXPECTED_MISSES);
  const canvas = game.getByTestId("forge-canvas");
  await expect(canvas).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  await expect(canvas).toHaveAttribute("data-forge-resource-errors", "0");
  if (WEBGPU) await expect(canvas).toHaveAttribute("data-forge-backend", "webgpu");
  await game.bringToFront();
  await info.attach("TPS pilot", { body: await canvas.screenshot(), contentType: "image/png" });
  await game.keyboard.down("KeyW");
  try {
    await expect.poll(async () => (await pawnYAndZ(game))[1] ?? 2).toBeLessThan(1.4);
  } finally {
    await game.keyboard.up("KeyW");
  }
  await game.keyboard.press("Space");
  await expect.poll(async () => (await pawnYAndZ(game))[0] ?? 0, { intervals: [30, 40, 50] }).toBeGreaterThan(0.25);
  expect(readFileSync(levelFile, "utf8")).not.toContain("starter.tps");
  await page.bringToFront();
  await page.getByTestId("editor-save").click();
  await expect.poll(() => JSON.parse(readFileSync(levelFile, "utf8")).settings.gameMode).toBe("starter.tps");
  expect([...errors, ...gameErrors]).toEqual([]);
});
