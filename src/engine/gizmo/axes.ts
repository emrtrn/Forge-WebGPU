// The gizmo's handles (Forge WebGL editor/gizmos/{axes,handles}.ts
// @ forge-webgl-final; plan phase 4 step 4, INV-A05): an axis, a plane of two
// axes, the free (screen) move or the uniform scale.

import type { Vec3 } from "../../core/index.ts";

export type GizmoAxis = "x" | "y" | "z" | "xy" | "yz" | "xz" | "xyz" | "uniform";
export type GizmoVectorAxis = Extract<GizmoAxis, "x" | "y" | "z">;
export type GizmoPlaneAxis = Extract<GizmoAxis, "xy" | "yz" | "xz">;
export type AxisIndex = 0 | 1 | 2;

/** The tools with a gizmo; the Select tool has none. */
export type GizmoTool = "move" | "rotate" | "scale";
export type EditorTool = "select" | GizmoTool;
export const EDITOR_TOOLS: readonly EditorTool[] = ["select", "move", "rotate", "scale"];

/** World: the gizmo is aligned to the world axes; local: to the primary selection's. */
export type TransformSpace = "world" | "local";

export interface GizmoHandle {
  readonly tool: GizmoTool;
  readonly axis: GizmoAxis;
}

export function gizmoHandlesEqual(left: GizmoHandle | null | undefined, right: GizmoHandle | null | undefined): boolean {
  return left?.tool === right?.tool && left?.axis === right?.axis;
}

/** Forge's Space key: Move -> Rotate -> Scale -> Move (Select goes to Move). */
export function nextTransformTool(tool: EditorTool): GizmoTool {
  return tool === "move" ? "rotate" : tool === "rotate" ? "scale" : "move";
}

/** A vector axis's component index (anything else reads as Y, Forge's axisToIndex). */
export function axisToIndex(axis: GizmoAxis): AxisIndex {
  if (axis === "x") return 0;
  if (axis === "z") return 2;
  return 1;
}

export function isPlaneAxis(axis: GizmoAxis): axis is GizmoPlaneAxis {
  return axis === "xy" || axis === "yz" || axis === "xz";
}

/** The two components a plane handle edits. */
export function planeAxisIndices(axis: GizmoPlaneAxis): [AxisIndex, AxisIndex] {
  if (axis === "xy") return [0, 1];
  if (axis === "yz") return [1, 2];
  return [0, 2];
}

export const UNIT_AXES: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** The normal of a plane handle in the gizmo's own frame: the axis it leaves out. */
export function planeAxisNormal(axis: GizmoPlaneAxis): Vec3 {
  return axis === "xy" ? [0, 0, 1] : axis === "yz" ? [1, 0, 0] : [0, 1, 0];
}
