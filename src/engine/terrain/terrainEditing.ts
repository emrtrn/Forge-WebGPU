// Terrain editing in the editor's world (plan 5d step 2): the meeting point of
// the terrain render binding (which reads, streams and draws the tiles) and the
// editor's Landscape tools (which change them). The editor provides it before
// the level is assembled; the game never does, so a binding that finds it
// draws an editable terrain and one that does not draws as before.
//
// - Sessions are per terrain asset and outlive a binding (a rebuilt terrain, an
//   actor hidden and shown keep their unsaved edits): `session(guid, create)`.
// - A drawn editable terrain registers a handle: the actor and component, its
//   session, and the binding's hooks (tiles changed -> the view re-reads them;
//   tiles a stroke needs -> the stream keeps them resident).
// - The Landscape settings (Forge's LandscapeSculptSettings: mode, tool, brush;
//   step 3: the paint tool, the active layer and the view mode) are the page's,
//   shared by the Details section and the viewport tool. The view mode is an
//   editor preview of the drawn terrain only: never in the level, never in Play
//   (the game has no editing service).
//
// DOM-free and three-free: the editor and the render binding both read it.

import type { ActorId } from "../../core/id.ts";
import { createServiceKey } from "../../core/world/services.ts";
import type { TerrainDirtyRect } from "./terrainEdit.ts";
import type { LandscapeWeightBrushMode } from "./landscapeBrush.ts";
import type { TerrainEditSession } from "./terrainEditSession.ts";
import { DEFAULT_TERRAIN_SCULPT_SETTINGS, type TerrainSculptSettings, type TerrainSculptTool } from "./terrainSculpt.ts";

/** Forge's World Terrain sculpt tools, in its order. */
export const LANDSCAPE_SCULPT_TOOLS: readonly TerrainSculptTool[] = ["raise", "lower", "smooth", "flatten", "noise", "ramp", "terrace", "erosion"];

export type LandscapeEditMode = "sculpt" | "paint";

/** Forge's paint tools: lay the active layer, take it away, even out the weights. */
export type LandscapePaintTool = LandscapeWeightBrushMode;
export const LANDSCAPE_PAINT_TOOLS: readonly LandscapePaintTool[] = ["paint", "erase", "smoothWeights"];

/** Paint mode's tab (Forge's LandscapePaintPanel): the brush, or the one-shot Auto Paint rules (no brush in the viewport). */
export type LandscapePaintPanel = "brush" | "auto";

/** Forge's LandscapeViewMode: the lit look, or a height / slope / active layer preview. */
export type LandscapeViewMode = "lit" | "height" | "slope" | "layer";
export const LANDSCAPE_VIEW_MODES: readonly LandscapeViewMode[] = ["lit", "height", "slope", "layer"];

/** Forge's LandscapeSculptSettings (sculpt and paint). */
export interface LandscapeSettings extends TerrainSculptSettings {
  readonly mode: LandscapeEditMode;
  readonly tool: TerrainSculptTool;
  readonly paintTool: LandscapePaintTool;
  readonly paintPanel: LandscapePaintPanel;
  /** The paint layer's id; one a terrain does not have paints nothing (the panel picks the terrain's first). */
  readonly activeLayerId: string;
  readonly viewMode: LandscapeViewMode;
  /** Radius in metres. */
  readonly brushSize: number;
  readonly strength: number;
  readonly falloff: number;
  /** Metres relative to the terrain's datum (origin Y). */
  readonly flattenTargetHeight: number;
  /** Flatten to the height under the first dab of each drag instead of the target. */
  readonly flattenUseClickedHeight: boolean;
}

/** Forge's defaults (SceneApp.landscapeSculptSettings). */
export const DEFAULT_LANDSCAPE_SETTINGS: Readonly<LandscapeSettings> = {
  ...DEFAULT_TERRAIN_SCULPT_SETTINGS,
  mode: "sculpt",
  tool: "raise",
  paintTool: "paint",
  paintPanel: "brush",
  activeLayerId: "",
  viewMode: "lit",
  brushSize: 6,
  strength: 0.25,
  falloff: 2,
  flattenTargetHeight: 0,
  flattenUseClickedHeight: false,
};

/** One drawn editable terrain, registered by its render binding. */
export interface EditableTerrain {
  readonly actor: ActorId;
  /** The component's key in the actor. */
  readonly component: string;
  /** The terrain data document's GUID. */
  readonly guid: string;
  readonly session: TerrainEditSession;
  /** True when its tiles stream (a stroke may wait for some). */
  readonly streams: boolean;
  /** Tiles changed in the session's world: the view re-reads these rectangles (slots, normals, far map, picking). */
  changed(dirty: ReadonlyMap<string, TerrainDirtyRect>): void;
  /**
   * The session's definition changed beyond tile data (paint layers added,
   * removed, a material; a move; an Expand's new grid): the far map is rebuilt
   * from the tiles when every one is resident, and the terrain is drawn again
   * from the session. Resolves when it is.
   */
  definitionChanged(): Promise<void>;
  /** Keeps `keys` resident until released; resolves when every declared one is in the world as read, rejects when one fails to read. */
  demand(keys: Iterable<string>): Promise<void>;
  release(keys: Iterable<string>): void;
}

export interface TerrainEditing {
  /** The edit session of terrain `guid`, made by `create` the first time. */
  session(guid: string, create: () => TerrainEditSession): TerrainEditSession;
  /** Every session made so far (saved or not). */
  sessions(): ReadonlyMap<string, TerrainEditSession>;
  /** Forgets a session without unsaved edits (its files changed on disk); false when it has some or none exists. */
  drop(guid: string): boolean;
  register(terrain: EditableTerrain): () => void;
  /** Every drawn editable terrain. */
  list(): readonly EditableTerrain[];
  /** The drawn editable terrain of an actor (its first terrain component unless `component` is named). */
  find(actor: ActorId, component?: string): EditableTerrain | undefined;
  readonly settings: Readonly<LandscapeSettings>;
  update(patch: Partial<LandscapeSettings>): void;
  /** A terrain registered or left, or the settings changed; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
}

export const TerrainEditingKey = createServiceKey<TerrainEditing>("forge.terrainEditing");

export function createTerrainEditing(settings: Partial<LandscapeSettings> = {}): TerrainEditing {
  const sessions = new Map<string, TerrainEditSession>();
  const terrains = new Set<EditableTerrain>();
  const listeners = new Set<() => void>();
  let current: LandscapeSettings = { ...DEFAULT_LANDSCAPE_SETTINGS, ...settings };
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };
  return {
    session(guid, create) {
      let found = sessions.get(guid);
      if (!found) sessions.set(guid, (found = create()));
      return found;
    },
    sessions: () => sessions,
    drop(guid) {
      const found = sessions.get(guid);
      if (!found || found.dirty) return false;
      return sessions.delete(guid);
    },
    register(terrain) {
      terrains.add(terrain);
      notify();
      return () => {
        if (terrains.delete(terrain)) notify();
      };
    },
    list: () => [...terrains],
    find(actor, component) {
      for (const terrain of terrains) if (terrain.actor === actor && (component === undefined || terrain.component === component)) return terrain;
      return undefined;
    },
    get settings() {
      return current;
    },
    update(patch) {
      const next = { ...current, ...patch };
      if (Object.keys(next).every((key) => Object.is(next[key as keyof LandscapeSettings], current[key as keyof LandscapeSettings]))) return;
      current = next;
      notify();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
