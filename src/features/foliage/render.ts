// Foliage: render binding (plan 5c F1, step 6). A terrain actor's
// `forge.landscapeFoliage` rules grow around this world's camera as Forge's
// play-side ring did (engine/foliage/foliageRingHost.ts): cells of each rule,
// out to its type's cull distance × the quality's cull scale, thinning in
// bands, generated over the terrain's resident tiles and drawn GPU-driven, one
// batch per Foliage Type (render/foliage/foliageBatches.ts; the CPU twin on
// WebGL2). Nothing is saved: the same rules over the same terrain give the same
// instances on every machine. Editor and game grow alike.
//
// - The terrain is the terrain binding's (render/sync/terrainSurfaces.ts):
//   the ring waits until that actor's terrain is shown, and starts again when
//   it is shown anew (a reload after an edit).
// - Foliage Type assets are read as documents (`json:<guid>`; the editor
//   evicts the key when it saves one and reloads the actors that use it). A
//   rule without a type, or whose type fails to read, is left out with a
//   warning; a type without a model draws nothing.
// - Readiness: a placement holds the cache busy from its creation until its
//   types are loaded, its batches built, its terrain settled and no cell is
//   pending; the first fill builds every finished cell at once (Forge built
//   them behind the loading overlay), later frames a few per frame.
// - Painted foliage (F4, step 7): the level part's cells, from the world's
//   `LevelFoliageSourceKey` (the run time and the editor provide it), stream
//   around the camera (render/foliage/paintedFoliageView.ts) into the same
//   batches. The editor's revision bump streams them again.
// - Far billboards and tint come with PG3 (F3, user 2026-11-18).

