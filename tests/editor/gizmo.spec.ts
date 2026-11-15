// The transform gizmo (plan phase 4 step 4; INV-A05, A06, Forge's
// `editor-authoring` gizmo steps): on the one-cube level of the selection
// smoke, the Move gizmo drags the cube along X with the move snap (one undo
// step, undo / redo), a 0.5 m snap step lands on halves, Q / W / E / R and
// Space pick the tool, X toggles World / Local, and End drops a raised cube
// onto the floor; the Rotate ring and Scale axis drag with their snaps
// (step 10). The level is written into this run's temporary project
// copy (never into samples/, D14). The gizmo's handle points come from the
// canvas's `data-forge-gizmo` (client pixels), so the drag aims at the handle
// the gizmo draws.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { drag, dragHandle, gizmoHandles, openEditor, row, shape, writeLevel } from "./support.ts";

const LEVEL = "content/levels/gizmo-smoke";
const CUBE = "act_00112233445566778899aabbccddeeff";

test.beforeAll(() => {
  const actors = [
    {
      id: CUBE,
      name: "Gizmo Cube",
      class: null,
      parent: null,
      spatiallyLoaded: false,
      transform: { p: [0, 1, 0], r: [0, 0, 0, 1], s: [2, 2, 2] },
      components: {
        shape: shape("cube", "#c8c8c8"),
      },
    },
  ];
  writeLevel(LEVEL, "lvl_00112233445566778899aabbccddeeff", actors);
});

test("the move gizmo drags with snap and one undo step; tool keys, World / Local and snap to floor", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  const canvas = page.getByTestId("forge-canvas");
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

/**
 * Drags the Y (yaw) ring along itself. Each ring's grab point is where it crosses another ring
 * (rotate:y at local +Z, on the X ring too; rotate:z at local +X, on the Y ring too), so the drag
 * starts halfway between them on the Y ring alone and moves along its tangent there.
 */
async function dragYawRing(page: Page, canvas: Locator, pixels: number): Promise<void> {
  const points = await gizmoHandles(canvas);
  const [ox, oy] = points.origin!;
  const [ax, ay] = [points["rotate:z"]![0] - ox, points["rotate:z"]![1] - oy];
  const [bx, by] = [points["rotate:y"]![0] - ox, points["rotate:y"]![1] - oy];
  const start: [number, number] = [ox + (ax + bx) / Math.SQRT2, oy + (ay + by) / Math.SQRT2];
  const [tx, ty] = [bx - ax, by - ay];
  const length = Math.hypot(tx, ty);
  await drag(page, start, [(tx / length) * pixels, (ty / length) * pixels]);
}

// Forge's editor-viewport-panel smoke dragged the move and scale gizmos; here the Rotate ring and
// the Scale axis too, each with its snap (15°, 0.1) and one undo step.
test("the Rotate and Scale gizmos drag with their snaps, one undo step each", async ({ page }) => {
  const errors = await openEditor(page, { level: LEVEL, drawn: true });
  const canvas = page.getByTestId("forge-canvas");
  await row(page, CUBE).click();
  for (let notch = 0; notch < 4; notch += 1) await page.mouse.wheel(0, 300);
  const yaw = page.getByTestId("detail-transform.r[1]");
  const sx = page.getByTestId("detail-transform.s[0]");
  const sy = page.getByTestId("detail-transform.s[1]");
  await expect(yaw).toHaveValue("0");
  await expect(sx).toHaveValue("2");

  await page.locator("body").press("KeyE");
  await expect(page.getByTestId("tool-rotate")).toHaveAttribute("aria-pressed", "true");
  // The handle points follow the tool on the next frame.
  await expect(canvas).toHaveAttribute("data-forge-gizmo", /rotate:y/);
  await dragYawRing(page, canvas, 160);
  await expect(yaw).not.toHaveValue("0");
  const turned = Number(await yaw.inputValue());
  expect(Math.abs(Math.round(turned / 15) * 15 - turned)).toBeLessThan(0.01);
  await page.getByTestId("editor-undo").click();
  await expect(yaw).toHaveValue("0");
  await page.getByTestId("editor-redo").click();
  await expect(yaw).toHaveValue(String(turned));

  await page.locator("body").press("KeyR");
  await expect(page.getByTestId("tool-scale")).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("data-forge-gizmo", /scale:x/);
  await dragHandle(page, canvas, "scale:x", 120);
  await expect(sx).not.toHaveValue("2");
  const scaled = Number(await sx.inputValue());
  expect(Math.abs(Math.round(scaled * 10) - scaled * 10)).toBeLessThan(0.001);
  await expect(sy).toHaveValue("2");
  await page.getByTestId("editor-undo").click();
  await expect(sx).toHaveValue("2");
  await expect(yaw).toHaveValue(String(turned));
  expect(errors).toEqual([]);
});
