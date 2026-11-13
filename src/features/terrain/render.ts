// Terrain: render binding (plan phase 3 step 8, decision 1: read-only
// drawing). Each `forge.terrain` component's data document comes from the
// host's cache (`terrain:<guid>`: definition, every tile, paint layer
// materials) and draws as spike S2's TSL CDLOD terrain (render/materials/
// terrain.ts), one view per component in this world.
//
// - Placed by its definition's origin, as Forge's runtime placed a World
//   Terrain (the actor's transform is derived from it; moving a terrain is the
//   editor's, phase 4).
// - LOD nodes are re-selected when the camera moved more than 0.1 m (the
//   selection depends on its position only). No frustum cull: Forge's cull by
//   the view and shadow-light frustums is production quality (5a); without it
//   a hill behind the camera still casts its shadow.
// - The component's landscape `material` is not drawn: Forge's runtime drew a
//   World Terrain with its paint layers only.
//
// A terrain whose data fails to load draws nothing; the cache counts it and
// the host reports it.

import { Vector3 } from "three/webgpu";
import { parseComponentTypeTag, type WorldActor } from "../../core/index.ts";
import { tagSceneSource } from "../../engine/perf/sceneCost.ts";
import { createTerrainView, type TerrainView } from "../../render/materials/terrain.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { Terrain, type TerrainData } from "./schema.ts";

/** Squared metres the camera moves before the LOD nodes are selected again. */
const RESELECT_DISTANCE_SQ = 0.01;

interface Placed {
  view: TerrainView | null;
  removed: boolean;
  readonly key: string | null;
  readonly selectedAt: Vector3;
}

export default defineRenderBinding({
  feature: "forge.terrain",
  create(ctx) {
    const placed = new Map<string, Placed>();
    const camera = new Vector3();
    const terrainsOf = (actor: WorldActor) =>
      Object.entries(actor.components).filter(([, component]) => parseComponentTypeTag(component.type)?.name === Terrain.name);

    const add = (actor: WorldActor, key: string, data: TerrainData): void => {
      const id = `${actor.id}/${key}`;
      const entry: Placed = { view: null, removed: false, key: data.data === null ? null : resourceKey.terrain(data.data), selectedAt: new Vector3(Infinity, 0, 0) };
      placed.set(id, entry);
      if (data.data === null) return;
      ctx.resources.terrain(data.data).then(
        (terrain) => {
          if (entry.removed) return;
          const view = createTerrainView(terrain, camera);
          view.mesh.name = `${actor.name}/${key}`;
          // Forge framed a level by its placements, never its terrain.
          view.mesh.userData.framing = false;
          tagSceneSource(view.mesh, "terrain");
          entry.view = view;
          ctx.root.add(view.mesh);
        },
        () => {
          // Counted by the cache and reported by the host; nothing is drawn.
        },
      );
    };

    const remove = (id: string): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      entry.removed = true;
      entry.view?.dispose();
      if (entry.key !== null) ctx.resources.release(entry.key);
    };

    return {
      actorsAdded(actors) {
        for (const actor of actors) {
          for (const [key, component] of terrainsOf(actor)) add(actor, key, component as unknown as TerrainData);
        }
      },
      actorsRemoved(actors) {
        for (const actor of actors) for (const [key] of terrainsOf(actor)) remove(`${actor.id}/${key}`);
      },
      sync(frame) {
        if (!frame.camera) return;
        frame.camera.getWorldPosition(camera);
        for (const entry of placed.values()) {
          if (!entry.view || entry.selectedAt.distanceToSquared(camera) <= RESELECT_DISTANCE_SQ) continue;
          entry.view.select(camera, null);
          entry.selectedAt.copy(camera);
        }
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
      },
    };
  },
});
