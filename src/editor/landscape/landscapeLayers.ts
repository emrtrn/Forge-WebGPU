// A terrain's paint layers in the editor (plan 5d step 3, INV-B04 / B05; Forge
// WebGL SceneApp @ forge-webgl-final: addSelectedLandscapeLayer,
// removeSelectedLandscapeLayer, setSelectedLandscapeLayerMaterial,
// fillSelectedLandscapeLayer, autoPaintSelectedLandscape). Each action is one
// undo step (`pushStep`) on the terrain's edit session; Save writes what it
// changed (landscapeSave.ts).
//
// - Fill Layer and Auto Paint rewrite every tile's weights: the whole terrain
//   is loaded first (a streaming one demands every tile and waits), the
//   patches are applied and kept for undo. A tile that could not be read stops
//   the action; nothing is written.
// - Add / Remove Layer change the definition and every tile's weight blocks
//   (engine terrainLayers.ts: a removed layer's weight goes to the others):
//   whole terrain too, the definition and every tile become dirty, and the
//   terrain is drawn again with its new layers (`layersChanged`).
// - A layer's material changes only the definition: no tile is loaded.
//
// Provided to the editor's world (`LandscapeLayersKey`) for the Landscape
// Details section, which reaches the world's services only.

import { parseComponentTypeTag } from "../../core/index.ts";
import { createServiceKey } from "../../core/world/services.ts";
import type { ActorId } from "../../core/id.ts";
import { addComponent } from "../../engine/edit/actorFields.ts";
import { LandscapeAutoPaint } from "../../features/terrain/schema.ts";
import { createTerrainAutoPaintPatches, type TerrainAutoPaintSettings } from "../../engine/terrain/terrainAutoPaint.ts";
import { createTerrainLayerFillPatches } from "../../engine/terrain/terrainEdit.ts";
import type { EditableTerrain, TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import { applyTerrainLayerState, createTerrainLayerAddition, createTerrainLayerRemoval, type TerrainLayerState } from "../../engine/terrain/terrainLayers.ts";
import { TERRAIN_MAX_LAYERS } from "../../engine/terrain/terrainTypes.ts";
import type { EditorSession } from "../session/editorSession.ts";
import { pushTerrainPatchStep, restoreEdited } from "./landscapeSteps.ts";

/** Forge's colour for a new layer. */
const NEW_LAYER_COLOR = "#55493b";

export interface LandscapeLayers {
  /** Every vertex becomes 100 % `layerId`; false when nothing ran. */
  fill(actor: ActorId, layerId: string): Promise<boolean>;
  /** A new layer at the end (Forge: `layer-<n>`, `Layer <n>`), made active. */
  add(actor: ActorId): Promise<boolean>;
  /** Removes `layerId`; its weight goes to the remaining layers. A terrain keeps one. */
  remove(actor: ActorId, layerId: string): Promise<boolean>;
  /** Assigns (null clears) the layer's `forge.material`. */
  setMaterial(actor: ActorId, layerId: string, material: string | null): boolean;
  /** Repaints the whole terrain from the rules. */
  autoPaint(actor: ActorId, settings: TerrainAutoPaintSettings): Promise<boolean>;
  /** The actor has its Auto Paint rules (`forge.landscapeAutoPaint`). */
  hasAutoPaint(actor: ActorId): boolean;
  /** Adds empty Auto Paint rules to the actor (a level edit, one undo step). */
  addAutoPaint(actor: ActorId): void;
  /** An action is loading tiles or applying. */
  readonly busy: boolean;
  /** For the layer material field (the Details' asset widgets). */
  assetLabel(guid: string): string | null;
  pickAsset(assetType: string | null): Promise<string | null>;
}

export const LandscapeLayersKey = createServiceKey<LandscapeLayers>("forge.editor.landscapeLayers");

export interface LandscapeLayersOptions {
  readonly editor: EditorSession;
  readonly editing: TerrainEditing;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  readonly assetLabel: (guid: string) => string | null;
  readonly pickAsset: (assetType: string | null) => Promise<string | null>;
}

export function createLandscapeLayers(options: LandscapeLayersOptions): LandscapeLayers {
  const { editor, editing, status } = options;
  let busy = false;

  /** The drawn editable terrain of `actor`, when the actor may be edited. */
  const terrainOf = (actor: ActorId): EditableTerrain | null => {
    const doc = editor.level.actor(actor);
    if (!doc || doc.locked) return null;
    return editing.find(actor) ?? null;
  };

  /**
   * Runs `work` with every tile of the terrain loaded and held (Forge's
   * loadWholeWorldTerrain); `work` gets the terrain as drawn after the wait,
   * or the action stops when it changed meanwhile.
   */
  const whole = async (actor: ActorId, why: string, work: (terrain: EditableTerrain) => boolean): Promise<boolean> => {
    if (busy) {
      status("Another terrain action is still running.", "warning");
      return false;
    }
    const terrain = terrainOf(actor);
    if (!terrain) return false;
    const keys = terrain.session.world.def.tiles.map((tile) => tile.key);
    busy = true;
    try {
      restoreEdited(terrain.session);
      const missing = keys.filter((key) => !terrain.session.world.tiles.has(key)).length;
      if (missing > 0) status(`Loading ${missing} terrain tile(s) to ${why}…`);
      await terrain.demand(keys);
      restoreEdited(terrain.session);
      if (terrainOf(actor) !== terrain) return false;
      const unread = keys.find((key) => !terrain.session.readable(key));
      if (unread) {
        status(`Terrain tile ${unread} could not be read; cannot ${why}.`, "warning");
        return false;
      }
      return work(terrain);
    } catch (error) {
      status(`Cannot ${why}: ${error instanceof Error ? error.message : String(error)}`, "error");
      return false;
    } finally {
      terrain.release(keys);
      busy = false;
    }
  };

  /** One undo step that swaps the layer state (definition + every tile's weights) and the active layer. */
  const layerStep = (terrain: EditableTerrain, label: string, change: { before: TerrainLayerState; after: TerrainLayerState }, active: { before: string; after: string }): void => {
    const { actor, session } = terrain;
    const apply = (state: TerrainLayerState, activeLayerId: string): void => {
      restoreEdited(session);
      applyTerrainLayerState(session.world, state);
      session.markTiles(state.weights.keys());
      session.markDefinitionDirty();
      editing.update({ activeLayerId });
      const drawn = editing.find(actor);
      if (drawn?.session === session) void drawn.layersChanged();
    };
    apply(change.after, active.after);
    editor.pushStep({ label, undo: () => apply(change.before, active.before), redo: () => apply(change.after, active.after) });
  };

  return {
    get busy() {
      return busy;
    },
    assetLabel: options.assetLabel,
    pickAsset: options.pickAsset,
    hasAutoPaint(actor) {
      const doc = editor.level.actor(actor);
      return doc !== undefined && doc.class === null
        && Object.values(doc.components).some((component) => parseComponentTypeTag(component.type)?.name === LandscapeAutoPaint.name);
    },
    addAutoPaint(actor) {
      const doc = editor.level.actor(actor);
      if (!doc || doc.locked || doc.class !== null || this.hasAutoPaint(actor)) return;
      editor.edit("Add Landscape Auto Paint", (tx) => tx.setActor(addComponent(doc, LandscapeAutoPaint)));
    },
    fill: (actor, layerId) => whole(actor, "fill a paint layer", (terrain) => {
      const layer = terrain.session.world.def.layers.findIndex((entry) => entry.id === layerId);
      if (layer < 0) return false;
      const patches = createTerrainLayerFillPatches(terrain.session.world, layer);
      if (patches.length === 0) {
        status(`Layer ${layerId} already covers the whole terrain.`);
        return true;
      }
      pushTerrainPatchStep(editor, editing, terrain, "Landscape Fill Layer", patches, { apply: true });
      status(`Filled layer ${layerId}.`);
      return true;
    }),
    autoPaint: (actor, settings) => whole(actor, "auto paint it", (terrain) => {
      const patches = createTerrainAutoPaintPatches(terrain.session.world, settings);
      if (patches.length === 0) {
        status("Auto Paint: the terrain already matches the rules.");
        return true;
      }
      pushTerrainPatchStep(editor, editing, terrain, "Landscape Auto Paint", patches, { apply: true });
      status(`Auto Paint applied to ${patches.length} tile${patches.length === 1 ? "" : "s"}.`);
      return true;
    }),
    add: (actor) => {
      const layers = terrainOf(actor)?.session.world.def.layers;
      if (!layers) return Promise.resolve(false);
      if (layers.length >= TERRAIN_MAX_LAYERS) {
        status(`A terrain has at most ${TERRAIN_MAX_LAYERS} paint layers.`, "warning");
        return Promise.resolve(false);
      }
      return whole(actor, "add a paint layer", (terrain) => {
        const { def } = terrain.session.world;
        if (def.layers.length >= TERRAIN_MAX_LAYERS) return false;
        const id = Array.from({ length: TERRAIN_MAX_LAYERS + 1 }, (_, i) => `layer-${i + 1}`).find((candidate) => !def.layers.some((layer) => layer.id === candidate))!;
        const change = createTerrainLayerAddition(terrain.session.world, { id, name: `Layer ${def.layers.length + 1}`, color: NEW_LAYER_COLOR });
        layerStep(terrain, "Add Landscape Paint Layer", change, { before: editing.settings.activeLayerId, after: id });
        return true;
      });
    },
    remove: (actor, layerId) => {
      const layers = terrainOf(actor)?.session.world.def.layers;
      if (!layers || !layers.some((layer) => layer.id === layerId)) return Promise.resolve(false);
      if (layers.length <= 1) {
        status("A terrain keeps at least one paint layer.", "warning");
        return Promise.resolve(false);
      }
      return whole(actor, "remove a paint layer", (terrain) => {
        const change = createTerrainLayerRemoval(terrain.session.world, layerId);
        const previous = editing.settings.activeLayerId;
        const next = change.after.layers.some((layer) => layer.id === previous) ? previous : change.after.layers[0]!.id;
        layerStep(terrain, "Remove Landscape Paint Layer", change, { before: previous, after: next });
        return true;
      });
    },
    setMaterial(actor, layerId, material) {
      const terrain = terrainOf(actor);
      const layer = terrain?.session.world.def.layers.find((entry) => entry.id === layerId);
      if (!terrain || !layer) return false;
      const next = material && material.length > 0 ? material : null;
      if ((layer.material ?? null) === next) return false;
      const before = layer.material;
      const { session } = terrain;
      const apply = (value: string | null | undefined): void => {
        const target = session.world.def.layers.find((entry) => entry.id === layerId);
        if (!target) return;
        if (value === undefined) delete target.material;
        else target.material = value;
        session.markDefinitionDirty();
        const drawn = editing.find(actor);
        if (drawn?.session === session) void drawn.layersChanged();
      };
      apply(next);
      editor.pushStep({
        label: next ? "Assign Landscape Layer Material" : "Clear Landscape Layer Material",
        undo: () => apply(before),
        redo: () => apply(next),
      });
      return true;
    },
  };
}
