// Foliage on the GPU-driven path (plan 5c R4 / step 5.4; decision 5: every
// foliage type draws GPU-driven, in the shadow cascades too).
//
// One GPU-driven batch per `forge.foliageType` in use: LOD 0 its model, LOD
// 1.. its `lods` models (each LOD the model's parts with its slot
// materials), the bounding sphere of LOD 0, Forge's foliage fade (distance
// from the camera to the instance origin, `cullStart` → `cullEnd` × the
// quality's `foliageCullDistanceScale`), LOD starts from the `screenSize`s
// at the template's own size, and its `castShadow`.
//
// Instances arrive by owner: a painted cell (step 7) or a procedural ring
// tile (step 6) sets the instances it contributes to a type and later
// replaces or removes them; the owner never sees handles. A type whose
// models are still loading keeps its owners' instances and adds them when
// its batch exists. Changing the quality only sets the batches' distances.
// The WebGL2 twin comes with the batch (`gpuDriven.ts`), nothing here.

import { Box3, Sphere, type Object3D } from "three/webgpu";
import { foliageFadeWindow, lodStartsOfScreenSizes, NO_CULL_DISTANCE } from "../../engine/world/instanceCulling.ts";
import type { GpuDrivenDrawing } from "../gpu/gpuDriven.ts";
import type { GpuBatchPart, GpuDrivenBatch } from "../gpu/gpuDrivenBatch.ts";
import { MATRIX_FLOATS } from "../gpu/gpuInstances.ts";
import { modelParts } from "../resources/modelParts.ts";
import { resourceKey } from "../resources/resourceCache.ts";
import type { WorldResources } from "../resources/worldResources.ts";

/** What drawing needs of one `forge.foliageType` (its asset fields). */
export interface FoliageTypeDraw {
  /** The type's GUID: one batch per type. */
  readonly id: string;
  /** `forge.model` GUID of LOD 0. */
  readonly mesh: string;
  readonly lods: readonly { readonly mesh: string; readonly screenSize: number }[];
  readonly castShadow: boolean;
  readonly cullStart: number;
  readonly cullEnd: number;
}

export interface FoliageQuality {
  /** `QualitySettings.foliageCullDistanceScale`. */
  readonly cullScale: number;
  /** The camera's vertical field of view, degrees (LOD starts from screen sizes). */
  readonly verticalFov: number;
}

export interface FoliageBatches {
  /** Replaces the instances `owner` contributes to `type` (16 column-major floats each); an empty list removes them. */
  set(type: FoliageTypeDraw, owner: string, matrices: ArrayLike<number>, seeds?: ArrayLike<number>): void;
  /** Removes everything `owner` contributes, every type. */
  remove(owner: string): void;
  setQuality(quality: FoliageQuality): void;
  /** The batches of the types whose models loaded. */
  readonly batches: readonly GpuDrivenBatch[];
  /** Settles when every type asked for so far has its batch (or failed to load). */
  ready(): Promise<void>;
  dispose(): void;
}

export interface FoliageBatchesOptions {
  readonly gpuDriven: Pick<GpuDrivenDrawing, "createBatch" | "removeBatch">;
  readonly resources: WorldResources;
  readonly parent: Object3D;
  readonly quality: FoliageQuality;
  /** Render bundles for the batches (5.3; off by default, see gpuDrivenBatch.ts). */
  readonly bundle?: boolean;
  /** The `?debug` scene-cost bucket. */
  readonly source?: string;
}

interface Owned {
  readonly matrices: Float32Array;
  readonly seeds: Uint32Array | null;
  /** Its handles in the batch; null while the batch loads. */
  handles: number[] | null;
}

interface TypeEntry {
  readonly type: FoliageTypeDraw;
  readonly keys: string[];
  batch: GpuDrivenBatch | null;
  radius: number;
  disposed: boolean;
  readonly owners: Map<string, Owned>;
  loading: Promise<void>;
}

const sameType = (a: FoliageTypeDraw, b: FoliageTypeDraw): boolean =>
  a.mesh === b.mesh && a.castShadow === b.castShadow && a.cullStart === b.cullStart && a.cullEnd === b.cullEnd
  && a.lods.length === b.lods.length && a.lods.every((lod, index) => lod.mesh === b.lods[index]!.mesh && lod.screenSize === b.lods[index]!.screenSize);

