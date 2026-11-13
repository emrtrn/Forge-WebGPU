// The editor UI kit (plan phase 4 step 1, K7) on its development page
// `?editor-kit`: the parameter rules (user rules 2026-10-31) and every field
// kind of a schema form, plus one generated form per engine component.

import { expect, test, type Page } from "@playwright/test";

const SAMPLE = "editorkit.sample";
const field = (page: Page, path: string) => page.getByTestId(`${SAMPLE}-${path}`);
const value = async (page: Page): Promise<Record<string, unknown>> =>
  JSON.parse((await page.getByTestId(`kit-value-${SAMPLE}`).textContent()) ?? "null") as Record<string, unknown>;

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?editor-kit");
  await expect(page.getByTestId(`kit-form-${SAMPLE}`)).toBeVisible();
  // Every engine component gets a generated form.
  expect(await page.locator('[data-testid^="kit-form-"]').count()).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test("a bounded number is a slider + box with its range; out-of-range input is clamped with a Turkish warning", async ({ page }) => {
  const box = field(page, "density");
  const row = page.locator("label.detail-row", { has: box });
  await expect(row.locator(".param-range")).toHaveText("0 – 1");
  await expect(row.locator("span").first()).toHaveAttribute("title", /Sınırlı sayı/);

  await box.fill("5");
  await box.press("Tab");
  await expect(box).toHaveValue("1");
  await expect(field(page, "density-slider")).toHaveValue("1");
  await expect(page.getByTestId("kit-status")).toHaveText("Density 0 – 1 aralığında olmalı; 1 uygulandı.");
  expect((await value(page)).density).toBe(1);

  await field(page, "density-slider").fill("0.5");
  await expect(box).toHaveValue("0.5");
  expect((await value(page)).density).toBe(0.5);
});

test("the slider may travel less than the hard limits; typing still reaches them; open numbers have no slider", async ({ page }) => {
  await expect(field(page, "distance-slider")).toHaveAttribute("max", "50");
  const box = field(page, "distance");
  await box.fill("9000");
  await box.press("Tab");
  await expect(box).toHaveValue("9000");
  expect((await value(page)).distance).toBe(9000);
  await expect(page.getByTestId("kit-status")).toHaveText("");
  await expect(field(page, "open-slider")).toHaveCount(0);

  const floor = field(page, "floor");
  await floor.fill("-3");
  await floor.press("Tab");
  await expect(page.getByTestId("kit-status")).toHaveText("Floor en az 0 olmalı; 0 uygulandı.");
});

test("bool, enum, text pattern, optional colour", async ({ page }) => {
  await field(page, "enabled").uncheck();
  await field(page, "mode").selectOption("linearRamp");
  let current = await value(page);
  expect([current.enabled, current.mode]).toEqual([false, "linearRamp"]);

  const code = field(page, "code");
  await expect(code).toHaveAttribute("aria-invalid", "false");
  await code.fill("bad");
  await expect(code).toHaveAttribute("aria-invalid", "true");

  await expect(field(page, "overlay-clear")).toBeDisabled();
  await field(page, "overlay").fill("#ff0000");
  expect((await value(page)).overlay).toBe("#ff0000");
  await field(page, "overlay-clear").click();
  current = await value(page);
  expect(current.overlay).toBeNull();
  expect(current.tint).toBe("#b8c4d6");
});

test("vectors clamp per axis; a transform's rotation is edited in degrees and stored as a quaternion", async ({ page }) => {
  const x = field(page, "size[0]");
  await x.fill("-3");
  await x.press("Tab");
  await expect(page.getByTestId("kit-status")).toHaveText("Size X en az 0 olmalı; 0 uygulandı.");
  expect((await value(page)).size).toEqual([0, 2, 3]);

  const yaw = field(page, "offset.r[1]");
  await yaw.fill("90");
  await yaw.press("Tab");
  const offset = (await value(page)).offset as { p: number[]; r: number[] };
  expect(offset.p).toEqual([0, 1, 0]);
  expect(offset.r[1]).toBeCloseTo(Math.SQRT1_2, 6);
  expect(offset.r[3]).toBeCloseTo(Math.SQRT1_2, 6);
});

test("references browse and clear; arrays add and remove; nested objects edit in place", async ({ page }) => {
  await page.getByTestId(`kit-form-${SAMPLE}`).locator(".ref-control", { has: field(page, "mesh") }).getByRole("button", { name: "Browse" }).click();
  await expect(field(page, "mesh")).toHaveText("00000000000000000000000000000001");
  await field(page, "mesh-clear").click();
  expect((await value(page)).mesh).toBeNull();

  await field(page, "waypoints-add").click();
  await field(page, "waypoints-add").click();
  expect((await value(page)).waypoints).toEqual([[0, 0, 0], [0, 0, 0]]);
  await field(page, "waypoints[0][1]").fill("4");
  await field(page, "waypoints[0][1]").press("Tab");
  await field(page, "waypoints[1]-remove").click();
  expect((await value(page)).waypoints).toEqual([[0, 4, 0]]);

  const radius = field(page, "wheel.radius");
  await radius.fill("3");
  await radius.press("Tab");
  await expect(page.getByTestId("kit-status")).toHaveText("Radius 0.05 – 2 aralığında olmalı; 2 uygulandı.");
  expect((await value(page)).wheel).toEqual({ radius: 2, steering: false });
});
