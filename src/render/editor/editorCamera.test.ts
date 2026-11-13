import { Box3, Vector3 } from "three/webgpu";
import { describe, expect, test } from "vitest";
import { createEditorCamera, type CameraPointer, type CameraSurface } from "./editorCamera.ts";

const surface = (): CameraSurface & { captured: Set<number> } => {
  const captured = new Set<number>();
  return {
    captured,
    style: { cursor: "" },
    setPointerCapture: (id) => void captured.add(id),
    releasePointerCapture: (id) => void captured.delete(id),
    hasPointerCapture: (id) => captured.has(id),
  };
};

const pointer = (fields: Partial<CameraPointer>): CameraPointer => ({
  pointerId: 1,
  button: 0,
  movementX: 0,
  movementY: 0,
  altKey: false,
  preventDefault: () => {},
  ...fields,
});

function camera(selection: Vector3 | null = null) {
  const editor = createEditorCamera({ fov: 44, near: 0.1, far: 2000, selectionCentre: () => selection });
  editor.perspective.position.set(0, 5, 10);
  editor.perspective.lookAt(0, 0, 0);
  editor.perspective.updateMatrixWorld();
  editor.syncAngles();
  editor.resize(1600, 900);
  return editor;
}

const close = (a: Vector3, b: Vector3, digits = 5): void => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
  expect(a.z).toBeCloseTo(b.z, digits);
};

describe("the editor camera (Forge's EditorCameraController and presets, plan phase 4 step 3)", () => {
  test("Top is orthographic, looks straight down at the ground point under the view, north up", () => {
    const editor = camera();
    editor.setView("top");
    expect(editor.view).toBe("top");
    const active = editor.active();
    expect(active).toBe(editor.orthographic);
    close(active.getWorldDirection(new Vector3()), new Vector3(0, -1, 0));
    // The view ray meets y = 0 at the origin; the camera stands well back so nothing tall is cut.
    close(active.position, new Vector3(0, 1000, 0));
    close(active.up, new Vector3(0, 0, -1));
    // Forge's view height: clamp(distance (clamped 3..10) * 1.8, 3, 80); the distance here is clamped to 10.
    expect(editor.orthographic.top - editor.orthographic.bottom).toBeCloseTo(18);
    expect((editor.orthographic.right - editor.orthographic.left) / (editor.orthographic.top - editor.orthographic.bottom)).toBeCloseTo(1600 / 900);
  });

  test("Front and Left look along -Z and -X; Perspective comes back as a 3/4 view of the target", () => {
    const editor = camera(new Vector3(2, 1, 3));
    editor.setView("front");
    close(editor.active().getWorldDirection(new Vector3()), new Vector3(0, 0, -1));
    editor.setView("left");
    close(editor.active().getWorldDirection(new Vector3()), new Vector3(-1, 0, 0));
    editor.setView("perspective");
    const active = editor.active();
    expect(active).toBe(editor.perspective);
    // The orthographic camera stood 1000 m away: the distance clamps to 12 (Forge's 4..12).
    close(active.position, new Vector3(2 + 12 * 0.7, 1 + 12 * 0.6, 3 + 12 * 0.7));
    const toTarget = new Vector3(2, 1, 3).sub(active.position).normalize();
    close(active.getWorldDirection(new Vector3()), toTarget);
  });

  test("a right-drag flies: W moves along the ground facing at the fly speed; keys do nothing without it", () => {
    const editor = camera();
    const canvas = surface();
    expect(editor.key("KeyW", true)).toBe(false);
    expect(editor.update(1)).toBe(false);
    expect(editor.pointerDown(pointer({ button: 2 }), canvas)).toBe(true);
    expect(editor.navigating).toBe(true);
    expect(canvas.captured.has(1)).toBe(true);
    expect(editor.key("KeyW", true)).toBe(true);
    const before = editor.perspective.position.clone();
    expect(editor.update(1)).toBe(true);
    // Looking down at the origin from (0, 5, 10): the ground facing is -Z; 5.5 m/s.
    close(editor.perspective.position, before.add(new Vector3(0, 0, -5.5)));
    editor.wheel(-100);
    expect(editor.speed).toBeCloseTo(5.5 * 1.15);
    editor.pointerUp(pointer({ button: 2 }), canvas);
    expect(editor.navigating).toBe(false);
    expect(editor.update(1)).toBe(false);
  });

  test("Alt + left-drag orbits the target at a constant distance; the wheel dollies, an orthographic view zooms", () => {
    const editor = camera(new Vector3(0, 0, 0));
    const canvas = surface();
    expect(editor.pointerDown(pointer({ altKey: true, button: 0 }), canvas)).toBe(true);
    expect(editor.dragging).toBe(true);
    const distance = editor.perspective.position.length();
    editor.pointerMove(pointer({ movementX: 120, movementY: -40 }));
    expect(editor.perspective.position.length()).toBeCloseTo(distance);
    close(editor.perspective.getWorldDirection(new Vector3()), editor.perspective.position.clone().negate().normalize());
    editor.pointerUp(pointer({}), canvas);
    expect(editor.dragging).toBe(false);

    const at = editor.perspective.position.length();
    editor.wheel(-100);
    expect(editor.perspective.position.length()).toBeCloseTo(at - 1.8);
    editor.setView("top");
    editor.wheel(-100);
    expect(editor.orthographic.zoom).toBeCloseTo(1.1);
  });

  test("a plain left press is not the camera's (selection); right-drag in an orthographic view does not fly", () => {
    const editor = camera();
    const canvas = surface();
    expect(editor.pointerDown(pointer({ button: 0 }), canvas)).toBe(false);
    editor.setView("top");
    expect(editor.pointerDown(pointer({ button: 2 }), canvas)).toBe(true);
    expect(editor.navigating).toBe(false);
  });

  test("focus frames a box along the view direction and backs off for a large one", () => {
    const editor = camera();
    const small = new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));
    editor.focus(small, new Vector3());
    const centre = new Vector3(0, 0.5, 0);
    const radius = small.getSize(new Vector3()).length() * 0.5;
    expect(editor.perspective.position.distanceTo(centre)).toBeCloseTo(Math.max(1.25, radius * 1.8));
    const large = new Box3(new Vector3(-50, 0, -50), new Vector3(50, 20, 50));
    editor.focus(large, new Vector3());
    const largeRadius = large.getSize(new Vector3()).length() * 0.5;
    expect(editor.perspective.position.distanceTo(new Vector3(0, 10, 0))).toBeCloseTo(largeRadius * 1.8);
    expect(editor.touched).toBe(true);
  });
});
