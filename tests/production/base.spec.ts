// A production build under a sub folder (F06): the game opens its start level
// from the build's static content, every request stays under the base path,
// nothing goes to the dev server's endpoints, and the editor is not there.

import { expect, test } from "@playwright/test";

const BASE = "/forge-base/";

test("the build opens its start level under a sub folder, reading only from it", async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" || url.protocol === "https:") requests.push(url.pathname);
  });
  await page.goto(`${BASE}?forceWebGL`);
  const ready = page.locator("canvas[data-forge-ready='1']");
  const bootError = page.getByTestId("boot-error");
  await expect(ready.or(bootError)).toBeVisible({ timeout: 90_000 });
  expect(await bootError.isVisible() ? await bootError.innerText() : "").toBe("");
  await expect(ready).toHaveAttribute("data-forge-resource-errors", "0");

  expect(requests.filter((path) => !path.startsWith(BASE))).toEqual([]);
  expect(requests.filter((path) => path.includes("/__forge/"))).toEqual([]);
  expect(requests.some((path) => path.endsWith("/forge/files/project/content/levels/main/level.json"))).toBe(true);
  expect(errors).toEqual([]);

  // The editor is a development page: a build has none.
  await page.goto(`${BASE}?editor&forceWebGL`);
  await expect(page.getByTestId("forge-editor")).toHaveCount(0);
});
