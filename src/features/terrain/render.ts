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
//   and the scene's shadow-casting directional lights (cascades included), and
//   follows the quality profile's terrain self shadow and far tiling (step 3).
// - Readiness: a placement holds the cache busy (`resources.busy`) from its
//   creation until its stream has nothing queued or in flight and its view no
//   tile waiting for a slot; tile reads count as loads (`resources.track`).
// - The component's landscape `material` is not drawn: Forge's runtime drew a
//   World Terrain with its paint layers only.
// - Picked from its height field (engine raycastTerrain over the live tiles,
//   the far map where a tile is not loaded), not from the drawn patch
//   (render/sync/pickTags.ts; plan phase 4 step 3).
// - A streamed terrain's mesh carries its stream for the `?debug` terrain map
//   (render/sync/debugTags.ts; phase 5a step 4), every terrain's its view for
//   the G8 collider match (step 5).
//
// - Editing (plan 5d step 2): in the editor's world (`TerrainEditingKey`
//   provided) a terrain draws from its edit session (engine
//   terrainEditSession.ts), which outlives this binding: the session's world
//   is the tile map the view and the stream share, its far map the view's.
//   Tiles still stream; the editor's reader reads each file with its revision
//   and decodes it against the session's definition (a save may have widened
//   its height range), and hands an edited tile back instead of the disk's.
//   Edited tiles and those a stroke demands stay resident (`kept`). The
//   binding registers the terrain with the editing service: the Landscape
//   tool writes tiles and calls `changed`, the view re-reads them.
// - Paint layers (5d step 3): the session's definition may differ from the
//   cache's (a layer added, removed, a material assigned, saved or not); the
//   terrain draws with the session's layers. `definitionChanged` (layers, a
//   move, an Expand's grid, step 4) rebuilds the far map from the tiles when
//   all are resident and draws the terrain again from the session. While the
//   gizmo drags an editable terrain's actor, its mesh follows by the actor's
//   offset from where it was drawn; the editor moves the definition when the
//   move lands (landscapeTerrain.ts), which draws it again. The
//   Landscape view mode (lit / height / slope / layer) is the editing
//   service's setting, passed to the view each frame; only an editor view has
//   it compiled in.
// - Spline meshes (5d step 5, INV-G21): the definition's road meshes are made
//   when the terrain is drawn (render/sync/roadMeshes.ts), in the game and the
//   editor alike; `splinesChanged` and edits of the ground under an aligned
//   road build them again.
//
// A terrain whose data fails to load draws nothing; the cache counts it and
// the host reports it.

