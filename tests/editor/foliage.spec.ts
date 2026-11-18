// The Foliage tab beside Details (plan 5c F5): New Type makes a Foliage Type
// from a model (the Content Browser's create), its fields are the schema's
// form, Undo works in the tab, Save writes the asset and a reopened editor
// reads it back. The project is this run's temporary copy.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { cubeGlb } from "./glb.ts";
import { openEditor, projectPath } from "./support.ts";

const MODEL = `ast_${"f".repeat(31)}1`;
const typeFiles = (): string[] => readdirSync(projectPath("content")).filter((name) => name.endsWith(".foliagetype.json"));

test.beforeAll(() => {
  // The model a new type draws (the starter project has none of its own).
  mkdirSync(projectPath("content/foliage-smoke"), { recursive: true });
  writeFileSync(projectPath("content/foliage-smoke/bush.glb"), cubeGlb());
  writeFileSync(projectPath("content/foliage-smoke/bush.glb.meta.json"), JSON.stringify({
    schema: "forge.assetMeta/1", id: MODEL, type: "forge.model@2", license: "CC0-1.0", source: { origin: "foliage tab smoke" },
  }));
});

test("Foliage tab: a new type from a model, edited, undone, saved and read again", async ({ page }) => {
  const errors = await openEditor(page);
  await page.getByTestId("foliage-tab").click();
  await expect(page.getByTestId("foliage-panel")).toBeVisible();
  await expect(page.getByTestId("foliage-tab")).toHaveAttribute("aria-selected", "true");
  const before = typeFiles();

  page.on("dialog", (dialog) => void dialog.accept("Smoke Grass"));
  await page.getByTestId("foliage-type-new").click();
  await page.locator(`[data-testid="foliage-picker-item"][data-id="${MODEL}"]`).click();
  const row = page.locator('[data-testid="foliage-type-row"]', { hasText: "Smoke Grass" });
  await expect(row).toHaveAttribute("aria-selected", "true");
  const created = typeFiles().filter((name) => !before.includes(name));
  expect(created).toHaveLength(1);
  const file = join(projectPath("content"), created[0]!);
  expect(JSON.parse(readFileSync(file, "utf8")).mesh).toBe(MODEL);

  // A bounded number is a slider and a box (editor parameter rules); the hint is Turkish.
  const cullEnd = page.getByTestId("foliage-field-cullEnd");
  await expect(page.getByTestId("foliage-field-cullEnd-slider")).toBeVisible();
  await cullEnd.fill("240");
  await cullEnd.press("Tab");
  await expect(row).toContainText("*");
  await page.getByTestId("foliage-type-undo").click();
  await expect(cullEnd).toHaveValue("0");
  await page.getByTestId("foliage-type-redo").click();
  await expect(cullEnd).toHaveValue("240");
  await page.getByTestId("foliage-type-save").click();
  await expect(row).not.toContainText("*");
  await expect.poll(() => JSON.parse(readFileSync(file, "utf8")).cullEnd).toBe(240);

  // Reopened: the tab lists the type and its form reads the saved value.
  await page.reload();
  await expect(page.getByTestId("forge-editor")).toBeVisible();
  await page.getByTestId("foliage-tab").click();
  await page.locator('[data-testid="foliage-type-row"]', { hasText: "Smoke Grass" }).click();
  await expect(page.getByTestId("foliage-field-cullEnd")).toHaveValue("240");
  // Details is one click away.
  await page.getByTestId("details-tab").click();
  await expect(page.getByTestId("foliage-panel")).toBeHidden();
  expect(errors).toEqual([]);
});
