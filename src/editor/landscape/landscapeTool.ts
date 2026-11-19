// The Landscape sculpt tool in the viewport (plan 5d step 2, INV-B03; Forge
// WebGL SceneApp's terrain stroke @ forge-webgl-final: beginTerrainStroke,
// applyTerrainStrokeDab, endTerrainStroke, completeTerrainStroke). Three-free:
// the terrain is read and written through the editing service (engine
// terrainEditing.ts), the viewport answers rays and draws the ring.
//
// - Active while the primary selected actor is a drawn, editable terrain (not
//   locked) and the Landscape mode is Sculpt. A left press on that terrain
//   (nothing else drawn in front of it) starts a stroke; elsewhere the press
//   selects as usual. Alt + left is a temporary Flatten, so it does not orbit.
// - Every pointer move is a dab (`applyTerrainBrush`) at the terrain under the
//   pointer. Modifiers pick the tool per dab, never the selected one (Forge):
//   Alt Flatten, Ctrl Smooth, Shift swaps Raise / Lower; Ctrl+Alt flattens to
//   the height under the first dab. Ramp: press, drag (the road's outline
//   follows, at the two ends' heights plus their offsets) and release lay one
//   ramp between the two points; a click alone changes nothing.
// - A streaming terrain loads the tiles under a dab first: the dab waits (the
//   last waiting dab is applied once they are in), the tiles stay held until
//   the stroke ends. A tile that could not be read is never written.
// - Releasing ends the stroke: its dabs are one undo step (`pushStep`) that
//   reverts / reapplies the tile patches. The tiles become dirty; Save writes
//   them (landscapeSave.ts).

