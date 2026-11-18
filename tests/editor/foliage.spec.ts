// The Foliage tab beside Details (plan 5c F5): New Type makes a Foliage Type
// from a model (the Content Browser's create), its fields are the schema's
// form, Undo works in the tab, Save writes the asset and a reopened editor
// reads it back. The project is this run's temporary copy.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { cubeGlb } from "./glb.ts";
import { IDENTITY, openEditor, projectPath, writeLevel } from "./support.ts";

const MODEL = `ast_${"f".repeat(31)}1`;
const TYPE = `ast_${"f".repeat(31)}2`;
const LEVEL = "content/levels/foliage-rules-smoke";
const TERRAIN = `act_${"f".repeat(31)}3`;
const typeFiles = (): string[] => readdirSync(projectPath("content")).filter((name) => name.endsWith(".foliagetype.json"));

test.beforeAll(() => {
  // The model a new type draws (the starter project has none of its own).
  mkdirSync(projectPath("content/foliage-smoke"), { recursive: true });
  writeFileSync(projectPath("content/foliage-smoke/bush.glb"), cubeGlb());
  writeFileSync(projectPath("content/foliage-smoke/bush.glb.meta.json"), JSON.stringify({
    schema: "forge.assetMeta/1", id: MODEL, type: "forge.model@2", license: "CC0-1.0", source: { origin: "foliage tab smoke" },
  }));
  writeFileSync(projectPath("content/foliage-smoke/bush.foliagetype.json"), JSON.stringify({ schema: "forge.foliageType/1", id: TYPE, mesh: MODEL }));
  // A terrain actor without data (nothing draws; its rules are what the tab edits).
  writeLevel(LEVEL, `lvl_${"f".repeat(31)}4`, [
    { id: TERRAIN, name: "Ground", class: null, parent: null, spatiallyLoaded: false, transform: IDENTITY, components: { terrain: { type: "forge.terrain@2", data: null } } },
  ]);
});

const levelRules = (): Array<Record<string, unknown>> => {
  const level = JSON.parse(readFileSync(join(projectPath(LEVEL), "level.json"), "utf8")) as { actors: Array<{ id: string; components: Record<string, { rules?: Array<Record<string, unknown>> }> }> };
  return level.actors.find((actor) => actor.id === TERRAIN)?.components.landscapeFoliage?.rules ?? [];
};

test("Landscape Rules: the component added, rules added / edited / moved / removed as level edits with undo, saved", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL });
  await page.getByTestId("foliage-tab").click();
  const rules = page.getByTestId("foliage-rules");
  await expect(rules).toContainText("Landscape Foliage yok");
  await page.getByTestId("foliage-rule-component").click();
  // The Types list's selection is the new rule's type.
  await page.locator(`[data-testid="foliage-type-row"][data-guid="${TYPE}"]`).click();
  await page.getByTestId("foliage-rule-add").click();
  await page.getByTestId("foliage-rule-add").click();
  await expect(page.getByTestId("foliage-rule-row")).toHaveCount(2);
  await expect(page.getByTestId("foliage-rule-row").first()).toContainText("bush");

  // The selected rule's form: a bounded number is a slider and a box; one edit, one undo step.
  await page.getByTestId("foliage-rule-row").nth(1).click();
  const density = page.getByTestId("foliage-rule-field-density");
  await expect(page.getByTestId("foliage-rule-field-density-slider")).toBeVisible();
  await density.fill("0.05");
  await density.press("Tab");
  await expect(page.getByTestId("foliage-rule-row").nth(1)).toContainText("0.05");
  await page.getByTestId("editor-undo").click();
  await expect(density).toHaveValue("0.25");
  await page.getByTestId("editor-redo").click();
  await expect(density).toHaveValue("0.05");

  // Up moves the edited rule first; Remove takes the other one.
  await page.getByTestId("foliage-rule-up").click();
  await expect(page.getByTestId("foliage-rule-row").first()).toContainText("0.05");
  await page.getByTestId("foliage-rule-row").nth(1).click();
  await page.getByTestId("foliage-rule-remove").click();
  await expect(page.getByTestId("foliage-rule-row")).toHaveCount(1);

  await page.getByTestId("editor-save").click();
  await expect.poll(() => levelRules().map((rule) => [rule.foliageType, rule.density])).toEqual([[TYPE, 0.05]]);
  expect(errors).toEqual([]);
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
