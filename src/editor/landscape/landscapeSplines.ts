// A terrain's splines in the editor (plan 5d step 5, INV-B06; Forge WebGL
// SceneApp's landscape spline actions @ forge-webgl-final). The edits are the
// engine's (landscapeSplineEdit.ts); each one here is one undo step
// (`pushStep`) that swaps the definition's splines and the page's active
// spline, point and segment, marks the definition dirty (Save writes it with
// the terrain, landscapeSave.ts) and has the terrain build its spline meshes
// again.
//
// - Apply Deform / Apply Paint (Forge; user decision 2026-11-25: two actions,
//   apart from the meshes) write the active spline's enabled effects into the
//   heights / paint layers: the corridor's tiles are loaded and held, the
//   patches are one undo step, the tiles become dirty. Moving a point never
//   applies them again.
// - A drawn point and Snap to Terrain read the exact ground height: the tile
//   under the point is loaded first; while it loads other spline edits wait.
//
// Provided to the editor's world (`LandscapeSplinesKey`) for the Landscape
// Details, which reach the world's services only.

import type { ActorId, Vec3 } from "../../core/index.ts";
import { createServiceKey } from "../../core/world/services.ts";
import {
  addLandscapeSpline, closeLandscapeSpline, deleteLandscapeSpline, deleteLandscapeSplinePoint, drawLandscapeSplinePoint, resolveActiveSpline,
  setLandscapeSpline, setLandscapeSplinePoints, setLandscapeSplineSegments, splineWeldDistance, splitLandscapeSplineSegment, worldTerrainSplines,
  type LandscapeSplineActive, type LandscapeSplineEdit, type LandscapeSplinePatch, type LandscapeSplinePointPatch, type LandscapeSplineSegmentPatch,
} from "../../engine/terrain/landscapeSplineEdit.ts";
import type { EditableTerrain, TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import { terrainBrushTileKeys } from "../../engine/terrain/terrainEditorStreaming.ts";
import { terrainHeightAt } from "../../engine/terrain/terrainHeightQuery.ts";
import { createTerrainSplinePatches, terrainSplineTileKeys } from "../../engine/terrain/terrainSplines.ts";
import type { WorldTerrainSpline } from "../../engine/terrain/terrainTypes.ts";
import type { EditorSession } from "../session/editorSession.ts";
import { pushTerrainPatchStep, restoreEdited } from "./landscapeSteps.ts";

export interface LandscapeSplines {
  /** The actor's terrain's splines in world space (the live ones while a point is dragged); empty when none is drawn. */
  list(actor: ActorId): readonly WorldTerrainSpline[];
  /** What of the page's selection exists on that terrain. */
  active(actor: ActorId): LandscapeSplineActive;
  /** The selected points / segments that exist (the active one among them). */
  points(actor: ActorId): readonly string[];
  segments(actor: ActorId): readonly string[];
  select(active: Partial<LandscapeSplineActive>): void;
  create(actor: ActorId): boolean;
  remove(actor: ActorId): boolean;
  close(actor: ActorId): boolean;
  set(actor: ActorId, patch: LandscapeSplinePatch): boolean;
  /** Draw's click at a point of the terrain (its exact height is read). */
  draw(actor: ActorId, position: Vec3): Promise<boolean>;
  setPoints(actor: ActorId, patch: LandscapeSplinePointPatch): boolean;
  deletePoint(actor: ActorId): boolean;
  snapPoint(actor: ActorId): Promise<boolean>;
  /** A drag of the active point: `drag` shows it, `drop` makes it one undo step, `undrag` puts it back. */
  drag(actor: ActorId, position: Vec3): void;
  drop(actor: ActorId): void;
  undrag(actor: ActorId): void;
  split(actor: ActorId): boolean;
  setSegments(actor: ActorId, patch: LandscapeSplineSegmentPatch): boolean;
  apply(actor: ActorId, effect: "deform" | "paint"): Promise<boolean>;
  /** Waiting for terrain tiles. */
  readonly busy: boolean;
  /** Models for the segment mesh field. */
  assetLabel(guid: string): string | null;
  pickAsset(assetType: string | null): Promise<string | null>;
}

export const LandscapeSplinesKey = createServiceKey<LandscapeSplines>("forge.editor.landscapeSplines");

export interface LandscapeSplinesOptions {
  readonly editor: EditorSession;
  readonly editing: TerrainEditing;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  readonly assetLabel: (guid: string) => string | null;
  readonly pickAsset: (assetType: string | null) => Promise<string | null>;
}

export function createLandscapeSplines(options: LandscapeSplinesOptions): LandscapeSplines {
  const { editor, editing, status } = options;
  let busy = false;
  /** The splines before the running drag, per terrain session. */
  let dragged: { readonly actor: ActorId; readonly terrain: EditableTerrain; readonly before: WorldTerrainSpline[]; readonly active: LandscapeSplineActive } | null = null;

  /** The drawn editable terrain of `actor`, when it may be edited. */
  const terrainOf = (actor: ActorId): EditableTerrain | null => {
    const doc = editor.level.actor(actor);
    if (!doc || doc.locked) return null;
    return editing.find(actor) ?? null;
  };
  const current = (): LandscapeSplineActive => {
    const { activeSplineId, activeSplinePointId, activeSplineSegmentId } = editing.settings;
    return { splineId: activeSplineId, pointId: activeSplinePointId, segmentId: activeSplineSegmentId };
  };
  const show = (active: LandscapeSplineActive): void => editing.update({
    activeSplineId: active.splineId, activeSplinePointId: active.pointId, activeSplineSegmentId: active.segmentId,
    splinePointIds: active.pointId ? [active.pointId] : [], splineSegmentIds: active.segmentId ? [active.segmentId] : [],
  });

  /** One undo step from a result; a refusal is said and changes nothing. `keep` leaves the panel's multi-selection as it is. */
  const step = (terrain: EditableTerrain, label: string, edit: LandscapeSplineEdit, before = worldTerrainSplines(terrain.session.world.def), keep = false): boolean => {
    if (!edit.ok) {
      status(edit.reason, "warning");
      return false;
    }
    if (JSON.stringify(before) === JSON.stringify(edit.splines)) return false;
    const { actor, session } = terrain;
    const was = current();
    const write = (splines: readonly WorldTerrainSpline[], active: LandscapeSplineActive | null): void => {
      session.world.def.splines = structuredClone([...splines]);
      session.markDefinitionDirty();
      if (active) show(active);
      // The terrain may have been drawn again since (a rebuilt binding).
      const drawn = editing.find(actor);
      if (drawn?.session === session) drawn.splinesChanged();
    };
    write(edit.splines, keep ? null : edit.active);
    editor.pushStep({ label, undo: () => write(before, keep ? null : was), redo: () => write(edit.splines, keep ? null : edit.active) });
    return true;
  };
  const act = (actor: ActorId, label: string, edit: (splines: WorldTerrainSpline[], active: LandscapeSplineActive, terrain: EditableTerrain) => LandscapeSplineEdit, keep = false): boolean => {
    const terrain = terrainOf(actor);
    if (!terrain || busy || dragged) return false;
    const splines = worldTerrainSplines(terrain.session.world.def);
    return step(terrain, label, edit(splines, resolveActiveSpline(splines, current()), terrain), splines, keep);
  };

  /**
   * Runs `work` with `keys` loaded and held (a streaming terrain waits), when
   * the terrain, its splines and the selection are still what they were.
   */
  const withTiles = async (actor: ActorId, why: string, keysOf: (terrain: EditableTerrain) => string[], work: (terrain: EditableTerrain) => boolean): Promise<boolean> => {
    const terrain = terrainOf(actor);
    if (!terrain) return false;
    if (busy || dragged) {
      status("Loading terrain for the previous spline operation…");
      return false;
    }
    busy = true;
    let keys: string[] = [];
    try {
      const splines = terrain.session.world.def.splines;
      const active = JSON.stringify(current());
      keys = keysOf(terrain);
      restoreEdited(terrain.session);
      await terrain.demand(keys);
      restoreEdited(terrain.session);
      const unread = keys.find((key) => !terrain.session.readable(key));
      if (unread) throw new Error(`terrain tile ${unread} could not be read`);
      if (terrainOf(actor) !== terrain || terrain.session.world.def.splines !== splines || JSON.stringify(current()) !== active) return false;
      return work(terrain);
    } catch (error) {
      status(`Cannot ${why}: ${error instanceof Error ? error.message : String(error)}`, "error");
      return false;
    } finally {
      terrain.release(keys);
      busy = false;
    }
  };
  const keysUnder = (position: Vec3) => (terrain: EditableTerrain): string[] => terrainBrushTileKeys(terrain.session.world.def, position[0], position[2], 0);
  const groundAt = (terrain: EditableTerrain, x: number, z: number): number => {
    const { world } = terrain.session;
    const height = terrainHeightAt(world.def, world, x, z);
    if (height === null) throw new Error("the terrain has no ground at this point");
    return height;
  };
  const activePoint = (actor: ActorId) => {
    const active = service.active(actor);
    return service.list(actor).find((spline) => spline.id === active.splineId)?.points.find((point) => point.id === active.pointId);
  };
  const several = (wanted: readonly string[], existing: readonly string[], active: string | null): readonly string[] => {
    const ids = wanted.filter((id) => existing.includes(id));
    return active !== null && !ids.includes(active) ? [active] : ids;
  };

  /** World-frame copies per stored array (it is replaced, never written in place): the overlay and the gizmo read them each frame. */
  const worlds = new WeakMap<object, { origin: string; splines: WorldTerrainSpline[] }>();
  const worldSplines = (terrain: EditableTerrain): WorldTerrainSpline[] => {
    const { def } = terrain.session.world;
    if (!def.splines) return [];
    const origin = def.origin.join();
    const known = worlds.get(def.splines);
    if (known?.origin === origin) return known.splines;
    const splines = worldTerrainSplines(def);
    worlds.set(def.splines, { origin, splines });
    return splines;
  };

  const service: LandscapeSplines = {
    get busy() {
      return busy;
    },
    assetLabel: options.assetLabel,
    pickAsset: options.pickAsset,
    list: (actor) => {
      const terrain = editing.find(actor);
      return terrain ? worldSplines(terrain) : [];
    },
    active: (actor) => resolveActiveSpline(service.list(actor), current()),
    points(actor) {
      const active = service.active(actor);
      const spline = service.list(actor).find((entry) => entry.id === active.splineId);
      return several(editing.settings.splinePointIds, spline?.points.map((point) => point.id) ?? [], active.pointId);
    },
    segments(actor) {
      const active = service.active(actor);
      const spline = service.list(actor).find((entry) => entry.id === active.splineId);
      return several(editing.settings.splineSegmentIds, spline?.segments.map((segment) => segment.id) ?? [], active.segmentId);
    },
    select: (active) => show({ ...current(), ...active }),
    create: (actor) => act(actor, "Create Landscape Spline", (splines) => addLandscapeSpline(splines)),
    remove: (actor) => act(actor, "Delete Landscape Spline", (splines, active) => deleteLandscapeSpline(splines, active.splineId ?? "")),
    close: (actor) => act(actor, "Close Landscape Spline Loop", (splines, active) => closeLandscapeSpline(splines, active.splineId ?? "")),
    set: (actor, patch) => act(actor, patch.smooth === undefined ? "Edit Landscape Spline" : patch.smooth ? "Curve Landscape Spline" : "Straighten Landscape Spline",
      (splines, active) => setLandscapeSpline(splines, active, patch), true),
    draw: (actor, position) => withTiles(actor, "add a spline point", keysUnder(position), (terrain) => {
      const ground: Vec3 = [position[0], groundAt(terrain, position[0], position[2]), position[2]];
      const { def } = terrain.session.world;
      const splines = worldTerrainSplines(def);
      return step(terrain, "Add Landscape Spline Point", drawLandscapeSplinePoint(splines, resolveActiveSpline(splines, current()), ground, splineWeldDistance(def)), splines);
    }),
    setPoints: (actor, patch) => act(actor, "Edit Landscape Spline Points", (splines, active) => setLandscapeSplinePoints(splines, active, service.points(actor), patch), true),
    deletePoint: (actor) => act(actor, "Delete Landscape Spline Point", (splines, active) => deleteLandscapeSplinePoint(splines, active, active.pointId ?? "")),
    snapPoint(actor) {
      const point = activePoint(actor);
      if (!point) return Promise.resolve(false);
      const { position, id } = point;
      return withTiles(actor, "snap the point to the terrain", keysUnder(position), (terrain) => {
        const splines = worldTerrainSplines(terrain.session.world.def);
        const height = groundAt(terrain, position[0], position[2]);
        return step(terrain, "Snap Landscape Spline Point", setLandscapeSplinePoints(splines, resolveActiveSpline(splines, current()), [id], { y: height }), splines);
      });
    },
    drag(actor, position) {
      const terrain = terrainOf(actor);
      if (!terrain || busy) return;
      const splines = worldTerrainSplines(terrain.session.world.def);
      const active = resolveActiveSpline(splines, current());
      if (!active.pointId) return;
      dragged ??= { actor, terrain, before: splines, active };
      const edit = setLandscapeSplinePoints(splines, active, [active.pointId], { x: position[0], y: position[1], z: position[2] });
      // Shown only (the overlay reads the definition); `drop` records it.
      if (edit.ok) terrain.session.world.def.splines = edit.splines;
    },
    drop(actor) {
      const done = dragged;
      if (!done || done.actor !== actor) return;
      dragged = null;
      const after = worldTerrainSplines(done.terrain.session.world.def);
      step(done.terrain, "Move Landscape Spline Point", { ok: true, splines: after, active: done.active }, done.before);
    },
    undrag(actor) {
      const done = dragged;
      if (!done || done.actor !== actor) return;
      dragged = null;
      done.terrain.session.world.def.splines = done.before;
    },
    split: (actor) => act(actor, "Split Landscape Spline Segment", (splines, active) => splitLandscapeSplineSegment(splines, active, active.segmentId ?? "")),
    setSegments: (actor, patch) => act(actor, "Edit Landscape Spline Segments", (splines, active, terrain) => {
      const { layers } = terrain.session.world.def;
      return setLandscapeSplineSegments(splines, active, service.segments(actor), patch, layers[1]?.id ?? layers[0]?.id ?? "");
    }, true),
    async apply(actor, effect) {
      const splineId = service.active(actor).splineId;
      const spline = service.list(actor).find((entry) => entry.id === splineId);
      if (!spline) {
        status("No spline is selected.", "warning");
        return false;
      }
      return withTiles(actor, `apply the spline ${effect}`, (terrain) => {
        const keys = terrainSplineTileKeys(terrain.session.world.def, spline, effect);
        if (terrain.streams && keys.length > 0) status("Loading terrain for spline effects…");
        return keys;
      }, (terrain) => {
        const patches = createTerrainSplinePatches(terrain.session.world, spline, effect);
        if (patches.length === 0) {
          status(`No spline ${effect} change: enable the segment effect and adjust its settings.`);
          return false;
        }
        pushTerrainPatchStep(editor, editing, terrain, effect === "deform" ? "Apply Spline Terrain Deform" : "Apply Spline Layer Paint", patches, { apply: true });
        status(`Spline ${effect} applied (${patches.length} tile${patches.length === 1 ? "" : "s"}).`);
        return true;
      });
    },
  };
  return service;
}
