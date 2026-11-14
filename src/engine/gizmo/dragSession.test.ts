// A gizmo drag over a selection (plan phase 4 step 4): several actors move
// and turn as one, a child's result is in its parent's space, the pivot
// stays put, pivot editing moves only the pivot.
import assert from "node:assert/strict";
import { test } from "vitest";
import type { ActorId, Transform, Vec3 } from "../../core/index.ts";
import { composeMat4, IDENTITY_MAT4, multiplyMat4, transformPoint } from "../math/affine.ts";
import { eulerDegreesToQuaternion } from "../math/euler.ts";
import { beginDrag, dragRoots, dragTo, gizmoFrame, parentWorldMatrix, type DragTarget } from "./dragSession.ts";
import { DEFAULT_SNAP } from "./snap.ts";
import type { Ray } from "./transformDrag.ts";

const snapOff = { ...DEFAULT_SNAP, moveEnabled: false, rotateEnabled: false, scaleEnabled: false };
const down = (x: number, z: number): Ray => ({ origin: [x, 10, z], direction: [0, -1, 0] });

function at(id: ActorId, p: Vec3, extra: Partial<DragTarget> = {}): DragTarget {
  return { id, transform: { p, r: [0, 0, 0, 1], s: [1, 1, 1] }, parentWorld: IDENTITY_MAT4, pivot: [0, 0, 0], ...extra };
}

function near(actual: readonly number[], expected: readonly number[], what: string): void {
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]!) < 1e-6, `${what}: ${actual.join(", ")} != ${expected.join(", ")}`));
}

test("a multi-selection moves by one world delta", () => {
  const targets = [at("act_a", [0, 0, 0]), at("act_b", [3, 1, -2])];
  const drag = beginDrag({ handle: { tool: "move", axis: "x" }, space: "world", targets, ray: down(0, 0), clientX: 0, clientY: 0, viewDirection: [0, 0, -1] });
  const result = dragTo(drag, down(2, 5), 0, 0, snapOff)!;
  assert.deepEqual(result.transforms.get("act_a")!.p, [2, 0, 0]);
  assert.deepEqual(result.transforms.get("act_b")!.p, [5, 1, -2]);
  assert.equal(result.pivot, null);
});

test("a child's new transform is in its parent's space", () => {
  // The parent is at (10, 0, 0), turned 90° about Y: its local +x is world -z.
  const parent: Transform = { p: [10, 0, 0], r: eulerDegreesToQuaternion([0, 90, 0]), s: [1, 1, 1] };
  const parentWorld = parentWorldMatrix((id) => (id === "act_p" ? { parent: null, transform: parent } : undefined), "act_p");
  const child = at("act_c", [1, 0, 0], { parentWorld });
  // Its world position is (10, 0, -1); drag the world x handle 2 m.
  near(transformPoint(parentWorld, child.transform.p), [10, 0, -1], "child in the world");
  const drag = beginDrag({ handle: { tool: "move", axis: "x" }, space: "world", targets: [child], ray: down(10, -1), clientX: 0, clientY: 0, viewDirection: [0, 0, -1] });
  const moved = dragTo(drag, down(12, -1), 0, 0, snapOff)!.transforms.get("act_c")!;
  // World +x is the parent's local +z.
  near(moved.p, [1, 0, 2], "child in its parent");
  near(transformPoint(multiplyMat4(parentWorld, composeMat4(moved.p, moved.r, moved.s)), [0, 0, 0]), [12, 0, -1], "child moved in the world");
});

test("rotating a multi-selection turns it as one about the primary's pivot", () => {
  const primary = at("act_a", [0, 0, 0], { pivot: [1, 0, 0] });
  const other = at("act_b", [1, 0, 2]);
  // The gizmo stands on the primary's pivot point (1, 0, 0).
  assert.deepEqual(gizmoFrame(primary, "rotate", "world").origin, [1, 0, 0]);
  const drag = beginDrag({ handle: { tool: "rotate", axis: "y" }, space: "world", targets: [primary, other], ray: down(0, 0), clientX: 0, clientY: 0, viewDirection: [0, 0, -1] });
  const result = dragTo(drag, down(0, 0), 180, 0, snapOff)!; // 90°
  const a = result.transforms.get("act_a")!;
  const b = result.transforms.get("act_b")!;
  // 90° about Y round (1, 0, 0): the primary's origin swings to (1, 0, 1), its pivot stays.
  near(a.p, [1, 0, 1], "primary origin");
  near(transformPoint(composeMat4(a.p, a.r, a.s), [1, 0, 0]), [1, 0, 0], "primary pivot");
  near(b.p, [3, 0, 0], "other orbits");
  near(b.r, eulerDegreesToQuaternion([0, 90, 0]), "other turns");
});

test("scaling keeps each target's pivot point", () => {
  const target = at("act_a", [0, 0, 0], { pivot: [0, -1, 0] });
  const drag = beginDrag({ handle: { tool: "scale", axis: "uniform" }, space: "world", targets: [target], ray: down(0, 0), clientX: 0, clientY: 0, viewDirection: [0, 0, -1] });
  const scaled = dragTo(drag, down(0, 0), 200, 0, snapOff)!.transforms.get("act_a")!;
  assert.deepEqual(scaled.s, [2, 2, 2]);
  // The pivot's point (0, -1, 0) stays: the origin rises to y = 1.
  assert.deepEqual(scaled.p, [0, 1, 0]);
});

test("pivot editing moves the pivot, not the actor", () => {
  const target = at("act_a", [2, 0, 0], { transform: { p: [2, 0, 0], r: eulerDegreesToQuaternion([0, 90, 0]), s: [2, 2, 2] } });
  const drag = beginDrag({ handle: { tool: "move", axis: "x" }, space: "world", targets: [target], ray: down(2, 0), clientX: 0, clientY: 0, viewDirection: [0, 0, -1], pivotEdit: true });
  const result = dragTo(drag, down(3, 0), 0, 0, snapOff)!;
  assert.equal(result.transforms.size, 0);
  // World +1 x is local +z under 90° about Y, halved by the scale of 2.
  near(result.pivot!, [0, 0, 0.5], "local pivot");
});

test("a drag carries the selected roots: a child of a selected actor follows its parent", () => {
  const parents: Record<ActorId, ActorId | null> = { act_a: null, act_b: "act_a", act_c: "act_b", act_d: null };
  assert.deepEqual(dragRoots(["act_c", "act_a", "act_d"], (id) => parents[id]), ["act_a", "act_d"]);
  assert.deepEqual(dragRoots(["act_c", "act_d"], (id) => parents[id]), ["act_c", "act_d"]);
});
