import { expect, test } from "@playwright/test";
import type { ViewModelProbe } from "./fixtures/viewModel.ts";

for (const forceWebGL of [false, true]) {
  test(`view model preserves the world and has its own FOV and depth (forceWebGL=${forceWebGL})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/tests/smoke/fixtures/viewModel.html");
    await page.waitForFunction(() => "probeViewModel" in window);
    const result = await page.evaluate((options) =>
      (window as unknown as { probeViewModel: ViewModelProbe }).probeViewModel(options), forceWebGL);
    expect(result.webgpu).toBe(!forceWebGL);
    expect(result.world[1]![1]).toBeGreaterThan(100);
    expect(result.narrow[0]).toEqual(result.world[0]);
    const [red, green, blue] = result.narrow[1]!;
    expect(red).toBeGreaterThan(Math.max(green!, blue!) + 80);
    expect(result.wide[1]).toEqual(result.narrow[1]);
    expect(result.narrow[2]).toEqual(result.narrow[1]);
    expect(result.wide[2]).toEqual(result.world[2]);
    expect(result.cleared).toEqual(result.world);
    expect(errors).toEqual([]);
  });
}
