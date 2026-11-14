// The editor's transform tools (plan phase 4 step 4; INV-A05, A06; Forge
// WebGL SceneApp's tool / snap / pivot state and gizmo drag, EditorUi's
// toolbar actions @ forge-webgl-final): the active tool (Select, Move, Rotate,
// Scale), the transform space (World / Local), the snap settings, pivot
// editing, the gizmo drag and snap to floor / wall. Three-free: the drag math
// is src/engine/gizmo; the viewport draws the gizmo and answers rays.
//
// - A drag previews live: the dragged actors go to the world with
//   `World.updateActors` (transform only, so the render bindings move them in
//   place, decision 3) and nothing enters the level session. Releasing the
//   pointer commits one transaction (one undo step) with every dragged actor;
//   Escape or a cancelled pointer puts the world back as the session has it.
// - Pivot editing: the move gizmo carries the primary's pivot; releasing it
//   writes the actor's `pivot` (one undo step). Presets set it to the model's
//   origin, centre or base (its local bounds).
// - Snap settings are the page's (localStorage), not the project's.

import type { ActorDoc, ActorId, Transform, Vec3 } from "../core/index.ts";
import { EDITOR_TOOLS, nextTransformTool, type EditorTool, type GizmoHandle, type TransformSpace } from "../engine/gizmo/axes.ts";
import { beginDrag, dragRoots, dragTo, gizmoFrame, parentWorldMatrix, placeInParent, worldPlacement, type DragTarget, type GizmoDrag } from "../engine/gizmo/dragSession.ts";
import { DEFAULT_SNAP, readSnapSettings, type SnapSettings } from "../engine/gizmo/snap.ts";
import { floorSnapPosition, nearestWall, WALL_DIRECTIONS, WALL_SIDES, wallSnap, type Box, type WallHit } from "../engine/gizmo/surfaceSnap.ts";
import type { Ray } from "../engine/gizmo/transformDrag.ts";
import type { GizmoView } from "../render/editor/gizmo.ts";
import type { EditorSession } from "./session/editorSession.ts";

/** What the tools ask of the viewport (three-free). */
export interface TransformToolsViewport {
  /** The gizmo handle under a point of the page; null for none. */
  pickHandle(clientX: number, clientY: number): GizmoHandle | null;
  /** The camera's ray through a point of the page. */
  pointerRay(clientX: number, clientY: number): Ray | null;
  /** The camera's forward direction. */
  viewDirection(): Vec3;
  /** The first thing a world ray hits among what the level draws, `exclude`'s actors left out. */
  raycast(origin: Vec3, direction: Vec3, far: number, exclude: ReadonlySet<ActorId>): { readonly distance: number; readonly point: Vec3 } | null;
  /** World box of what these actors draw. */
  worldBox(actors: readonly ActorId[]): Box | null;
  /** The box of what an actor draws, in its own space (before its scale). */
  localBox(actor: ActorId): Box | null;
}

/** A pointer event as the tools read it. */
export interface ToolPointer {
  readonly pointerId: number;
  readonly button: number;
  readonly buttons: number;
  readonly altKey: boolean;
  readonly clientX: number;
  readonly clientY: number;
}

export type PivotPreset = "reset" | "center" | "base";

export interface TransformTools {
  readonly tool: EditorTool;
  setTool(tool: EditorTool): void;
  /** Forge's Space: Move -> Rotate -> Scale. */
  cycleTool(): void;
  readonly space: TransformSpace;
  toggleSpace(): void;
  readonly snap: SnapSettings;
  setSnap(values: Partial<SnapSettings>): void;
  readonly pivotEdit: boolean;
  setPivotEdit(on: boolean): void;
  /** The gizmo to draw this frame; null for none. */
  gizmo(): GizmoView | null;
  readonly dragging: boolean;
  /** A press in the viewport; true when it grabbed a gizmo handle (the camera and picking stay out). */
  pointerDown(event: ToolPointer): boolean;
  /** Hover when idle, the drag when dragging; the cursor to show. */
  pointerMove(event: ToolPointer): "grab" | null;
  pointerUp(event: ToolPointer): void;
  /** Puts the world back and drops the drag (Escape, a cancelled pointer). */
  cancel(): boolean;
  snapToFloor(): void;
  snapToWall(): void;
  setPivotPreset(preset: PivotPreset): void;
  /** Tool, space, snap or pivot editing changed. */
  onChange(listener: () => void): () => void;
}

