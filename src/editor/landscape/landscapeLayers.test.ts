import { describe, expect, test } from "vitest";
import type { ActorId } from "../../core/index.ts";
import { createTerrainEditWorld } from "../../engine/terrain/terrainEdit.ts";
import { createTerrainEditing, type EditableTerrain } from "../../engine/terrain/terrainEditing.ts";
import { TerrainEditSession } from "../../engine/terrain/terrainEditSession.ts";
import { terrainTileLayerWeight } from "../../engine/terrain/terrainTypes.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import type { EditorSession, SessionStep } from "../session/editorSession.ts";
import { createLandscapeLayers } from "./landscapeLayers.ts";

const ACTOR = "act_00000000000000000000000000000001" as ActorId;

/** A 2 × 1 terrain read from "disk", drawn in a fake editor: the steps and the binding's calls are recorded. */
function setup() {
  const flat = createFlatWorldTerrain({ name: "hill", tilesX: 2, tilesZ: 1, tileQuads: 64, spacing: 1, baseHeight: 0 });
  const world = createTerrainEditWorld(flat.def, []);
  const session = new TerrainEditSession(world, { document: "d", global: "g" });
  for (const [key, tile] of flat.tiles) {
    world.tiles.set(key, tile);
    session.recordTile(key, tile, "f32", `t${key}`);
  }
  const editing = createTerrainEditing();
  const calls = { changed: 0, layers: 0 };
  const terrain: EditableTerrain = {
    actor: ACTOR, component: "terrain", guid: "g", session, streams: false,
    changed: () => { calls.changed += 1; },
    definitionChanged: async () => { calls.layers += 1; },
    splinesChanged: () => {},
    roads: () => ({ chunks: 0, pieces: 0, triangles: 0, problems: [], building: false }),
    demand: async () => {},
    release: () => {},
  };
  editing.register(terrain);
  const steps: SessionStep[] = [];
  const editor = {
    level: { actor: () => ({ id: ACTOR, locked: false, class: null, components: {} }) },
    pushStep: (step: SessionStep) => steps.push(step),
  } as unknown as EditorSession;
  const layers = createLandscapeLayers({ editor, editing, status: () => {}, assetLabel: () => null, pickAsset: async () => null });
  return { session, editing, layers, steps, calls, tile: () => world.tiles.get("0_0")! };
}

describe("Landscape paint layers (plan 5d step 3)", () => {
  test("Add Layer is one undo step: definition and every tile dirty, the new layer active, undo restores both", async () => {
    const { session, editing, layers, steps, calls } = setup();
    const before = session.world.def.layers.map((layer) => layer.id);
    editing.update({ activeLayerId: before[0]! });
    expect(await layers.add(ACTOR)).toBe(true);
    expect(steps).toHaveLength(1);
    expect(session.world.def.layers).toHaveLength(before.length + 1);
    const added = session.world.def.layers.at(-1)!.id;
    expect(editing.settings.activeLayerId).toBe(added);
    expect(session.dirty).toBe(true);
    expect(session.dirtyKeys().sort()).toEqual(["0_0", "1_0"]);
    expect(calls.layers).toBe(1);
    steps[0]!.undo();
    expect(session.world.def.layers.map((layer) => layer.id)).toEqual(before);
    expect(editing.settings.activeLayerId).toBe(before[0]);
    steps[0]!.redo();
    expect(session.world.def.layers.at(-1)!.id).toBe(added);
    expect(calls.layers).toBe(3);
  });

  test("Fill Layer writes 100 % of the layer everywhere as one step; undo gives the weights back", async () => {
    const { session, layers, steps, tile } = setup();
    const target = session.world.def.layers[1]!.id;
    const weightOf = (layer: number) => terrainTileLayerWeight(tile(), layer, 0);
    const first = weightOf(0);
    expect(await layers.fill(ACTOR, target)).toBe(true);
    expect(steps).toHaveLength(1);
    expect(weightOf(1)).toBe(1);
    expect(weightOf(0)).toBe(0);
    steps[0]!.undo();
    expect(weightOf(0)).toBe(first);
    expect(weightOf(1)).toBe(0);
  });

  test("a layer material changes only the definition and redraws the layers", () => {
    const { session, layers, steps, calls } = setup();
    const id = session.world.def.layers[0]!.id;
    expect(layers.setMaterial(ACTOR, id, "ast_00000000000000000000000000000009")).toBe(true);
    expect(session.world.def.layers[0]!.material).toBe("ast_00000000000000000000000000000009");
    expect(session.dirty).toBe(true);
    expect(session.dirtyKeys()).toEqual([]);
    expect(calls.layers).toBe(1);
    steps[0]!.undo();
    expect(session.world.def.layers[0]!.material).toBeUndefined();
  });

  test("Remove Layer keeps one layer and moves the active one to the first remaining", async () => {
    const { session, editing, layers, steps } = setup();
    const ids = session.world.def.layers.map((layer) => layer.id);
    editing.update({ activeLayerId: ids[0]! });
    expect(await layers.remove(ACTOR, ids[0]!)).toBe(true);
    expect(session.world.def.layers.map((layer) => layer.id)).toEqual(ids.slice(1));
    expect(editing.settings.activeLayerId).toBe(ids[1]);
    steps[0]!.undo();
    expect(session.world.def.layers.map((layer) => layer.id)).toEqual(ids);
    expect(editing.settings.activeLayerId).toBe(ids[0]);
  });
});
