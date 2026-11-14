// The gizmo's drag math (plan phase 4 step 4). Rewrites of Forge WebGL's
// tools/engine-tests.ts section 8 ("Gizmo transform-drag math") and its pivot
// check @ forge-webgl-final, against the three-free module: the same
// intents, with the axis handles following the pointer ray instead of the
// floor plane and rotations as quaternions (transformDrag.ts says why).
import assert from "node:assert/strict";
import { test } from "vitest";
import type { Transform, Vec3 } from "../../core/index.ts";
import { IDENTITY_MAT4, type Quat } from "../math/affine.ts";
import { eulerDegreesToQuaternion } from "../math/euler.ts";
import type { GizmoHandle } from "./axes.ts";
import { beginDrag, dragTo, type DragTarget } from "./dragSession.ts";
import { DEFAULT_SNAP, type SnapSettings } from "./snap.ts";
import { pivotCorrectedPosition, rotateDragDegrees, scaleDragScale, type Ray } from "./transformDrag.ts";

const snapOff: SnapSettings = { ...DEFAULT_SNAP, moveEnabled: false, rotateEnabled: false, scaleEnabled: false };
const down = (x: number, z: number): Ray => ({ origin: [x, 10, z], direction: [0, -1, 0] });
const ahead = (x: number, y: number): Ray => ({ origin: [x, y, 10], direction: [0, 0, -1] });

function target(p: Vec3, r: Quat = [0, 0, 0, 1]): DragTarget {
  return { id: "act_a", transform: { p, r, s: [1, 1, 1] }, parentWorld: IDENTITY_MAT4, pivot: [0, 0, 0] };
}

function moved(handle: GizmoHandle, from: DragTarget, press: Ray, to: Ray, snap = snapOff, space: "world" | "local" = "world"): Transform {
  const drag = beginDrag({ handle, space, targets: [from], ray: press, clientX: 0, clientY: 0, viewDirection: [0, 0, -1] });
  const result = dragTo(drag, to, 0, 0, snap);
  assert.ok(result);
  return result.transforms.get(from.id)!;
}

function closeTo(actual: readonly number[], expected: readonly number[], what: string): void {
  assert.equal(actual.length, expected.length, what);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]!) < 1e-6, `${what}: ${actual.join(", ")} != ${expected.join(", ")}`));
}

// Rewritten from Forge "free move drag offsets the start position along the camera basis".
test("free move drag offsets the start position on the plane facing the camera", () => {
  // The pointer travels 0.5 right and 0.3 up on the camera's plane through the gizmo.
  assert.deepEqual(moved({ tool: "move", axis: "xyz" }, target([0, 0, 0]), ahead(0, 0), ahead(0.5, 0.3)).p, [0.5, 0.3, 0]);
});

// Rewritten from Forge "world axis move sets only the dragged axis from the floor hit + offset".
test("world axis move sets only the dragged axis, from the axis point under the pointer + the grab offset", () => {
  // Grabbed 0.2 m along the handle; the pointer also strays in z, which the x handle ignores.
  const result = moved({ tool: "move", axis: "x" }, target([1, 2, 3]), down(1.2, 3), down(5.4, 7));
  assert.deepEqual(result.p, [5.2, 2, 3]);
  // With the move snap on, the dragged coordinate lands on the grid.
  assert.deepEqual(moved({ tool: "move", axis: "x" }, target([1, 2, 3]), down(1.2, 3), down(5.4, 7), DEFAULT_SNAP).p, [5, 2, 3]);
});

// Rewritten from Forge "vertical move drag changes height only, keeping base x/z".
test("vertical move drag changes height only, keeping x / z", () => {
  assert.deepEqual(moved({ tool: "move", axis: "y" }, target([1, 2, 3]), ahead(1, 2), ahead(1.7, 2.5)).p, [1, 2.5, 3]);
});

