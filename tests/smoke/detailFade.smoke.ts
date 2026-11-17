import { expect, test } from "@playwright/test";
test("detail fade: real WebGPU dissolves geometry and shadow, then skips the batch", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/tests/smoke/fixtures/detailFade.html"); await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  const result = await page.evaluate(() => (window as unknown as { detailFadeProbe(): Promise<{ backend: boolean; near: { red: number; shadow: number }; fade: { red: number; shadow: number }; gone: { red: number; shadow: number } }> }).detailFadeProbe());
  console.log(`detail fade: ${JSON.stringify(result)}`);
  expect(result.backend).toBe(true);
  expect(result.near.red).toBeGreaterThan(100); expect(result.near.shadow).toBeGreaterThan(50);
  expect(result.fade.red).toBeGreaterThan(result.near.red * .2); expect(result.fade.red).toBeLessThan(result.near.red * .8);
  expect(result.fade.shadow).toBeGreaterThan(0); expect(result.fade.shadow).toBeLessThan(result.near.shadow);
  expect(result.gone.red).toBe(0); expect(result.gone.shadow).toBe(0); expect(errors).toEqual([]);
});
