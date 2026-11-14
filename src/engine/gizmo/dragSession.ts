// One gizmo drag over the selection, three-free (plan phase 4 step 4,
// decision 2; Forge WebGL's createGizmoPointerDrag and SceneApp's
// update*Drag @ forge-webgl-final, INV-A05).
//
// - The targets are the selected actors, the primary first, none a
//   descendant of another (a child moves with its parent). Each comes with its
//   document transform (relative to its parent), its parent's world matrix and
//   its pivot.
// - The gizmo stands on the primary's pivot point, aligned to the world or,
//   in local space, to the primary; the scale gizmo is always local (scale is
//   a local quantity, as in Unreal).
// - Move: the primary's world position follows the handle (snapped), every
//   target moves by the same world delta. Rotate: every target turns by the
//   same world rotation about the gizmo's point (the primary's pivot), so its
//   pivot stays put and a multi-selection turns as one. Scale: each target
//   scales its own axes and keeps its own pivot's point.
// - Pivot editing (Forge's pivot edit mode): the move handles carry the
//   primary's pivot point; the actor stays put and the result is its new
//   local pivot.
// - A result is the targets' new document transforms (back in their parents'
//   space), always computed from the drag's start, so nothing accumulates.

import type { ActorId, Transform, Vec3 } from "../../core/index.ts";
import {
  composeMat4,
  IDENTITY_MAT4,
  IDENTITY_QUAT,
  invertMat4,
  invertQuat,
  multiplyMat4,
  multiplyQuat,
  normalizeQuat,
  rotate,
  rotationOf,
  sub,
  transformPoint,
  type Mat4,
  type Quat,
} from "../math/affine.ts";
import { axisToIndex, isPlaneAxis, planeAxisNormal, UNIT_AXES, type GizmoHandle, type TransformSpace } from "./axes.ts";
import { round, type SnapSettings } from "./snap.ts";
import {
  axisMovePosition,
  axisParameter,
  movedAxes,
  orbit,
  pivotCorrectedPosition,
  planeMovePosition,
  rayPlane,
  rotateDragDegrees,
  scaleDragScale,
  type Ray,
} from "./transformDrag.ts";

export interface DragTarget {
  readonly id: ActorId;
  /** As the document holds it: relative to the parent. */
  readonly transform: Transform;
  /** The parent's world matrix; the identity for a root actor. */
  readonly parentWorld: Mat4;
  /** Local authoring pivot; the origin when it has none. */
  readonly pivot: Vec3;
}

/** Where the gizmo stands and how it is turned. */
export interface GizmoFrame {
  readonly origin: Vec3;
  readonly rotation: Quat;
}

export interface DragStart {
  readonly handle: GizmoHandle;
  readonly space: TransformSpace;
  /** The primary first; none a descendant of another. */
  readonly targets: readonly DragTarget[];
  /** The pointer's ray at the press. */
  readonly ray: Ray;
  readonly clientX: number;
  readonly clientY: number;
  /** The camera's forward direction: the free handle's plane faces it. */
  readonly viewDirection: Vec3;
  /** Move the primary's pivot instead of the actors. */
  readonly pivotEdit?: boolean;
}

export interface DragResult {
  /** The targets' new document transforms (empty while editing the pivot). */
  readonly transforms: ReadonlyMap<ActorId, Transform>;
  /** The primary's new local pivot when editing it. */
  readonly pivot: Vec3 | null;
}

interface Placed extends DragTarget {
  readonly world: Mat4;
  readonly worldPosition: Vec3;
  readonly worldRotation: Quat;
  readonly parentRotation: Quat;
  readonly parentInverse: Mat4;
}

export interface GizmoDrag {
  readonly handle: GizmoHandle;
  readonly frame: GizmoFrame;
  /** @internal */ readonly state: DragState;
}

