// The transform gizmo (plan phase 4 step 4; INV-A05, A06, Forge's
// `editor-authoring` gizmo steps): on the one-cube level of the selection
// smoke, the Move gizmo drags the cube along X with the move snap (one undo
// step, undo / redo), a 0.5 m snap step lands on halves, Q / W / E / R and
// Space pick the tool, X toggles World / Local, and End drops a raised cube
// onto the floor. The level is written into this run's temporary project
// copy (never into samples/, D14). The gizmo's handle points come from the
// canvas's `data-forge-gizmo` (client pixels), so the drag aims at the handle
// the gizmo draws.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const LEVEL = "content/levels/gizmo-smoke";
const CUBE = "act_00112233445566778899aabbccddeeff";
const query = (): string => `/?editor&level=${encodeURIComponent(LEVEL)}${process.env.FORGE_EDITOR_WEBGPU === "1" ? "" : "&forceWebGL"}`;

test.beforeAll(() => {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) throw new Error("FORGE_EDITOR_SMOKE_PROJECT is not set (the editor smoke config sets it).");
  const folder = join(project, ...LEVEL.split("/"));
  mkdirSync(folder, { recursive: true });
  const identity = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
  const level = {
    schema: "forge.level/1",
    id: "lvl_00112233445566778899aabbccddeeff",
    settings: { cellSize: 128 },
    actors: [
      {
        id: CUBE,
        name: "Gizmo Cube",
        class: null,
        parent: null,
        spatiallyLoaded: false,
        transform: { p: [0, 1, 0], r: [0, 0, 0, 1], s: [2, 2, 2] },
        components: {
          shape: { type: "forge.shape@2", parent: null, local: identity, primitive: "cube", color: "#c8c8c8", castShadow: true, collision: true },
        },
      },
    ],
  };
  writeFileSync(join(folder, "level.json"), `${JSON.stringify(level, null, 2)}\n`);
});

type Points = Record<string, [number, number]>;

async function handles(canvas: Locator): Promise<Points> {
  await expect(canvas).toHaveAttribute("data-forge-gizmo", /origin/);
  return JSON.parse((await canvas.getAttribute("data-forge-gizmo"))!) as Points;
}

/** Drags a handle `pixels` further along the line from the gizmo's origin through it. */
async function dragHandle(page: Page, canvas: Locator, handle: string, pixels: number): Promise<void> {
  const points = await handles(canvas);
  const [ox, oy] = points.origin!;
  const [hx, hy] = points[handle]!;
  const length = Math.hypot(hx - ox, hy - oy);
  const [dx, dy] = [((hx - ox) / length) * pixels, ((hy - oy) / length) * pixels];
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(hx + (dx * step) / 10, hy + (dy * step) / 10);
  await page.mouse.up();
}

test("the move gizmo drags with snap and one undo step; tool keys, World / Local and snap to floor", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(query());
  await expect(page.getByTestId("forge-editor")).toHaveAttribute("data-editor-ready", "1", { timeout: 60_000 });
  const canvas = page.getByTestId("forge-canvas");
  await expect(canvas).toHaveAttribute("data-forge-ready", "1", { timeout: 60_000 });
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(`[data-testid="outliner-row"][data-actor-id="${CUBE}"]`)).toHaveClass(/active/);
  // Step back from the default framing (the cube fills the view), so the gizmo stays on screen as the cube moves.
  for (let notch = 0; notch < 4; notch += 1) await page.mouse.wheel(0, 300);

  // Move is Forge's default tool; the move snap is on at 1 m.
  await expect(page.getByTestId("tool-move")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("snap-move-toggle")).toBeChecked();
  const x = page.getByTestId("detail-transform.p[0]");
  const y = page.getByTestId("detail-transform.p[1]");
  await dragHandle(page, canvas, "move:x", 300);
  await expect(x).not.toHaveValue("0");
  const moved = Number(await x.inputValue());
  expect(moved).toBeGreaterThanOrEqual(1);
  expect(Number.isInteger(moved)).toBe(true);
  await expect(y).toHaveValue("1");

  // One drag, one undo step.
  await page.getByTestId("editor-undo").click();
  await expect(x).toHaveValue("0");
  await expect(page.getByTestId("editor-undo")).toBeDisabled();
  await page.getByTestId("editor-redo").click();
  await expect(x).toHaveValue(String(moved));

  // A 0.5 m step lands the drag on a half.
  await page.getByTestId("snap-move").selectOption("0.5");
  await dragHandle(page, canvas, "move:x", -200);
  const halved = Number(await x.inputValue());
  expect(halved).not.toBe(moved);
  expect(Number.isInteger(halved * 2)).toBe(true);

  // Tool keys and World / Local.
  await page.locator("body").press("KeyE");
  await expect(page.getByTestId("tool-rotate")).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("data-forge-gizmo", /rotate:y/);
  await page.locator("body").press("KeyR");
  await expect(page.getByTestId("tool-scale")).toHaveAttribute("aria-pressed", "true");
  await page.locator("body").press("Space");
  await expect(page.getByTestId("tool-move")).toHaveAttribute("aria-pressed", "true");
  await page.locator("body").press("KeyQ");
  await expect(page.getByTestId("tool-select")).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).not.toHaveAttribute("data-forge-gizmo", /.+/);
  await page.locator("body").press("KeyW");
  await expect(page.getByTestId("transform-space")).toHaveAttribute("aria-label", "World space");
  await page.locator("body").press("KeyX");
  await expect(page.getByTestId("transform-space")).toHaveAttribute("aria-label", "Local space");
  await page.locator("body").press("KeyX");

  // Raise the cube with the Y handle, then End drops it onto the floor: a shape solid is 0.5 m at
  // scale 1, so this 1 m cube rests at y = 0.5 (the level put it half a metre up).
  await dragHandle(page, canvas, "move:y", 200);
  const raised = Number(await y.inputValue());
  expect(raised).toBeGreaterThan(1);
  await page.locator("body").press("End");
  await expect(y).toHaveValue("0.5");
  await expect(page.getByTestId("editor-status")).toHaveText("Snapped to floor");
  await page.getByTestId("editor-undo").click();
  await expect(y).toHaveValue(String(raised));
  expect(errors).toEqual([]);
});
