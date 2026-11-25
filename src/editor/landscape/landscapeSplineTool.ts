// The Landscape spline tool in the viewport (plan 5d step 5, INV-B06; Forge
// WebGL SceneApp @ forge-webgl-final: addLandscapeSplinePointAtPointer,
// pickLandscapeSplinePoint, startLandscapeSplinePointDrag,
// refreshLandscapeSplineOverlay). Three-free: the viewport projects, casts
// rays and draws the overlay and the gizmo.
//
// - Active while the primary selected actor is a drawn, editable terrain (not
//   locked) and the Landscape mode is Splines. The overlay then shows every
//   spline of it: control points and resolved centrelines.
// - Draw: a left click on the terrain (nothing else drawn in front) adds a
//   point to the active spline, or welds to the point under it.
// - Edit: a click on a point's marker (screen space, 14 px) selects it; the
//   move gizmo then stands on the point and drags it (snap settings apply),
//   one undo step on release. The gizmo of the terrain itself does not show
//   meanwhile, so a point drag never moves the terrain. Elsewhere a click
//   selects as usual.
// - Alt + left stays the camera's orbit.

import type { ActorId, Vec3 } from "../../core/index.ts";
import type { GizmoHandle } from "../../engine/gizmo/axes.ts";
import { beginDrag, dragTo, type DragTarget, type GizmoDrag } from "../../engine/gizmo/dragSession.ts";
import type { SnapSettings } from "../../engine/gizmo/snap.ts";
import type { Ray } from "../../engine/gizmo/transformDrag.ts";
import { IDENTITY_MAT4, IDENTITY_QUAT } from "../../engine/math/affine.ts";
import { splineToPolyline } from "../../engine/terrain/landscape.ts";
import type { EditableTerrain, TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import type { GizmoView } from "../../render/editor/gizmo.ts";
import { SPLINE_OVERLAY_LIFT, type SplineOverlayView } from "../../render/editor/splineOverlay.ts";
import type { EditorSession } from "../session/editorSession.ts";
import type { LandscapeSplines } from "./landscapeSplines.ts";
import { terrainRayHit, type LandscapeToolPointer } from "./landscapeTool.ts";

/** Forge: a marker is hit within this many pixels. */
const MARKER_PIXELS = 14;

export interface LandscapeSplineToolViewport {
  pointerRay(clientX: number, clientY: number): Ray | null;
  pick(clientX: number, clientY: number): ActorId | null;
  pickHandle(clientX: number, clientY: number): GizmoHandle | null;
  viewDirection(): Vec3;
  /** Where a world point is on the page; null behind the camera. */
  project(point: Vec3): readonly [number, number] | null;
  setSplineOverlay(view: SplineOverlayView | null): void;
}

export interface LandscapeSplineToolOptions {
  readonly editor: EditorSession;
  readonly editing: TerrainEditing;
  readonly splines: LandscapeSplines;
  readonly viewport: LandscapeSplineToolViewport;
  readonly snap: () => SnapSettings;
  /** The transform tools show a gizmo at all (not Select). */
  readonly gizmoShown: () => boolean;
}

export interface LandscapeSplineTool {
  /** The point gizmo in place of the selection's; null when no point carries it. */
  gizmo(): GizmoView | null;
  /** A press on the point gizmo starts a drag. */
  grab(event: LandscapeToolPointer): boolean;
  /** A press that draws or selects a point. */
  pointerDown(event: LandscapeToolPointer): boolean;
  readonly dragging: boolean;
  pointerMove(event: LandscapeToolPointer & { readonly buttons: number }): "grab" | null;
  pointerUp(event: LandscapeToolPointer): boolean;
  /** Puts a dragged point back; false when none is dragged. */
  cancel(): boolean;
  /** Draws the overlay again when what it shows changed (each frame). */
  update(): void;
}

export function createLandscapeSplineTool(options: LandscapeSplineToolOptions): LandscapeSplineTool {
  const { editor, editing, splines, viewport } = options;
  let drag: { readonly pointerId: number; readonly actor: ActorId; readonly gizmo: GizmoDrag } | null = null;
  let hovered: GizmoHandle | null = null;
  let shown: readonly unknown[] = [];

  const target = (): EditableTerrain | null => {
    if (editing.settings.mode !== "splines") return null;
    const primary = editor.selection.primary();
    if (primary === null) return null;
    const actor = editor.level.actor(primary);
    if (!actor || actor.locked) return null;
    return editing.find(primary) ?? null;
  };

  /** The active point in Edit, with the terrain it is on. */
  const point = (): { terrain: EditableTerrain; position: Vec3 } | null => {
    const terrain = editing.settings.splineTool === "edit" ? target() : null;
    if (!terrain || editing.settings.activeSplinePointId === null) return null;
    const active = splines.active(terrain.actor);
    const found = splines.list(terrain.actor).find((spline) => spline.id === active.splineId)?.points.find((entry) => entry.id === active.pointId);
    return found ? { terrain, position: found.position } : null;
  };
  const dragTarget = (actor: ActorId, position: Vec3): DragTarget => ({ id: actor, transform: { p: position, r: IDENTITY_QUAT, s: [1, 1, 1] }, parentWorld: IDENTITY_MAT4, pivot: [0, 0, 0] });

  const marker = (terrain: EditableTerrain, clientX: number, clientY: number): { splineId: string; pointId: string } | null => {
    let best: { splineId: string; pointId: string; distance: number } | null = null;
    for (const spline of splines.list(terrain.actor)) {
      for (const { id, position } of spline.points) {
        const at = viewport.project([position[0], position[1] + SPLINE_OVERLAY_LIFT, position[2]]);
        if (!at) continue;
        const distance = Math.hypot(at[0] - clientX, at[1] - clientY);
        if (distance <= MARKER_PIXELS && (!best || distance < best.distance)) best = { splineId: spline.id, pointId: id, distance };
      }
    }
    return best;
  };

  const overlay = (terrain: EditableTerrain): SplineOverlayView => {
    const points = new Set(splines.points(terrain.actor));
    const segments = new Set(splines.segments(terrain.actor));
    const { splineId } = splines.active(terrain.actor);
    const list = splines.list(terrain.actor);
    return {
      lines: list.flatMap((spline) => splineToPolyline(spline).map(({ segment, start, end }) => ({
        start: start.position, end: end.position, active: spline.id === splineId && segments.has(segment.id),
      }))),
      points: list.flatMap((spline) => spline.points.map(({ id, position }) => ({
        id: `${spline.id}/${id}`, position, active: spline.id === splineId && points.has(id),
      }))),
    };
  };

  return {
    get dragging() {
      return drag !== null;
    },
    gizmo() {
      const found = options.gizmoShown() ? point() : null;
      if (!found) {
        hovered = null;
        return null;
      }
      return { tool: "move", origin: found.position, rotation: IDENTITY_QUAT, active: drag?.gizmo.handle ?? null, hovered: drag ? null : hovered };
    },
    grab(event) {
      if (event.button !== 0 || event.altKey || drag) return false;
      const found = options.gizmoShown() ? point() : null;
      if (!found || splines.busy) return false;
      const handle = viewport.pickHandle(event.clientX, event.clientY);
      const ray = viewport.pointerRay(event.clientX, event.clientY);
      if (!handle || handle.tool !== "move" || !ray) return false;
      drag = {
        pointerId: event.pointerId, actor: found.terrain.actor,
        gizmo: beginDrag({
          handle, space: "world", targets: [dragTarget(found.terrain.actor, [...found.position])], ray,
          clientX: event.clientX, clientY: event.clientY, viewDirection: viewport.viewDirection(),
        }),
      };
      hovered = null;
      return true;
    },
    pointerDown(event) {
      if (event.button !== 0 || event.altKey || drag) return false;
      const terrain = target();
      if (!terrain) return false;
      if (editing.settings.splineTool === "edit") {
        const hit = marker(terrain, event.clientX, event.clientY);
        if (!hit) return false;
        splines.select({ ...hit, segmentId: null });
        return true;
      }
      // Something drawn in front of the terrain is selected as usual.
      if (viewport.pick(event.clientX, event.clientY) !== terrain.actor) return false;
      const ray = viewport.pointerRay(event.clientX, event.clientY);
      const hit = ray ? terrainRayHit(terrain, ray) : null;
      if (!hit) return false;
      void splines.draw(terrain.actor, hit);
      return true;
    },
    pointerMove(event) {
      if (!drag) {
        hovered = null;
        if (event.buttons !== 0 || !options.gizmoShown() || !point()) return null;
        const handle = viewport.pickHandle(event.clientX, event.clientY);
        hovered = handle?.tool === "move" ? handle : null;
        return hovered ? "grab" : null;
      }
      if (event.pointerId !== drag.pointerId) return "grab";
      const ray = viewport.pointerRay(event.clientX, event.clientY);
      const moved = ray ? dragTo(drag.gizmo, ray, event.clientX, event.clientY, options.snap())?.transforms.get(drag.actor) : undefined;
      if (moved) splines.drag(drag.actor, [...moved.p]);
      return "grab";
    },
    pointerUp(event) {
      if (!drag || event.pointerId !== drag.pointerId) return false;
      const { actor } = drag;
      drag = null;
      splines.drop(actor);
      return true;
    },
    cancel() {
      if (!drag) return false;
      const { actor } = drag;
      drag = null;
      splines.undrag(actor);
      return true;
    },
    update() {
      const terrain = target();
      const { settings } = editing;
      // The definition's splines are replaced, never written in place, so their identity is the change.
      const key = terrain ? [terrain, terrain.session.world.def.splines, terrain.session.world.def.origin, settings] : [];
      if (key.length === shown.length && key.every((value, index) => value === shown[index])) return;
      shown = key;
      viewport.setSplineOverlay(terrain ? overlay(terrain) : null);
    },
  };
}