interface DragState {
  readonly start: DragStart;
  readonly targets: readonly Placed[];
  /** The handle's axis or plane normal in the world (move); the turning axis (rotate). */
  readonly direction: Vec3;
  /** Axis handle: the ray's parameter at the press. Plane / free handle: the press's hit. */
  readonly startT: number | null;
  readonly startHit: Vec3 | null;
}

function place(target: DragTarget): Placed {
  const local = composeMat4(target.transform.p, target.transform.r, target.transform.s);
  const world = multiplyMat4(target.parentWorld, local);
  const parentRotation = rotationOf(target.parentWorld);
  return {
    ...target,
    world,
    worldPosition: transformPoint(target.parentWorld, target.transform.p),
    worldRotation: normalizeQuat(multiplyQuat(parentRotation, target.transform.r)),
    parentRotation,
    parentInverse: invertMat4(target.parentWorld) ?? IDENTITY_MAT4,
  };
}

/** The gizmo for a target: on its pivot's world point; turned with it in local space, and always for scale. */
export function gizmoFrame(target: DragTarget, tool: GizmoHandle["tool"], space: TransformSpace): GizmoFrame {
  const placed = place(target);
  return {
    origin: transformPoint(placed.world, target.pivot),
    rotation: space === "local" || tool === "scale" ? placed.worldRotation : IDENTITY_QUAT,
  };
}

export function beginDrag(start: DragStart): GizmoDrag {
  const primary = start.targets[0];
  if (!primary) throw new Error("A gizmo drag needs a target.");
  const { handle } = start;
  const frame = gizmoFrame(primary, handle.tool, start.space);
  const targets = start.targets.map(place);
  let direction: Vec3 = [0, 1, 0];
  let startT: number | null = null;
  let startHit: Vec3 | null = null;
  if (handle.tool === "move") {
    if (handle.axis === "xyz") direction = start.viewDirection;
    else if (isPlaneAxis(handle.axis)) direction = rotate(frame.rotation, planeAxisNormal(handle.axis));
    else direction = rotate(frame.rotation, UNIT_AXES[axisToIndex(handle.axis)]);
    if (handle.axis === "xyz" || isPlaneAxis(handle.axis)) startHit = rayPlane(start.ray, frame.origin, direction) ?? frame.origin;
    else startT = axisParameter(start.ray, frame.origin, direction) ?? 0;
  } else if (handle.tool === "rotate") {
    direction = rotate(frame.rotation, UNIT_AXES[axisToIndex(handle.axis)]);
  }
  return { handle, frame, state: { start, targets, direction, startT, startHit } };
}

const toDoc = (target: Placed, worldPosition: Readonly<Vec3>, worldRotation: Readonly<Quat>, scale: Readonly<Vec3>): Transform => {
  const p = transformPoint(target.parentInverse, worldPosition);
  return {
    p: [round(p[0]), round(p[1]), round(p[2])],
    r: normalizeQuat(multiplyQuat(invertQuat(target.parentRotation), worldRotation)),
    s: [scale[0], scale[1], scale[2]],
  };
};