// Rewritten from Forge "plane move drag applies the world delta from the plane hit".
test("plane move drag applies the world delta from the plane hit, snapping only the plane's axes", () => {
  assert.deepEqual(moved({ tool: "move", axis: "xz" }, target([0, 0, 0]), down(0, 0), down(1.5, -2)).p, [1.5, 0, -2]);
  // Forge snapped the left-out axis too: a model 0.3 m up fell to the grid.
  assert.deepEqual(moved({ tool: "move", axis: "xz" }, target([0, 0.3, 0]), down(0, 0), down(1.4, -2.2), DEFAULT_SNAP).p, [1, 0.3, -2]);
});

// Rewritten from Forge "local axis move projects onto the object heading (90deg turns +x into -z)".
test("local axis move follows the object's own axis (90° about Y turns +x into -z)", () => {
  const turned = target([0, 0, 0], eulerDegreesToQuaternion([0, 90, 0]));
  // The pointer's world-x travel is across the handle and ignored; it slides along world -z.
  assert.deepEqual(moved({ tool: "move", axis: "x" }, turned, down(0, 0), down(4, -3), snapOff, "local").p, [0, 0, -3]);
});

// Rewritten from Forge "rotate drag turns the horizontal pointer delta into degrees (and snaps)".
test("rotate drag turns the horizontal pointer delta into degrees (and snaps)", () => {
  assert.equal(rotateDragDegrees(20, snapOff), 10);
  assert.equal(rotateDragDegrees(20, DEFAULT_SNAP), 15);
  const drag = beginDrag({ handle: { tool: "rotate", axis: "y" }, space: "world", targets: [target([0, 0, 0])], ray: down(0, 0), clientX: 0, clientY: 0, viewDirection: [0, 0, -1] });
  const result = dragTo(drag, down(0, 0), 20, 40, DEFAULT_SNAP);
  closeTo(result!.transforms.get("act_a")!.r, eulerDegreesToQuaternion([0, 15, 0]), "15° about Y");
});

// Rewritten from Forge "scale drag handles uniform, single-axis, planar, and the 0.05 floor".
test("scale drag handles uniform, single-axis, planar, and the 0.05 floor", () => {
  assert.deepEqual(scaleDragScale("uniform", [1, 1, 1], 100, 0, snapOff), [1.5, 1.5, 1.5]);
  assert.deepEqual(scaleDragScale("x", [1, 1, 1], 100, 0, snapOff), [1.5, 1, 1]);
  assert.deepEqual(scaleDragScale("xy", [1, 1, 1], 100, 0, snapOff), [1.5, 1.5, 1]);
  // A large shrink stops every axis at the 0.05 minimum.
  assert.deepEqual(scaleDragScale("uniform", [1, 1, 1], 0, 1000, snapOff), [0.05, 0.05, 0.05]);
});

// Rewritten from Forge "pivot-corrected position keeps the pivot world point fixed".
test("pivot-corrected position keeps the pivot's point fixed", () => {
  // No rotation, unit scale, origin pivot: the origin is the pivot's point.
  assert.deepEqual(pivotCorrectedPosition([1, 2, 3], [0, 0, 0, 1], [1, 1, 1], [0, 0, 0]), [1, 2, 3]);
  // 90° about Y turns local +x into world -z, so a [1, 0, 0] pivot shifts the
  // origin by +1 along z to keep the pivot's point (5, 0, 5) fixed.
  assert.deepEqual(pivotCorrectedPosition([5, 0, 5], eulerDegreesToQuaternion([0, 90, 0]), [1, 1, 1], [1, 0, 0]), [5, 0, 6]);
});

test("a pointer ray that runs along the axis or misses the plane gives no position", () => {
  const axis = beginDrag({ handle: { tool: "move", axis: "y" }, space: "world", targets: [target([0, 0, 0])], ray: ahead(0, 0), clientX: 0, clientY: 0, viewDirection: [0, 0, -1] });
  assert.equal(dragTo(axis, down(0, 0), 0, 0, snapOff), null);
  const plane = beginDrag({ handle: { tool: "move", axis: "xz" }, space: "world", targets: [target([0, 0, 0])], ray: down(0, 0), clientX: 0, clientY: 0, viewDirection: [0, 0, -1] });
  assert.equal(dragTo(plane, { origin: [0, 10, 0], direction: [0, 1, 0] }, 0, 0, snapOff), null);
});
