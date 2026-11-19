// Undo steps of terrain edits made of tile patches (plan 5d steps 2–3): a
// stroke, Fill Layer, Auto Paint. Forge WebGL SceneApp.executeTerrainPatchCommand
// @ forge-webgl-final: undo / redo replay the patches' before / after values on
// the edit session's tiles, mark them dirty and pinned, and the terrain drawn
// now (its binding may have been rebuilt since) re-reads them.

import { applyTerrainUndoPatches, revertTerrainUndoPatches, type TerrainUndoPatch } from "../../engine/terrain/terrainEdit.ts";
import type { EditableTerrain, TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import type { TerrainEditSession } from "../../engine/terrain/terrainEditSession.ts";
import type { EditorSession } from "../session/editorSession.ts";

/** Puts the session's edited tiles back into its world if a rebuilt stream let them go (they are the same objects). */
export function restoreEdited(session: TerrainEditSession): void {
  for (const [key, tile] of session.edited) if (!session.world.tiles.has(key)) session.world.tiles.set(key, tile);
}

/**
 * Loads and holds every tile of `terrain` (Forge's loadWholeWorldTerrain): a
 * streaming terrain demands them all and waits. Resolves to the release once
 * every tile is in as read; rejects (after releasing) when one could not be
 * read: nothing may then be written over the whole grid.
 */
export async function holdWholeTerrain(terrain: EditableTerrain, why: string, status: (message: string) => void): Promise<() => void> {
  const keys = terrain.session.world.def.tiles.map((tile) => tile.key);
  const release = (): void => terrain.release(keys);
  try {
    restoreEdited(terrain.session);
    const missing = keys.filter((key) => !terrain.session.world.tiles.has(key)).length;
    if (missing > 0) status(`Loading ${missing} terrain tile(s) to ${why}…`);
    await terrain.demand(keys);
    restoreEdited(terrain.session);
    const unread = keys.find((key) => !terrain.session.readable(key));
    if (unread) throw new Error(`terrain tile ${unread} could not be read`);
    return release;
  } catch (error) {
    release();
    throw error;
  }
}

/**
 * Records `patches` on `terrain` as one undo step labelled `label`. With
 * `apply`, their after side is written first (patches computed but not
 * applied: Fill Layer, Auto Paint); a stroke has already written its dabs.
 */
export function pushTerrainPatchStep(
  editor: EditorSession, editing: TerrainEditing, terrain: EditableTerrain, label: string,
  patches: readonly TerrainUndoPatch[], options: { readonly apply?: boolean } = {},
): void {
  const { actor, session } = terrain;
  const restore = (side: "before" | "after"): void => {
    restoreEdited(session);
    const dirty = (side === "after" ? applyTerrainUndoPatches : revertTerrainUndoPatches)(session.world, patches);
    session.markTiles(dirty.keys());
    // The terrain may have been drawn again since (a rebuilt binding): its current handle re-reads the tiles.
    const drawn = editing.find(actor);
    if (drawn?.session === session) drawn.changed(dirty);
  };
  if (options.apply) restore("after");
  editor.pushStep({ label, undo: () => restore("before"), redo: () => restore("after") });
}