import { Box3, Vector3 } from "three/webgpu";
import { parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import { tagSceneSource } from "../../engine/perf/sceneCost.ts";
import { raycastTerrain, terrainFaceNormalAt, terrainSmoothNormalAt } from "../../engine/terrain/terrainHeightQuery.ts";
import { createTerrainEditWorld } from "../../engine/terrain/terrainEdit.ts";
import { TerrainEditingKey, type EditableTerrain } from "../../engine/terrain/terrainEditing.ts";
import { TerrainEditSession } from "../../engine/terrain/terrainEditSession.ts";
import { validateTerrainTile } from "../../engine/terrain/terrainLoader.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource, type TerrainGlobalAttributes } from "../../engine/terrain/terrainRenderSource.ts";
import { TerrainResidencyKey, type TerrainResidencyHandle } from "../../engine/terrain/terrainResidency.ts";
import type { TerrainRuntimeStreaming } from "../../engine/terrain/terrainRuntimeStreaming.ts";
import { parseTileKey, terrainTileWorldSize, type TerrainTileData } from "../../engine/terrain/terrainTypes.ts";
import { KeptRegionsKey } from "../../engine/world/keptRegions.ts";
import type { StreamingSource } from "../../engine/world/streamingPolicy.ts";
import { worldTerrainExtent } from "../../engine/terrain/worldTerrainActor.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import type { TerrainData as LoadedTerrain, TerrainLayerInput } from "../../render/resources/terrains.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { tagTerrainStreaming, tagTerrainView } from "../../render/sync/debugTags.ts";
import { createRoadMeshes, type RoadMeshes } from "../../render/sync/roadMeshes.ts";
import { tagActorObject, tagPickSurface, type PickSurface } from "../../render/sync/pickTags.ts";
import { TerrainView, terrainShadowCasters } from "../../render/sync/terrainView.ts";
import { publishTerrainSurface, terrainSurface, withdrawTerrainSurface } from "../../render/sync/terrainSurfaces.ts";
import { Terrain, type TerrainData } from "./schema.ts";

/** A drawn terrain as a pick surface: its live height field, in world space (placed by its definition's origin). */
export function terrainPickSurface(terrain: Pick<LoadedTerrain, "def">, view: TerrainView): PickSurface {
  const { def } = terrain;
  // Forge's renderer cast in the terrain-local frame (origin 0): the far map's
  // heights are relative to the datum, as the tiles' are.
  const query = { tileQuads: def.tileQuads, spacing: def.spacing, tilesX: def.tilesX, tilesZ: def.tilesZ, origin: [0, 0, 0] as [number, number, number] };
  return {
    raycast(origin, direction, far) {
      // Where a declared tile is not loaded, the ray reads the far map.
      const partial = def.tiles.some(({ key }) => {
        const { x, z } = parseTileKey(key)!;
        return view.source.tile(x, z) === undefined;
      });
      const local: [number, number, number] = [origin.x - def.origin[0], origin.y - def.origin[1], origin.z - def.origin[2]];
      const hit = raycastTerrain(query, view.source, local, [direction.x, direction.y, direction.z], far, partial ? view.global.map : undefined);
      return hit ? hit.distance : null;
    },
    // The shading normal, as the foliage ring aligns to; none where the tile under the point is not loaded.
    normal: (x, z) => (terrainFaceNormalAt(def, view.source, x, z) ? terrainSmoothNormalAt(def, view.source, x, z) : null),
    bounds() {
      const { min, max } = view.heightRange();
      const [width, depth] = worldTerrainExtent(def);
      const [x, y, z] = def.origin;
      return new Box3(new Vector3(x, y + min, z), new Vector3(x + width, y + max, z + depth));
    },
  };
}

interface Placed {
  readonly actor: ActorId;
  view: TerrainView | null;
  roads: RoadMeshes | null;
  stream: TerrainRuntimeStreaming | null;
  residency: TerrainResidencyHandle | null;
  /** The sources of the stream's last update. */
  sources: readonly StreamingSource[];
  /** Ends the readiness hold; null while not held. */
  busy: (() => void) | null;
  /** The last frame's readiness: nothing streaming, no tile waiting for a slot. */
  settled: boolean;
  removed: boolean;
  readonly key: string | null;
  /** Editor only: the edit session drawn, the registration's end, the tiles a stroke holds and who waits for them. */
  session: TerrainEditSession | null;
  unregister: (() => void) | null;
  /** Bumped by each rebuild for a changed definition: a slower, older one gives way. */
  generation: number;
  /** The actor as this world has it now, and its position when the terrain was drawn (the drag offset's zero). */
  latest: WorldActor;
  placedAt: readonly [number, number, number];
  readonly held: Map<string, number>;
  readonly demands: { readonly keys: readonly string[]; resolve(): void; reject(error: Error): void }[];
}

/** The layers' drawn inputs are the same: the cache's inputs serve. */
function sameLayers(a: WorldTerrainLayers, b: WorldTerrainLayers): boolean {
  return a.length === b.length && a.every((layer, i) => layer.id === b[i]!.id && (layer.material ?? null) === (b[i]!.material ?? null) && layer.color === b[i]!.color
    && (layer.physicalMaterial ?? null) === (b[i]!.physicalMaterial ?? null) && JSON.stringify(layer.weather ?? {}) === JSON.stringify(b[i]!.weather ?? {})
    && layer.forestFloorPatchSeed === b[i]!.forestFloorPatchSeed);
}
type WorldTerrainLayers = LoadedTerrain["def"]["layers"];

/** A far map of one's own: the editor writes it per dab, the cache's stays as read. */
function cloneGlobal(global: TerrainGlobalAttributes): TerrainGlobalAttributes {
  return { map: { ...global.map, heights: global.map.heights.slice() }, normals: global.normals.slice(), weights: global.weights.slice() };
}

export default defineRenderBinding({
  feature: "forge.terrain",
  create(ctx) {
    const residency = ctx.world.services.require(TerrainResidencyKey);
    const placed = new Map<string, Placed>();
    const camera = new Vector3();
    const terrainsOf = (actor: WorldActor) =>
      Object.entries(actor.components).filter(([, component]) => parseComponentTypeTag(component.type)?.name === Terrain.name);

    /** The editor's session of this terrain (null in a game, or when it cannot be edited), with the map it draws from. */
    const editSession = (guid: string, terrain: LoadedTerrain): TerrainEditSession | null => {
      const editing = ctx.world.services.get(TerrainEditingKey);
      if (!editing) return null;
      let session: TerrainEditSession;
      try {
        session = editing.session(guid, () => new TerrainEditSession(createTerrainEditWorld(terrain.def, []), terrain.revisions));
      } catch (error) {
        console.warn(`forge render: terrain ${guid} cannot be edited`, error);
        return null;
      }
      session.global ??= cloneGlobal(terrain.global);
      const { tiles } = session.world;
      // What a former binding's stream left is read again; edited tiles stay.
      for (const tileKey of [...tiles.keys()]) if (!session.edited.has(tileKey)) tiles.delete(tileKey);
      for (const [tileKey, tile] of terrain.tiles ?? []) {
        if (tiles.has(tileKey)) continue;
        const own: TerrainTileData = { ...tile, heights: tile.heights.slice(), weights: tile.weights.slice() };
        tiles.set(tileKey, own);
        const file = terrain.revisions.tiles.get(tileKey);
        session.recordTile(tileKey, own, file?.format ?? "f32", file?.revision ?? null);
      }
      return session;
    };

    /** The layers to draw: the session's definition when it changed them, else the cache's. */
    const layersOf = async (terrain: LoadedTerrain, session: TerrainEditSession | null): Promise<readonly TerrainLayerInput[]> =>
      session && !sameLayers(session.world.def.layers, terrain.def.layers) ? terrain.layersFor(session.world.def) : terrain.layers;

    const show = (actor: WorldActor, key: string, entry: Placed, terrain: LoadedTerrain, guid: string, session: TerrainEditSession | null, layers: readonly TerrainLayerInput[]): void => {
      entry.session = session;
      entry.placedAt = [...actor.transform.p] as [number, number, number];
      const def = session?.world.def ?? terrain.def;
      const global = session?.global ?? terrain.global;
      const document = { def, tiles: session?.world.tiles ?? new Map(terrain.tiles ?? []), globalAttributes: global };
      const quality = ctx.quality();
      const view = new TerrainView({
        def,
        global,
        tiles: session ? session.world.tiles : (terrain.tiles ?? document.tiles),
        layers,
        selfShadow: quality.terrainSelfShadow,
        farTiling: quality.terrainFarTiling,
        editorViews: session !== null,
        ...(ctx.precipitationCover ? {
          sheltered: (position) => ctx.precipitationCover!.coverAt(position),
        } : {}),
      });
      const reader = terrain.tiles === null && !session ? terrain.openTiles() : null;
      let fetch: ((tile: string, signal: AbortSignal) => Promise<TerrainTileData>) | undefined;
      if (terrain.tiles === null) {
        // The editor reads a file with its revision and checks it against the session's definition; an edited tile comes back as edited.
        fetch = session
          ? (tile: string, signal: AbortSignal): Promise<TerrainTileData> => {
            const edited = session.edited.get(tile);
            if (edited) return Promise.resolve(edited);
            return ctx.resources.track(terrain.readTile(tile, signal).then((read) => {
              const decoded = validateTerrainTile(session.world.def, tile, read.bytes);
              session.recordTile(tile, decoded, decoded.heightFormat, read.revision);
              return decoded;
            }));
          }
          : (tile, signal) => ctx.resources.track(reader!.read(tile, signal));
      }
      entry.residency = residency.place({
        actor: actor.id, component: key, document,
        ...(fetch ? { fetch } : {}),
        ...(reader ? { disposeReader: () => reader.dispose() } : {}),
        changed: (tile) => view.refreshTile(tile),
        warn: (message) => console.warn(`forge render: terrain ${actor.name}: ${message}`),
      });
      entry.stream = entry.residency.stream;
      view.mesh.name = `${actor.name}/${key}`;
      // Forge framed a level by its placements, never its terrain.
      view.mesh.userData.framing = false;
      tagSceneSource(view.mesh, "terrain");
      tagActorObject(view.mesh, actor.id);
      tagPickSurface(view.mesh, terrainPickSurface({ def }, view));
      tagTerrainView(view.mesh, { view, def, actor: actor.id, component: key });
      if (entry.stream) tagTerrainStreaming(view.mesh, { stream: entry.stream, sources: () => entry.sources });
      entry.view = view;
      ctx.root.add(view.mesh);
      entry.roads = createRoadMeshes({
        ctx, actor: actor.id, component: key, name: `${actor.name}/${key}`,
        input: () => ({
          def: session?.world.def ?? def,
          tiles: session ? session.world.tiles : (terrain.tiles ?? document.tiles),
          load: async (tile) => session?.edited.get(tile) ?? validateTerrainTile(session?.world.def ?? def, tile, (await terrain.readTile(tile)).bytes),
        }),
      });
      // The foliage ring grows on the live tiles (plan 5c F1).
      publishTerrainSurface(ctx.scene, actor.id, {
        def, tiles: view.source, existingTiles: new Set(def.tiles.map((tile) => tile.key)), global,
        settled: () => entry.settled,
        setFarTint: (tint) => view.setFarTint(tint),
      });
      const editing = ctx.world.services.get(TerrainEditingKey);
      if (session && editing) {
        const handle: EditableTerrain = {
          actor: actor.id,
          component: key,
          guid,
          session,
          streams: entry.stream !== null,
          changed: (dirty) => {
            for (const [tileKey, rect] of dirty) view.updateTile(tileKey, rect);
            entry.roads?.groundChanged(dirty.keys());
          },
          splinesChanged: () => entry.roads?.rebuild(),
          roads: () => entry.roads?.stats() ?? { chunks: 0, pieces: 0, triangles: 0, problems: [], building: false },
          definitionChanged: async () => {
            const generation = ++entry.generation;
            const { world } = session;
            if (world.def.tiles.every(({ key: tileKey }) => world.tiles.has(tileKey))) {
              session.global = buildTerrainGlobalAttributes(worldTerrainRenderSource(world.def, world.tiles));
            }
            const next = await terrain.layersFor(world.def);
            if (entry.removed || entry.session !== session || entry.generation !== generation) return;
            hide(entry);
            // What this stream left is read again by the next one; edited tiles stay.
            for (const tileKey of [...world.tiles.keys()]) if (!session.edited.has(tileKey)) world.tiles.delete(tileKey);
            show(entry.latest, key, entry, terrain, guid, session, next);
          },
          demand: (keys) => {
            const declared = new Set(def.tiles.map((tile) => tile.key));
            const wanted = [...keys].filter((tileKey) => declared.has(tileKey));
            for (const tileKey of wanted) entry.held.set(tileKey, (entry.held.get(tileKey) ?? 0) + 1);
            return new Promise<void>((resolve, reject) => {
              entry.demands.push({ keys: wanted, resolve, reject });
              settleDemands(entry);
            });
          },
          release: (keys) => {
            for (const tileKey of keys) {
              const count = (entry.held.get(tileKey) ?? 0) - 1;
              if (count > 0) entry.held.set(tileKey, count);
              else entry.held.delete(tileKey);
            }
          },
        };
        entry.unregister = editing.register(handle);
      }
    };

    /** Resolves the strokes' waits whose tiles are in as read; one that came back a stand-in (a failed read) fails. */
    const settleDemands = (entry: Placed): void => {
      const session = entry.session;
      if (!session || entry.demands.length === 0) return;
      for (const demand of [...entry.demands]) {
        const failed = demand.keys.find((tileKey) => session.world.tiles.has(tileKey) && !session.readable(tileKey));
        if (failed) {
          entry.demands.splice(entry.demands.indexOf(demand), 1);
          demand.reject(new Error(`terrain tile ${failed} could not be read`));
        } else if (demand.keys.every((tileKey) => session.world.tiles.has(tileKey))) {
          entry.demands.splice(entry.demands.indexOf(demand), 1);
          demand.resolve();
        }
      }
    };

    /** Takes the drawn terrain down, keeping the placement, its session and the strokes' waits (a rebuild for new layers). */
    const hide = (entry: Placed): void => {
      entry.unregister?.();
      entry.unregister = null;
      if (entry.view && terrainSurface(ctx.scene, entry.actor)?.tiles === entry.view.source) withdrawTerrainSurface(ctx.scene, entry.actor);
      entry.residency?.dispose();
      entry.roads?.dispose();
      entry.view?.dispose();
      entry.roads = null;
      entry.stream = null;
      entry.residency = null;
      entry.view = null;
    };

    const add = (actor: WorldActor, key: string, data: TerrainData): void => {
      const id = `${actor.id}/${key}`;
      const entry: Placed = {
        actor: actor.id, view: null, roads: null, stream: null, residency: null, sources: [], busy: null, settled: false, removed: false,
        key: data.data === null ? null : resourceKey.terrain(data.data),
        session: null, unregister: null, generation: 0, held: new Map(), demands: [],
        latest: actor, placedAt: [...actor.transform.p] as [number, number, number],
      };
      placed.set(id, entry);
      const guid = data.data;
      if (guid === null) return;
      entry.busy = ctx.resources.busy();
      ctx.resources.terrain(guid).then(
        async (terrain) => {
          if (entry.removed) return;
          const session = editSession(guid, terrain);
          const layers = await layersOf(terrain, session);
          if (!entry.removed) show(entry.latest, key, entry, terrain, guid, session, layers);
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
      for (const demand of entry.demands.splice(0)) demand.reject(new Error("the terrain left the world"));
      hide(entry);
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
      // An edit of the actor's other components (its Landscape foliage rules, plan 5c F6) or its name keeps
      // the drawn terrain and its stream; only a changed terrain component builds it again.
      actorsChanged(changes) {
        for (const { actor, previous } of changes) {
          if (JSON.stringify(terrainsOf(previous)) === JSON.stringify(terrainsOf(actor))) {
            // A moved editable terrain follows its actor until the editor moves its definition (then it is drawn again).
            for (const [key] of terrainsOf(actor)) {
              const entry = placed.get(`${actor.id}/${key}`);
              if (!entry) continue;
              entry.latest = actor;
              if (entry.session && entry.view) {
                const [x, y, z] = actor.transform.p;
                entry.view.mesh.position.set(x - entry.placedAt[0], y - entry.placedAt[1], z - entry.placedAt[2]);
                entry.roads?.setOffset(x - entry.placedAt[0], y - entry.placedAt[1], z - entry.placedAt[2]);
              }
            }
            continue;
          }
          for (const [key] of terrainsOf(previous)) remove(`${previous.id}/${key}`);
          for (const [key, component] of terrainsOf(actor)) add(actor, key, component as unknown as TerrainData);
        }
      },
      sync(frame) {
        if (!frame.camera) return;
        frame.camera.getWorldPosition(camera);
        frame.camera.updateMatrixWorld();
        let casters: ReturnType<typeof terrainShadowCasters> | null = null;
        const quality = ctx.quality();
        // The world's one surface input (render world, before this sync): the World Environment, its wind, rain and clock.
        const cover = ctx.surfaceWeather?.input ?? null;
        const landscape = ctx.world.services.get(TerrainEditingKey)?.settings;
        for (const entry of placed.values()) {
          const { view, stream } = entry;
          if (!view) continue;
          view.setSelfShadow(quality.terrainSelfShadow);
          view.setFarTiling(quality.terrainFarTiling);
          view.setSurfaceCover(cover);
          if (entry.session && landscape) {
            const layers = entry.session.world.def.layers;
            view.setEditorView(landscape.viewMode, Math.max(0, layers.findIndex((layer) => layer.id === landscape.activeLayerId)));
          }
          if (stream) {
            entry.sources = [{ position: [camera.x, camera.z] }];
            const regions = ctx.world.services.get(KeptRegionsKey)?.regions() ?? [];
            const def = stream.document.def, size = terrainTileWorldSize(def);
            const kept = regions.length ? def.tiles.filter((tile) => {
              const coord = parseTileKey(tile.key)!;
              const minX = def.origin[0] + coord.x * size, minZ = def.origin[2] + coord.z * size;
              return regions.some((area) => minX < area.maxX && minX + size > area.minX && minZ < area.maxZ && minZ + size > area.minZ);
            }).map((tile) => tile.key) : [];
            // The editor's: tiles edited this session and the ones a stroke holds never stream out.
            if (entry.session) kept.push(...entry.session.edited.keys(), ...entry.held.keys());
            entry.residency?.update(entry.sources, kept);
          }
          settleDemands(entry);
          casters ??= terrainShadowCasters(ctx.scene);
          view.update(frame.camera, casters);
          entry.roads?.sync(frame.camera);
          const stats = stream?.world.stats();
          const settled = (!stats || stats.queued + stats.inFlight === 0) && view.pendingUploads === 0;
          entry.settled = settled;
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