export function createFoliageBatches(options: FoliageBatchesOptions): FoliageBatches {
  const types = new Map<string, TypeEntry>();
  let quality = options.quality;

  const applyDistances = (entry: TypeEntry): void => {
    if (!entry.batch) return;
    const window = foliageFadeWindow(entry.type.cullStart, entry.type.cullEnd, quality.cullScale);
    const lodStarts = lodStartsOfScreenSizes(entry.radius, entry.type.lods.map((lod) => lod.screenSize), quality.verticalFov)
      // Ascending, as the batch requires.
      .map((start, index, all) => Math.max(start, index > 0 ? all[index - 1]! : 0));
    entry.batch.setDistances({ fadeStart: window?.[0] ?? NO_CULL_DISTANCE, cullEnd: window?.[1] ?? NO_CULL_DISTANCE, lodStarts });
  };

  const addTo = (batch: GpuDrivenBatch, owned: Owned): void => {
    owned.handles = batch.instances.addMany(owned.matrices, owned.matrices.length / MATRIX_FLOATS, owned.seeds ?? undefined);
  };

  const load = async (entry: TypeEntry): Promise<void> => {
    const world = options.resources;
    const lodParts = async (guid: string): Promise<{ parts: GpuBatchPart[]; sphere: Sphere }> => {
      entry.keys.push(resourceKey.model(guid));
      const template = await world.model(guid);
      const materials = await Promise.all(template.slots.map(async (own, slot) => {
        const material = template.slotMaterials[slot] ?? null;
        if (material === null) return own;
        entry.keys.push(world.materialKey(material));
        return world.material(material).catch(() => own);
      }));
      return { parts: modelParts(template, materials), sphere: new Box3().setFromObject(template.scene).getBoundingSphere(new Sphere()) };
    };
    try {
      const lods = await Promise.all([entry.type.mesh, ...entry.type.lods.map((lod) => lod.mesh)].map(lodParts));
      if (entry.disposed) return;
      const sphere = lods[0]!.sphere;
      entry.radius = sphere.radius;
      const capacity = [...entry.owners.values()].reduce((sum, owned) => sum + owned.matrices.length / MATRIX_FLOATS, 0);
      entry.batch = options.gpuDriven.createBatch({
        name: `foliage/${entry.type.id}`, parent: options.parent, lods: lods.map((lod) => lod.parts),
        bounds: { center: [sphere.center.x, sphere.center.y, sphere.center.z], radius: sphere.radius },
        distanceMode: "origin", castShadow: entry.type.castShadow, source: options.source ?? "foliage",
        ...(options.bundle !== undefined ? { bundle: options.bundle } : {}),
        ...(capacity > 0 ? { capacity } : {}),
      });
      applyDistances(entry);
      for (const owned of entry.owners.values()) addTo(entry.batch, owned);
    } catch (error) {
      console.warn(`foliage type ${entry.type.id}: ${String(error)}; not drawn`);
    }
  };

  const disposeEntry = (entry: TypeEntry): void => {
    entry.disposed = true;
    if (entry.batch) options.gpuDriven.removeBatch(entry.batch);
    entry.batch = null;
    for (const key of entry.keys) options.resources.release(key);
    types.delete(entry.type.id);
  };

  const entryFor = (type: FoliageTypeDraw): TypeEntry => {
    const existing = types.get(type.id);
    if (existing && sameType(existing.type, type)) return existing;
    // A changed type (another model, LODs, shadow or band) is a new batch; its owners move along.
    const owners = new Map<string, Owned>();
    if (existing) {
      for (const [owner, owned] of existing.owners) owners.set(owner, { matrices: owned.matrices, seeds: owned.seeds, handles: null });
      disposeEntry(existing);
    }
    const entry: TypeEntry = { type, keys: [], batch: null, radius: 0, disposed: false, owners, loading: Promise.resolve() };
    entry.loading = load(entry);
    types.set(type.id, entry);
    return entry;
  };

  const drop = (entry: TypeEntry, owner: string): void => {
    const owned = entry.owners.get(owner);
    if (owned === undefined) return;
    entry.owners.delete(owner);
    if (owned.handles && entry.batch) for (const handle of owned.handles) entry.batch.instances.remove(handle);
  };

  return {
    set(type, owner, matrices, seeds) {
      const entry = entryFor(type);
      drop(entry, owner);
      if (matrices.length < MATRIX_FLOATS) return;
      const owned: Owned = { matrices: Float32Array.from(matrices), seeds: seeds ? Uint32Array.from(seeds) : null, handles: null };
      entry.owners.set(owner, owned);
      if (entry.batch) addTo(entry.batch, owned);
    },
    remove(owner) {
      for (const entry of types.values()) drop(entry, owner);
    },
    setQuality(next) {
      quality = next;
      for (const entry of types.values()) applyDistances(entry);
    },
    get batches() {
      return [...types.values()].flatMap((entry) => (entry.batch ? [entry.batch] : []));
    },
    async ready() {
      await Promise.all([...types.values()].map((entry) => entry.loading));
    },
    dispose() {
      for (const entry of [...types.values()]) disposeEntry(entry);
    },
  };
}