export interface TransformToolsOptions {
  readonly editor: EditorSession;
  readonly viewport: TransformToolsViewport;
  readonly storage: Storage | null;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
}

export const SNAP_STORAGE_KEY = "forge.editor.snap";
/** How far a wall ray looks (metres). */
export const WALL_RANGE = 100;
const TOOL_LABELS: Readonly<Record<EditorTool, string>> = { select: "Select", move: "Move", rotate: "Rotate", scale: "Scale" };

const sameTransform = (a: Transform, b: Transform): boolean => JSON.stringify(a) === JSON.stringify(b);

export function createTransformTools(options: TransformToolsOptions): TransformTools {
  const { editor, viewport, storage, status } = options;
  const listeners = new Set<() => void>();
  const changed = (): void => {
    for (const listener of [...listeners]) listener();
  };
  let tool: EditorTool = "move";
  let space: TransformSpace = "world";
  let pivotEdit = false;
  let hovered: GizmoHandle | null = null;
  let snap: SnapSettings = DEFAULT_SNAP;
  try {
    const stored = storage?.getItem(SNAP_STORAGE_KEY);
    if (stored) snap = readSnapSettings(JSON.parse(stored));
  } catch {
    snap = DEFAULT_SNAP;
  }

  interface Drag {
    readonly pointerId: number;
    readonly gizmo: GizmoDrag;
    readonly docs: ReadonlyMap<ActorId, ActorDoc>;
    transforms: ReadonlyMap<ActorId, Transform>;
    pivot: Vec3 | null;
  }
  let drag: Drag | null = null;

  const docOf = (id: ActorId): ActorDoc | undefined => editor.level.actor(id);
  const targetOf = (doc: ActorDoc): DragTarget => ({
    id: doc.id,
    transform: doc.transform,
    parentWorld: parentWorldMatrix(docOf, doc.parent),
    pivot: doc.pivot ?? [0, 0, 0],
  });
  /** The selection's roots (primary first) that are in the level. */
  const roots = (): ActorDoc[] =>
    dragRoots(editor.selection.ids(), (id) => docOf(id)?.parent)
      .map(docOf)
      .filter((doc): doc is ActorDoc => doc !== undefined);
  const withDescendants = (ids: readonly ActorId[]): Set<ActorId> => {
    const out = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const actor of editor.level.level.actors) {
        if (actor.parent !== null && out.has(actor.parent) && !out.has(actor.id)) {
          out.add(actor.id);
          grew = true;
        }
      }
    }
    return out;
  };

  /** The world shows the docs with these transforms (a preview, or the session's own on cancel). */
  const show = (docs: ReadonlyMap<ActorId, ActorDoc>, transforms: ReadonlyMap<ActorId, Transform> | null): void => {
    const updates: ActorDoc[] = [];
    for (const [id, doc] of docs) updates.push(transforms?.has(id) ? { ...doc, transform: transforms.get(id)! } : doc);
    if (updates.length > 0) editor.world.updateActors(updates);
  };

  /** One transaction of world placements (snap to floor / wall, pivot presets). */
  const commit = (label: string, next: ReadonlyMap<ActorId, Partial<ActorDoc>>): boolean => {
    if (next.size === 0) return false;
    const result = editor.edit(label, (tx) => {
      for (const [id, patch] of next) {
        const current = docOf(id);
        if (current) tx.setActor({ ...current, ...patch });
      }
    });
    if (!result.ok) status(result.issues.map((issue) => issue.message).join("; "), "error");
    return result.ok;
  };

  const persistSnap = (): void => {
    try {
      storage?.setItem(SNAP_STORAGE_KEY, JSON.stringify(snap));
    } catch {
      // The page keeps the settings until it is closed.
    }
  };

  // An undo, redo or other edit under a drag: the drag's start is stale, drop it.
  editor.onChange(() => {
    if (drag) tools.cancel();
  });

  const tools: TransformTools = {
    get tool() {
      return tool;
    },
    setTool(next) {
      if (!EDITOR_TOOLS.includes(next) || next === tool) return;
      tools.cancel();
      tool = next;
      // Forge: switching tool leaves pivot editing.
      pivotEdit = false;
      hovered = null;
      status(`${TOOL_LABELS[next]} tool`);
      changed();
    },
    cycleTool() {
      tools.setTool(nextTransformTool(tool));
    },
    get space() {
      return space;
    },
    toggleSpace() {
      space = space === "world" ? "local" : "world";
      status(`Transform space: ${space}`);
      changed();
    },
    get snap() {
      return snap;
    },
    setSnap(values) {
      snap = readSnapSettings({ ...snap, ...values });
      persistSnap();
      const state = (on: boolean, step: number): string => (on ? String(step) : "off");
      status(`Snap move ${state(snap.moveEnabled, snap.move)}, rotate ${state(snap.rotateEnabled, snap.rotate)}, scale ${state(snap.scaleEnabled, snap.scale)}`);
      changed();
    },
    get pivotEdit() {
      return pivotEdit;
    },
    setPivotEdit(on) {
      if (on === pivotEdit) return;
      tools.cancel();
      pivotEdit = on;
      if (on && tool !== "move") tool = "move";
      status(on ? "Pivot edit: drag the move gizmo to set the pivot." : "Pivot edit off.");
      changed();
    },
    get dragging() {
      return drag !== null;
    },
    gizmo() {
      if (tool === "select") return null;
      const primary = roots()[0];
      if (!primary) return null;
      const target = targetOf(primary);
      const moved = drag?.transforms.get(primary.id);
      const shown: DragTarget = { ...target, ...(moved ? { transform: moved } : {}), ...(drag?.pivot ? { pivot: drag.pivot } : {}) };
      const frame = gizmoFrame(shown, tool, space);
      return { tool, origin: frame.origin, rotation: frame.rotation, active: drag?.gizmo.handle ?? null, hovered: drag ? null : hovered };
    },
    pointerDown(event) {
      if (tool === "select" || event.button !== 0 || event.altKey || drag) return false;
      const handle = viewport.pickHandle(event.clientX, event.clientY);
      if (!handle || handle.tool !== tool) return false;
      const ray = viewport.pointerRay(event.clientX, event.clientY);
      const docs = roots();
      if (!ray || docs.length === 0) return false;
      const editingPivot = pivotEdit && handle.tool === "move";
      const targets = (editingPivot ? docs.slice(0, 1) : docs).map(targetOf);
      drag = {
        pointerId: event.pointerId,
        gizmo: beginDrag({ handle, space, targets, ray, clientX: event.clientX, clientY: event.clientY, viewDirection: viewport.viewDirection(), pivotEdit: editingPivot }),
        docs: new Map(targets.map((target) => [target.id, docOf(target.id)!])),
        transforms: new Map(),
        pivot: null,
      };
      hovered = null;
      return true;
    },
    pointerMove(event) {
      if (!drag) {
        if (tool === "select" || event.buttons !== 0) return null;
        const handle = viewport.pickHandle(event.clientX, event.clientY);
        hovered = handle && handle.tool === tool ? handle : null;
        return hovered ? "grab" : null;
      }
      if (event.pointerId !== drag.pointerId) return "grab";
      const ray = viewport.pointerRay(event.clientX, event.clientY);
      const result = ray ? dragTo(drag.gizmo, ray, event.clientX, event.clientY, snap) : null;
      if (!result) return "grab";
      drag.transforms = result.transforms;
      drag.pivot = result.pivot;
      if (result.transforms.size > 0) show(drag.docs, result.transforms);
      return "grab";
    },
    pointerUp(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const done = drag;
      drag = null;
      if (done.pivot) {
        const primary = [...done.docs.values()][0]!;
        const before = primary.pivot ?? [0, 0, 0];
        if (done.pivot.some((value, index) => value !== before[index])) commit("Edit pivot", new Map([[primary.id, { pivot: done.pivot }]]));
        return;
      }
      const moved = new Map<ActorId, Partial<ActorDoc>>();
      for (const [id, transform] of done.transforms) {
        if (!sameTransform(transform, done.docs.get(id)!.transform)) moved.set(id, { transform });
      }
      if (moved.size === 0) {
        show(done.docs, null);
        return;
      }
      const verb = TOOL_LABELS[done.gizmo.handle.tool];
      const name = moved.size === 1 ? (done.docs.get([...moved.keys()][0]!)?.name ?? "") : `${moved.size} actors`;
      if (!commit(`${verb} ${name}`.trim(), moved)) show(done.docs, null);
    },
    cancel() {
      if (!drag) return false;
      const dropped = drag;
      drag = null;
      show(dropped.docs, null);
      status("Drag cancelled");
      return true;
    },
    snapToFloor() {
      const docs = roots();
      if (docs.length === 0) {
        status("No selected object to snap.", "warning");
        return;
      }
      const exclude = withDescendants(docs.map((doc) => doc.id));
      const next = new Map<ActorId, Partial<ActorDoc>>();
      let missing = 0;
      for (const doc of docs) {
        const box = viewport.worldBox([doc.id]);
        if (!box) {
          missing += 1;
          continue;
        }
        // Forge: start a hair above the bottom so a surface flush with it still counts; nothing under it is the floor plane.
        const origin: Vec3 = [(box.min[0] + box.max[0]) / 2, box.min[1] + 0.02, (box.min[2] + box.max[2]) / 2];
        const hit = viewport.raycast(origin, [0, -1, 0], 1000, exclude);
        const target = targetOf(doc);
        const world = worldPlacement(target);
        const position = floorSnapPosition(box, world.p, hit ? hit.point[1] : 0);
        if (position) next.set(doc.id, { transform: placeInParent(target, position) });
      }
      if (next.size === 0) {
        status(missing === docs.length ? "Cannot compute bounds for surface snap." : "Already resting on a surface.", missing === docs.length ? "warning" : "info");
        return;
      }
      if (commit(next.size === 1 ? "Snap to floor" : `Snap ${next.size} actors to floor`, next)) status("Snapped to floor");
    },
    snapToWall() {
      const docs = roots();
      if (docs.length === 0) {
        status("Select a model to snap to a wall.", "warning");
        return;
      }
      const exclude = withDescendants(docs.map((doc) => doc.id));
      const next = new Map<ActorId, Partial<ActorDoc>>();
      for (const doc of docs) {
        const box = viewport.worldBox([doc.id]);
        const local = viewport.localBox(doc.id);
        if (!box || !local) continue;
        const centre: Vec3 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
        const hits: WallHit[] = [];
        for (const side of WALL_SIDES) {
          const hit = viewport.raycast(centre, WALL_DIRECTIONS[side], WALL_RANGE, exclude);
          if (hit) hits.push({ side, distance: hit.distance });
        }
        const wall = nearestWall(hits);
        if (!wall) continue;
        const axis = wall.side === "+x" || wall.side === "-x" ? 0 : 2;
        const coordinate = centre[axis] + (wall.side[0] === "-" ? -wall.distance : wall.distance);
        const target = targetOf(doc);
        const snapped = wallSnap(local, worldPlacement(target), wall.side, coordinate);
        next.set(doc.id, { transform: placeInParent(target, snapped.position, snapped.rotation) });
      }
      if (next.size === 0) {
        status("No wall found to snap to.", "warning");
        return;
      }
      if (commit(next.size === 1 ? "Snap to wall" : `Snap ${next.size} actors to wall`, next)) status("Snapped to wall");
    },
    setPivotPreset(preset) {
      const primary = roots()[0];
      if (!primary) {
        status("This selection has no pivot.", "warning");
        return;
      }
      let pivot: Vec3 = [0, 0, 0];
      if (preset !== "reset") {
        const box = viewport.localBox(primary.id);
        if (!box) {
          status("No local bounds available for this pivot preset.", "warning");
          return;
        }
        const round = (value: number): number => Number(value.toFixed(2));
        const centreX = round((box.min[0] + box.max[0]) / 2);
        const centreZ = round((box.min[2] + box.max[2]) / 2);
        pivot = [centreX, preset === "base" ? round(box.min[1]) : round((box.min[1] + box.max[1]) / 2), centreZ];
      }
      const before = primary.pivot ?? [0, 0, 0];
      if (pivot.every((value, index) => value === before[index])) return;
      commit("Edit pivot", new Map([[primary.id, { pivot }]]));
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return tools;
}
