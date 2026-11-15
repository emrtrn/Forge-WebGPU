// Terrain: render binding (plan phase 3 step 8, decision 1: read-only
// drawing; phase 5a step 2: tile streaming and culling). Each `forge.terrain`
// component's data document comes from the host's cache (`terrain:<guid>`:
// definition, far map, paint layer materials; every tile when it does not
// stream) and draws as a TerrainView (render/sync/terrainView.ts), one per
// component in this world.
//
// - Placed by its definition's origin, as Forge's runtime placed a World
//   Terrain (the actor's transform is derived from it; moving a terrain is the
//   editor's, phase 5d).
// - Streaming (phase 5a decision 3): a terrain that streams gets Forge's
//   TerrainRuntimeStreaming around this world's camera (render range two
//   tiles, the passive cache four tiles' bytes), reading tiles through the
//   source's reader (fetch, decode in workers). A tile that arrives or leaves
//   refreshes the view. Editor and game stream alike. No collider: the stream
//   is built without collision (the collider's World binding is phase 6, which
//   moves the stream to where physics can share it).
// - Each frame the view streams its slots and re-selects, culled by the camera
//   and the scene's shadow-casting directional lights (cascades included).
// - Readiness: a placement holds the cache busy (`resources.busy`) from its
//   creation until its stream has nothing queued or in flight and its view no
//   tile waiting for a slot; tile reads count as loads (`resources.track`).
// - The component's landscape `material` is not drawn: Forge's runtime drew a
//   World Terrain with its paint layers only.
// - Picked from its height field (engine raycastTerrain over the live tiles,
//   the far map where a tile is not loaded), not from the drawn patch
//   (render/sync/pickTags.ts; plan phase 4 step 3).
//
// A terrain whose data fails to load draws nothing; the cache counts it and
// the host reports it.

import { Box3, Vector3 } from "three/webgpu";
import { parseComponentTypeTag, type WorldActor } from "../../core/index.ts";
import { tagSceneSource } from "../../engine/perf/sceneCost.ts";
import { raycastTerrain } from "../../engine/terrain/terrainHeightQuery.ts";
import { TerrainRuntimeStreaming } from "../../engine/terrain/terrainRuntimeStreaming.ts";
import { parseTileKey, type TerrainTileData } from "../../engine/terrain/terrainTypes.ts";
import { worldTerrainExtent } from "../../engine/terrain/worldTerrainActor.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import type { TerrainData as LoadedTerrain, TerrainTileReader } from "../../render/resources/terrains.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { tagActorObject, tagPickSurface, type PickSurface } from "../../render/sync/pickTags.ts";
import { TerrainView, terrainShadowCasters } from "../../render/sync/terrainView.ts";
import { Terrain, type TerrainData } from "./schema.ts";

/** A drawn terrain as a pick surface: its live height field, in world space (placed by its definition's origin). */
export function terrainPickSurface(terrain: LoadedTerrain, view: TerrainView): PickSurface {
  const { def } = terrain;
  const query = { tileQuads: def.tileQuads, spacing: def.spacing, tilesX: def.tilesX, tilesZ: def.tilesZ, origin: def.origin };
  return {
    raycast(origin, direction, far) {
      // Where a declared tile is not loaded, the ray reads the far map.
      const partial = def.tiles.some(({ key }) => {
        const { x, z } = parseTileKey(key)!;
        return view.source.tile(x, z) === undefined;
      });
      const hit = raycastTerrain(query, view.source, [origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z], far, partial ? view.global.map : undefined);
      return hit ? hit.distance : null;
    },
    bounds() {
      const { min, max } = view.heightRange();
      const [width, depth] = worldTerrainExtent(def);
      const [x, y, z] = def.origin;
      return new Box3(new Vector3(x, y + min, z), new Vector3(x + width, y + max, z + depth));
    },
  };
}

interface Placed {
  view: TerrainView | null;
  stream: TerrainRuntimeStreaming | null;
  reader: TerrainTileReader | null;
  /** Ends the readiness hold; null while not held. */
  busy: (() => void) | null;
  removed: boolean;
  readonly key: string | null;
}

export default defineRenderBinding({
  feature: "forge.terrain",
  create(ctx) {
    const placed = new Map<string, Placed>();
    const camera = new Vector3();
    const terrainsOf = (actor: WorldActor) =>
      Object.entries(actor.components).filter(([, component]) => parseComponentTypeTag(component.type)?.name === Terrain.name);

    const show = (actor: WorldActor, key: string, entry: Placed, terrain: LoadedTerrain): void => {
      const document = { def: terrain.def, tiles: new Map<string, TerrainTileData>(), globalAttributes: terrain.global };
      const view = new TerrainView({ def: terrain.def, global: terrain.global, tiles: terrain.tiles ?? document.tiles, layers: terrain.layers });
      if (terrain.tiles === null) {
        const reader = terrain.openTiles();
        entry.reader = reader;
        entry.stream = new TerrainRuntimeStreaming(document, { id: actor.id, name: actor.name, collision: false }, {
          fetch: (tile, signal) => ctx.resources.track(reader.read(tile, signal)),
          changed: (tile) => view.refreshTile(tile),
          addColliders: () => {},
          removeColliders: () => {},
          clock: () => performance.now(),
          warn: (message) => console.warn(`forge render: terrain ${actor.name}: ${message}`),
        });
      }
      view.mesh.name = `${actor.name}/${key}`;
      // Forge framed a level by its placements, never its terrain.
      view.mesh.userData.framing = false;
      tagSceneSource(view.mesh, "terrain");
      tagActorObject(view.mesh, actor.id);
      tagPickSurface(view.mesh, terrainPickSurface(terrain, view));
      entry.view = view;
      ctx.root.add(view.mesh);
    };

    const add = (actor: WorldActor, key: string, data: TerrainData): void => {
      const id = `${actor.id}/${key}`;
      const entry: Placed = { view: null, stream: null, reader: null, busy: null, removed: false, key: data.data === null ? null : resourceKey.terrain(data.data) };
      placed.set(id, entry);
      if (data.data === null) return;
      entry.busy = ctx.resources.busy();
      ctx.resources.terrain(data.data).then(
        (terrain) => {
          if (!entry.removed) show(actor, key, entry, terrain);
        },
        () => {
          // Counted by the cache and reported by the host; nothing is drawn.
          entry.busy?.();
          entry.busy = null;
        },
      );
    };

    const remove = (id: string): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      entry.removed = true;
      entry.stream?.dispose();
      entry.reader?.dispose();
      entry.view?.dispose();
      entry.busy?.();
      entry.busy = null;
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
        frame.camera.updateMatrixWorld();
        let casters: ReturnType<typeof terrainShadowCasters> | null = null;
        for (const entry of placed.values()) {
          const { view, stream } = entry;
          if (!view) continue;
          stream?.update([{ position: [camera.x, camera.z] }]);
          casters ??= terrainShadowCasters(ctx.scene);
          view.update(frame.camera, casters);
          const stats = stream?.world.stats();
          const settled = (!stats || stats.queued + stats.inFlight === 0) && view.pendingUploads === 0;
          if (settled && entry.busy) {
            entry.busy();
            entry.busy = null;
          } else if (!settled && !entry.busy) {
            entry.busy = ctx.resources.busy();
          }
        }
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
      },
    };
  },
});
