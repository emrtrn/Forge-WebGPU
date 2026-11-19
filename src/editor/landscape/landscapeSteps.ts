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