import { Group, PerspectiveCamera, Vector3, type Camera } from "three/webgpu";
import { LevelSettingsKey, normalizeJsonAsset, parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import { foliageRuleParamsOf, foliageTypeParamsOf, type FoliageTypeAssetFields } from "../../engine/foliage/foliageAsset.ts";
import type { FoliageCellGenerator } from "../../engine/foliage/foliageCellGenerator.ts";
import { FoliageRing, type FoliageRingRule, type FoliageRingTerrain } from "../../engine/foliage/foliageRingHost.ts";
import { LevelFoliageSourceKey, type LevelFoliageSource } from "../../engine/foliage/levelFoliageSource.ts";
import { createFoliageBatches, type FoliageBatches, type FoliageTypeDraw } from "../../render/foliage/foliageBatches.ts";
import { PaintedFoliageView } from "../../render/foliage/paintedFoliageView.ts";
import { createFoliageCellGenerator } from "../../render/resources/foliageWorkerGenerator.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import { tagFoliage } from "../../render/sync/debugTags.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { terrainSurface } from "../../render/sync/terrainSurfaces.ts";
import { FoliageTypeAssetType, LandscapeFoliage, type FoliageTypeData, type LandscapeFoliageData } from "./schema.ts";

/** Ring cells built per frame once a placement is ready (Forge: one, with a worker). */
const CELLS_PER_FRAME = 2;

interface LoadedType {
  readonly draw: FoliageTypeDraw;
  readonly data: FoliageTypeData;
}

interface Placed {
  readonly actor: ActorId;
  readonly rules: LandscapeFoliageData["rules"];
  /** Types by GUID once read (null: failed or no model). */
  types: Map<string, LoadedType | null> | null;
  readonly keys: string[];
  ring: FoliageRing | null;
  /** The terrain surface version the ring grows on. */
  surfaceVersion: number;
  /** Until the first release: build every finished cell each frame. */
  filling: boolean;
  busy: (() => void) | null;
  removed: boolean;
}

interface Painted {
  readonly source: LevelFoliageSource;
  readonly revision: number | undefined;
  readonly view: PaintedFoliageView;
  readonly keys: string[];
  busy: (() => void) | null;
}

const fovOf = (camera: Camera): number => (camera as PerspectiveCamera).isPerspectiveCamera ? (camera as PerspectiveCamera).fov : 60;

export default defineRenderBinding({
  feature: "forge.foliage",
  create(ctx) {
    const placed = new Map<ActorId, Placed>();
    const group = new Group();
    group.name = "foliage";
    // GPU-driven meshes sit in template space: never frame a level by them.
    group.userData.framing = false;
    ctx.root.add(group);
    const cameraPosition = new Vector3();
    let batches: FoliageBatches | null = null;
    let lastQuality = "";
    let painted: Painted | null = null;
    // One worker per world: rings come and go (an edit restarts one), their terrains with them.
    let cellGenerator: FoliageCellGenerator | null = null;
    const generator = (): FoliageCellGenerator => (cellGenerator ??= createFoliageCellGenerator());
    tagFoliage(group, {
      ring() {
        let rings = 0, cells = 0, instances = 0, pending = 0;
        for (const entry of placed.values()) {
          if (!entry.ring) continue;
          const snapshot = entry.ring.snapshot();
          rings += 1; cells += snapshot.cells; instances += snapshot.instances; pending += snapshot.pending;
        }
        return { rings, cells, instances, pending };
      },
      batches: () => batches?.batches ?? [],
      painted: () => painted?.view.snapshot() ?? null,
    });

    const foliageOf = (actor: WorldActor): LandscapeFoliageData | null => {
      for (const component of Object.values(actor.components)) {
        if (parseComponentTypeTag(component.type)?.name === LandscapeFoliage.name) return component as unknown as LandscapeFoliageData;
      }
      return null;
    };

    const ensureBatches = (camera: Camera): FoliageBatches | null => {
      if (batches || !ctx.gpuDriven) return batches;
      batches = createFoliageBatches({
        gpuDriven: ctx.gpuDriven, resources: ctx.resources, parent: group,
        quality: { cullScale: ctx.quality().foliageCullDistanceScale, verticalFov: fovOf(camera) },
      });
      return batches;
    };

    /** Reads Foliage Types (their keys go to `keys`, released by the caller); null: not drawn. */
    const readTypes = async (guids: readonly string[], keys: string[]): Promise<Map<string, LoadedType | null>> => {
      const types = new Map<string, LoadedType | null>();
      await Promise.all([...new Set(guids)].map(async (guid) => {
        keys.push(resourceKey.json(guid));
        try {
          const result = normalizeJsonAsset(FoliageTypeAssetType, await ctx.resources.json(guid), { strict: false });
          if (!result.value) throw new Error(result.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ") || "unreadable");
          const data = result.value as unknown as FoliageTypeData;
          if (typeof data.mesh !== "string" || data.mesh.length === 0) { types.set(guid, null); return; }
          const lods = data.lods.flatMap((lod) => (typeof lod.mesh === "string" && lod.mesh.length > 0 ? [{ mesh: lod.mesh, screenSize: lod.screenSize }] : []));
          types.set(guid, { data, draw: { id: guid, mesh: data.mesh, lods, castShadow: data.castShadow, cullStart: data.cullStart, cullEnd: data.cullEnd } });
        } catch (error) {
          console.warn(`forge render: foliage type ${guid} not drawn: ${String(error)}`);
          types.set(guid, null);
        }
      }));
      return types;
    };

    const loadTypes = async (entry: Placed): Promise<void> => {
      const types = await readTypes(entry.rules.flatMap((rule) => (rule.foliageType ? [rule.foliageType as string] : [])), entry.keys);
      if (!entry.removed) entry.types = types;
    };

    const dropPainted = (): void => {
      if (!painted) return;
      painted.view.dispose();
      painted.busy?.();
      for (const key of painted.keys) ctx.resources.release(key);
      painted = null;
    };

    /** The level's painted foliage, (re)started when its source or revision changes. */
    const syncPainted = (target: FoliageBatches, center: readonly [number, number]): void => {
      const source = ctx.world.services.get(LevelFoliageSourceKey);
      if (painted && (painted.source !== source || painted.revision !== source?.revision)) dropPainted();
      if (!painted && source?.index && source.index.cells.length > 0) {
        const keys: string[] = [];
        painted = {
          source, revision: source.revision, keys, busy: ctx.resources.busy(),
          view: new PaintedFoliageView({
            source, batches: target,
            loadRange: ctx.world.services.get(LevelSettingsKey)?.current.loadRange ?? 384,
            loadTypes: async (guids) => new Map([...(await readTypes(guids, keys))].map(([guid, type]) => [guid, type?.draw ?? null])),
          }),
        };
      }
      if (!painted) return;
      painted.view.update(center);
      const busy = painted.view.busy();
      if (!busy && painted.busy) {
        const release = painted.busy;
        painted.busy = null;
        void target.ready().then(release);
      } else if (busy && !painted.busy) {
        painted.busy = ctx.resources.busy();
      }
    };

    const startRing = (entry: Placed, terrain: FoliageRingTerrain, types: Map<string, LoadedType | null>, target: FoliageBatches): FoliageRing => {
      const rules: FoliageRingRule[] = [];
      for (const rule of entry.rules) {
        const type = typeof rule.foliageType === "string" ? types.get(rule.foliageType) : undefined;
        if (!type) continue;
        rules.push({
          id: rule.id, typeId: type.draw.id, rule: foliageRuleParamsOf(rule), type: foliageTypeParamsOf(type.data as unknown as FoliageTypeAssetFields),
          cullStart: type.data.cullStart, cullEnd: type.data.cullEnd, terrain,
        });
      }
      const prefix = `${entry.actor}/`;
      return new FoliageRing({
        rules,
        generator: generator(),
        sink: {
          set(owner, typeId, matrices, count) {
            const type = types.get(typeId);
            if (!type) return 0;
            target.set(type.draw, prefix + owner, matrices.subarray(0, count * 16));
            return count;
          },
          remove(owner) {
            target.remove(prefix + owner);
          },
        },
        warn: (message) => console.warn(`forge render: foliage: ${message}`),
      });
    };

    const add = (actor: WorldActor): void => {
      const data = foliageOf(actor);
      if (!data || data.rules.length === 0) return;
      const entry: Placed = {
        actor: actor.id, rules: data.rules, types: null, keys: [], ring: null, surfaceVersion: 0, filling: true,
        busy: ctx.resources.busy(), removed: false,
      };
      placed.set(actor.id, entry);
      void loadTypes(entry);
    };

    const remove = (id: ActorId): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      entry.removed = true;
      entry.ring?.dispose();
      entry.ring = null;
      entry.busy?.();
      entry.busy = null;
      for (const key of entry.keys) ctx.resources.release(key);
    };

    return {
      actorsAdded(actors) {
        for (const actor of actors) add(actor);
      },
      actorsRemoved(actors) {
        for (const actor of actors) remove(actor.id);
      },
      sync(frame) {
        if (!frame.camera) return;
        if (placed.size === 0 && !painted && !ctx.world.services.get(LevelFoliageSourceKey)?.index) return;
        const target = ensureBatches(frame.camera);
        if (!target) return;
        const quality = ctx.quality();
        const fov = fovOf(frame.camera);
        const signature = `${quality.foliageCullDistanceScale}|${fov}`;
        if (signature !== lastQuality) {
          lastQuality = signature;
          target.setQuality({ cullScale: quality.foliageCullDistanceScale, verticalFov: fov });
        }
        frame.camera.getWorldPosition(cameraPosition);
        const center: [number, number] = [cameraPosition.x, cameraPosition.z];
        syncPainted(target, center);
        for (const entry of placed.values()) {
          const surface = terrainSurface(ctx.scene, entry.actor);
          if (!entry.types || !surface) continue;
          if (!entry.ring || entry.surfaceVersion !== surface.version) {
            entry.ring?.dispose();
            entry.ring = startRing(entry, { id: entry.actor, def: surface.def, tiles: surface.tiles, existingTiles: surface.existingTiles }, entry.types, target);
            entry.surfaceVersion = surface.version;
          }
          entry.ring.update(center, quality.foliageCullDistanceScale, quality.grassDensity, entry.filling ? Infinity : CELLS_PER_FRAME);
          const settled = surface.settled() && entry.ring.snapshot().pending === 0;
          if (settled && entry.busy) {
            // The batches' models: readiness waits for them too.
            const release = entry.busy;
            entry.busy = null;
            void target.ready().then(() => {
              release();
              entry.filling = false;
            });
          } else if (!settled && !entry.busy && !entry.filling) {
            entry.busy = ctx.resources.busy();
          }
        }
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
        dropPainted();
        batches?.dispose();
        cellGenerator?.dispose();
        cellGenerator = null;
        batches = null;
        group.removeFromParent();
      },
    };
  },
});