import type { ActorId, Vec3 } from "../../core/index.ts";
import {
  applyTerrainBrush,
  applyTerrainUndoPatches,
  createTerrainPaintAccumulator,
  revertTerrainUndoPatches,
  type TerrainBrush,
  type TerrainDirtyRect,
  type TerrainPaintAccumulator,
  type TerrainUndoPatch,
} from "../../engine/terrain/terrainEdit.ts";
import type { EditableTerrain, LandscapeSettings, TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import type { TerrainEditSession } from "../../engine/terrain/terrainEditSession.ts";
import { terrainBrushTileKeys } from "../../engine/terrain/terrainEditorStreaming.ts";
import { raycastTerrain, terrainHeightAt } from "../../engine/terrain/terrainHeightQuery.ts";
import type { TerrainRamp, TerrainSculptTool } from "../../engine/terrain/terrainSculpt.ts";
import type { Ray } from "../../engine/gizmo/transformDrag.ts";
import type { EditorSession } from "../session/editorSession.ts";

/** Points of the brush ring. */
const RING_POINTS = 96;
/** The ring floats this far above the ground (metres). */
const RING_LIFT = 0.05;

/** What the tool asks of the viewport (three-free). */
export interface LandscapeToolViewport {
  pointerRay(clientX: number, clientY: number): Ray | null;
  /** The actor drawn under a point of the page; null for none. */
  pick(clientX: number, clientY: number): ActorId | null;
  setBrushCursor(points: readonly Vec3[] | null): void;
}

export interface LandscapeToolPointer {
  readonly pointerId: number;
  readonly button: number;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly clientX: number;
  readonly clientY: number;
}

export interface LandscapeToolOptions {
  readonly editor: EditorSession;
  readonly editing: TerrainEditing;
  readonly viewport: LandscapeToolViewport;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
}

export interface LandscapeTool {
  /** A left press: true when it starts a stroke (the viewport captures the pointer). */
  pointerDown(event: LandscapeToolPointer): boolean;
  /** A move: a dab while stroking, else the ring follows the pointer. True when the tool owns the pointer. */
  pointerMove(event: LandscapeToolPointer): boolean;
  pointerUp(event: LandscapeToolPointer): boolean;
  cancel(): void;
  /** The pointer left the viewport: the ring goes. */
  leave(): void;
  /** A stroke is running or finishing (its tiles are loading). */
  readonly busy: boolean;
  dispose(): void;
}

interface Stroke {
  readonly pointerId: number;
  readonly terrain: EditableTerrain;
  readonly session: TerrainEditSession;
  /** The tool the press resolved; Ramp waits for the release. */
  readonly tool: TerrainSculptTool;
  /** Height under the first dab, relative to the datum (Ctrl+Alt, Use Clicked Height). */
  readonly sampleHeight: number;
  rampStart: Vec3 | null;
  pending: TerrainBrush | null;
  readonly patches: TerrainUndoPatch[];
  readonly demanded: Set<string>;
  readonly paint: TerrainPaintAccumulator;
}

/** Forge's per-dab tool: Alt Flatten (wins over Ctrl), Ctrl Smooth, Shift swaps Raise and Lower. */
export function landscapeSculptTool(tool: TerrainSculptTool, event: Pick<LandscapeToolPointer, "altKey" | "ctrlKey" | "shiftKey">): TerrainSculptTool {
  if (event.altKey) return "flatten";
  if (event.ctrlKey) return "smooth";
  if (event.shiftKey && tool === "raise") return "lower";
  if (event.shiftKey && tool === "lower") return "raise";
  return tool;
}

/** Forge's flatten target: the first dab's height with Use Clicked Height or Ctrl+Alt, else the set target. */
export function landscapeFlattenTarget(settings: Pick<LandscapeSettings, "flattenUseClickedHeight" | "flattenTargetHeight">, sampleHeight: number, event: Pick<LandscapeToolPointer, "altKey" | "ctrlKey">): number {
  return settings.flattenUseClickedHeight || (event.ctrlKey && event.altKey) ? sampleHeight : settings.flattenTargetHeight;
}

/** Puts the session's edited tiles back into its world if a rebuilt stream let them go (they are the same objects). */
function restoreEdited(session: TerrainEditSession): void {
  for (const [key, tile] of session.edited) if (!session.world.tiles.has(key)) session.world.tiles.set(key, tile);
}

export function createLandscapeTool(options: LandscapeToolOptions): LandscapeTool {
  const { editor, editing, viewport, status } = options;
  let stroke: Stroke | null = null;
  let finishing = false;

  /** The terrain the tool works on now: the primary selection's, when it is editable and Sculpt is on. */
  const target = (): EditableTerrain | null => {
    if (editing.settings.mode !== "sculpt") return null;
    const primary = editor.selection.primary();
    if (primary === null) return null;
    const actor = editor.level.actor(primary);
    if (!actor || actor.locked) return null;
    return editing.find(primary) ?? null;
  };

  /** Where the pointer's ray meets the terrain's height field (world), the far map where a tile is not loaded. */
  const terrainHit = (terrain: EditableTerrain, clientX: number, clientY: number): Vec3 | null => {
    const ray = viewport.pointerRay(clientX, clientY);
    if (!ray) return null;
    const { def } = terrain.session.world;
    const local: Vec3 = [ray.origin[0] - def.origin[0], ray.origin[1] - def.origin[1], ray.origin[2] - def.origin[2]];
    const query = { tileQuads: def.tileQuads, spacing: def.spacing, tilesX: def.tilesX, tilesZ: def.tilesZ, origin: [0, 0, 0] as Vec3 };
    const partial = def.tiles.some(({ key }) => !terrain.session.world.tiles.has(key));
    const global = partial ? terrain.session.global?.map : undefined;
    const hit = raycastTerrain(query, terrain.session.world, local, ray.direction, 1e6, global);
    return hit ? [hit.point[0] + def.origin[0], hit.point[1] + def.origin[1], hit.point[2] + def.origin[2]] : null;
  };

  /** The ring around `centre`, on the ground where tiles are loaded. */
  const ring = (terrain: EditableTerrain, centre: Vec3, radius: number): Vec3[] => {
    const { world } = terrain.session;
    const points: Vec3[] = [];
    for (let i = 0; i < RING_POINTS; i += 1) {
      const angle = (i / RING_POINTS) * Math.PI * 2;
      const x = centre[0] + Math.cos(angle) * radius;
      const z = centre[2] + Math.sin(angle) * radius;
      const y = terrainHeightAt(world.def, world, x, z) ?? centre[1];
      points.push([x, y + RING_LIFT, z]);
    }
    return points;
  };

  const hover = (event: LandscapeToolPointer): boolean => {
    const terrain = target();
    if (!terrain || viewport.pick(event.clientX, event.clientY) !== terrain.actor) {
      viewport.setBrushCursor(null);
      return false;
    }
    const point = terrainHit(terrain, event.clientX, event.clientY);
    viewport.setBrushCursor(point ? ring(terrain, point, editing.settings.brushSize) : null);
    return point !== null;
  };

  /** Forge's ramp preview: the road's full-width outline between the press and `end`. */
  const rampOutline = (start: Vec3, end: Vec3): Vec3[] => {
    const settings = editing.settings;
    const dx = end[0] - start[0], dz = end[2] - start[2];
    const length = Math.hypot(dx, dz) || 1;
    const sx = (-dz / length) * settings.brushSize, sz = (dx / length) * settings.brushSize;
    const a: Vec3 = [start[0], start[1] + settings.rampStartOffset + RING_LIFT, start[2]];
    const b: Vec3 = [end[0], end[1] + settings.rampEndOffset + RING_LIFT, end[2]];
    return [[a[0] + sx, a[1], a[2] + sz], [b[0] + sx, b[1], b[2] + sz], [b[0] - sx, b[1], b[2] - sz], [a[0] - sx, a[1], a[2] - sz]];
  };

  const ramp = (current: Stroke, end: Vec3): TerrainRamp | undefined => {
    if (!current.rampStart) return undefined;
    const datum = current.session.world.def.origin[1];
    return {
      start: { x: current.rampStart[0], z: current.rampStart[2], height: current.rampStart[1] - datum },
      end: { x: end[0], z: end[2], height: end[1] - datum },
    };
  };

  /** Writes one dab into the session's world; the view re-reads the changed tiles. */
  const applyBrush = (current: Stroke, brush: TerrainBrush): void => {
    restoreEdited(current.session);
    let dirty: Map<string, TerrainDirtyRect>;
    try {
      const result = applyTerrainBrush(current.session.world, brush, { paint: current.paint });
      current.patches.push(...result.patches);
      dirty = result.dirty;
    } catch (error) {
      status(`Terrain brush failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }
    if (dirty.size === 0) return;
    current.session.markTiles(dirty.keys());
    current.terrain.changed(dirty);
  };

  const dab = (current: Stroke, point: Vec3, event: LandscapeToolPointer, end?: Vec3): void => {
    const settings = editing.settings;
    const { world } = current.session;
    current.pending = null;
    const rampValue = end ? ramp(current, end) : undefined;
    const brush: TerrainBrush = {
      ...settings,
      x: point[0], z: point[2], radius: settings.brushSize, strength: settings.strength, falloff: settings.falloff,
      mode: rampValue ? "ramp" : landscapeSculptTool(settings.tool, event),
      ...(rampValue ? { ramp: rampValue } : {}),
      // Heights are relative to the datum (origin Y).
      hitHeight: point[1] - world.def.origin[1],
      flattenTargetHeight: landscapeFlattenTarget(settings, current.sampleHeight, event),
    };
    const keys = terrainBrushTileKeys(world.def, point[0], point[2], settings.brushSize, rampValue, settings.rampShoulder);
    const fresh = keys.filter((key) => !current.demanded.has(key));
    for (const key of fresh) current.demanded.add(key);
    if (fresh.length > 0) current.terrain.demand(fresh).catch(() => {});
    restoreEdited(current.session);
    const missing = keys.filter((key) => !current.session.readable(key));
    if (missing.length > 0) {
      const failed = missing.find((key) => current.session.world.tiles.has(key));
      if (failed) {
        status(`Terrain tile ${failed} could not be read; it is not sculpted.`, "warning");
        return;
      }
      // Loading: this dab waits (the latest one is applied when the stroke ends, if the tiles are in by then).
      if (current.patches.length === 0) status(`Loading ${missing.length} terrain tile(s) under the brush…`);
      current.pending = brush;
      return;
    }
    applyBrush(current, brush);
  };

  const finish = async (current: Stroke): Promise<void> => {
    finishing = true;
    try {
      if (current.pending) {
        try {
          await current.terrain.demand([...current.demanded]).finally(() => current.terrain.release([...current.demanded]));
          if (editing.find(current.terrain.actor) === current.terrain) applyBrush(current, current.pending);
        } catch (error) {
          status(`Terrain sculpt cancelled: ${error instanceof Error ? error.message : String(error)}`, "warning");
        }
      }
    } finally {
      // Edited tiles stay pinned by the session; the others may stream out again.
      current.terrain.release(current.demanded);
      finishing = false;
    }
    if (current.patches.length === 0) return;
    const patches = current.patches;
    const { actor } = current.terrain;
    const { session } = current;
    const restore = (side: "before" | "after"): void => {
      restoreEdited(session);
      const dirty = (side === "after" ? applyTerrainUndoPatches : revertTerrainUndoPatches)(session.world, patches);
      session.markTiles(dirty.keys());
      // The terrain may have been drawn again since (a rebuilt binding): its current handle re-reads the tiles.
      const terrain = editing.find(actor);
      if (terrain?.session === session) terrain.changed(dirty);
    };
    editor.pushStep({ label: `Landscape ${current.tool}`, undo: () => restore("before"), redo: () => restore("after") });
  };

  const end = (event: LandscapeToolPointer | null): void => {
    const current = stroke;
    if (!current) return;
    stroke = null;
    if (current.rampStart) {
      const point = event ? terrainHit(current.terrain, event.clientX, event.clientY) : null;
      if (point && event) dab(current, current.rampStart, event, point);
      else status("Ramp cancelled: release over the selected terrain.");
    }
    // A cancelled pointer never applies a dab that has not changed the terrain yet.
    if (!event) current.pending = null;
    void finish(current);
  };

  return {
    get busy() {
      return stroke !== null || finishing;
    },
    pointerDown(event) {
      if (event.button !== 0 || stroke) return false;
      const terrain = target();
      if (!terrain) return false;
      // Something drawn in front of the terrain is selected as usual.
      if (viewport.pick(event.clientX, event.clientY) !== terrain.actor) return false;
      if (finishing) {
        status("Loading terrain for the previous sculpt…");
        return true;
      }
      const point = terrainHit(terrain, event.clientX, event.clientY);
      if (!point) return false;
      const { session } = terrain;
      const tool = landscapeSculptTool(editing.settings.tool, event);
      stroke = {
        pointerId: event.pointerId, terrain, session, tool,
        sampleHeight: point[1] - session.world.def.origin[1],
        rampStart: tool === "ramp" ? point : null,
        pending: null, patches: [], demanded: new Set(), paint: createTerrainPaintAccumulator(),
      };
      viewport.setBrushCursor(ring(terrain, point, editing.settings.brushSize));
      if (!stroke.rampStart) dab(stroke, point, event);
      return true;
    },
    pointerMove(event) {
      const current = stroke;
      if (!current) return hover(event);
      if (event.pointerId !== current.pointerId) return true;
      const point = terrainHit(current.terrain, event.clientX, event.clientY);
      if (point) {
        if (current.rampStart) viewport.setBrushCursor(rampOutline(current.rampStart, point));
        else {
          viewport.setBrushCursor(ring(current.terrain, point, editing.settings.brushSize));
          dab(current, point, event);
        }
      }
      return true;
    },
    pointerUp(event) {
      if (!stroke || event.pointerId !== stroke.pointerId) return false;
      end(event);
      return true;
    },
    cancel() {
      end(null);
    },
    leave() {
      if (!stroke) viewport.setBrushCursor(null);
    },
    dispose() {
      end(null);
      viewport.setBrushCursor(null);
    },
  };
}