/** The drag with the pointer at `ray` / client pixels; null when the pointer gives no point (the ray misses the plane or runs along the axis). */
export function dragTo(drag: GizmoDrag, ray: Ray, clientX: number, clientY: number, snap: SnapSettings): DragResult | null {
  const { start, targets, direction, startT, startHit } = drag.state;
  const primary = targets[0]!;
  const { handle } = drag;
  const transforms = new Map<ActorId, Transform>();

  if (handle.tool === "move") {
    const pivotEdit = start.pivotEdit === true;
    const from = pivotEdit ? drag.frame.origin : primary.worldPosition;
    let moved: Vec3;
    if (startT !== null) {
      const t = axisParameter(ray, drag.frame.origin, direction);
      if (t === null) return null;
      const worldIndex = start.space === "world" ? axisToIndex(handle.axis) : null;
      moved = axisMovePosition(from, direction, t - startT, snap, worldIndex);
    } else {
      const hit = rayPlane(ray, drag.frame.origin, direction);
      if (hit === null) return null;
      const local = handle.axis !== "xyz" && start.space === "local";
      moved = planeMovePosition(from, sub(hit, startHit!), snap, movedAxes(handle.axis), local ? drag.frame.rotation : null);
    }
    if (pivotEdit) {
      const inverse = invertMat4(primary.world) ?? IDENTITY_MAT4;
      const pivot = transformPoint(inverse, moved);
      return { transforms, pivot: [round(pivot[0]), round(pivot[1]), round(pivot[2])] };
    }
    const delta = sub(moved, primary.worldPosition);
    for (const target of targets) {
      const position: Vec3 = [target.worldPosition[0] + delta[0], target.worldPosition[1] + delta[1], target.worldPosition[2] + delta[2]];
      transforms.set(target.id, toDoc(target, position, target.worldRotation, target.transform.s));
    }
    return { transforms, pivot: null };
  }

  if (handle.tool === "rotate") {
    const degrees = rotateDragDegrees(clientX - start.clientX, snap);
    const half = (degrees * Math.PI) / 360;
    const s = Math.sin(half);
    const turn: Quat = [direction[0] * s, direction[1] * s, direction[2] * s, Math.cos(half)];
    for (const target of targets) {
      const position = orbit(target.worldPosition, drag.frame.origin, turn);
      transforms.set(target.id, toDoc(target, position, multiplyQuat(turn, target.worldRotation), target.transform.s));
    }
    return { transforms, pivot: null };
  }

  for (const target of targets) {
    const scale = scaleDragScale(handle.axis, target.transform.s, clientX - start.clientX, clientY - start.clientY, snap);
    const { p, r, s } = target.transform;
    // The pivot's point in the parent's space stays where it was.
    const offset = rotate(r, [s[0] * target.pivot[0], s[1] * target.pivot[1], s[2] * target.pivot[2]]);
    const pivotPoint: Vec3 = [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]];
    transforms.set(target.id, { p: pivotCorrectedPosition(pivotPoint, r, scale, target.pivot), r: [...r], s: scale });
  }
  return { transforms, pivot: null };
}

/** The world matrix of an actor's parent from a lookup of documents (the identity for a root). */
export function parentWorldMatrix(lookup: (id: ActorId) => { readonly parent: ActorId | null; readonly transform: Transform } | undefined, parent: ActorId | null): Mat4 {
  let matrix = IDENTITY_MAT4;
  const seen = new Set<ActorId>();
  for (let at = parent; at !== null && !seen.has(at); ) {
    seen.add(at);
    const actor = lookup(at);
    if (!actor) break;
    matrix = multiplyMat4(composeMat4(actor.transform.p, actor.transform.r, actor.transform.s), matrix);
    at = actor.parent;
  }
  return matrix;
}

/**
 * The selected actors a drag carries: the primary first, without any actor
 * whose ancestor is selected too (it follows that ancestor).
 */
export function dragRoots(selected: readonly ActorId[], parentOf: (id: ActorId) => ActorId | null | undefined): ActorId[] {
  const chosen = new Set(selected);
  return selected.filter((id) => {
    const seen = new Set<ActorId>([id]);
    for (let at = parentOf(id) ?? null; at !== null && !seen.has(at); at = parentOf(at) ?? null) {
      if (chosen.has(at)) return false;
      seen.add(at);
    }
    return true;
  });
}

/** A world-space change of position for one target, back in its parent's space (snap to floor / wall). */
export function placeInParent(target: DragTarget, worldPosition: Readonly<Vec3>, worldRotation?: Readonly<Quat>): Transform {
  const placed = place(target);
  return toDoc(placed, worldPosition, worldRotation ?? placed.worldRotation, target.transform.s);
}

/** A target's world placement (position, rotation; the document's scale). */
export function worldPlacement(target: DragTarget): Transform {
  const placed = place(target);
  return { p: placed.worldPosition, r: placed.worldRotation, s: [...target.transform.s] };
}
