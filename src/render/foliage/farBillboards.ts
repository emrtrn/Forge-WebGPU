// Far foliage billboards (plan 5c F3, decision 6 as updated 2026-11-19): past a type's cull distance its
// Landscape rule plants are drawn as impostors out to the type's far distance, in the blocks
// engine/foliage/foliageFarHost.ts plans. One GPU-driven batch per type whose single LOD is the PG3 impostor
// (render/plant/impostorMaterial.ts): a generated plant's baked atlas (its `impostor` slot, with the family's
// appearance: season, snow, wetness), or an imported model's, baked once per model at run time
// (render/plant/modelImpostor.ts). The WebGL2 twin comes with the batch.
//
// Hand-off (Forge's foliageImpostor.ts): the models dissolve per pixel with 5b's screen-door dither over
// the type's fade window (gpuDrivenBatch.ts `maskWithFade`); a billboard keeps exactly the pixels the
// models drop, from the same threshold and the same distance (camera to instance origin), so one of the two
// covers a pixel. Nearer than the window the quad collapses (no fragments). The billboards dissolve the same
// way over the last 15% of the far distance (the batch's own fade). They cast no shadow, as in Forge.

import { Vector2, type Node, type Object3D } from "three/webgpu";
import { cameraPosition, distance, float, select, smoothstep, uniform } from "three/tsl";
import type { FoliageFarLook } from "../../engine/foliage/foliageFarHost.ts";
import { foliageFadeWindow, NO_CULL_DISTANCE } from "../../engine/world/instanceCulling.ts";
import type { GpuDrivenDrawing } from "../gpu/gpuDriven.ts";
import type { GpuBatchPart, GpuDrivenBatch } from "../gpu/gpuDrivenBatch.ts";
import { MATRIX_FLOATS } from "../gpu/gpuInstances.ts";
import type { InstanceShading } from "../gpu/instanceShading.ts";
import { detailFadeDither } from "../materials/detailFade.ts";
import { resourceKey } from "../resources/resourceCache.ts";
import type { WorldResources } from "../resources/worldResources.ts";
import { applyImpostor, impostorPart, isImpostor, type ImpostorAtlasDraw } from "../plant/impostorMaterial.ts";
import { bakeModelImpostor, textureMeanColor, type ModelImpostor } from "../plant/modelImpostor.ts";
import type { PlantFamilyDraw, PlantWorld } from "../plant/plantDrawing.ts";
import type { ImpostorRef } from "../plant/plantFamilies.ts";
import { loadModelParts } from "./foliageBatches.ts";

/** Share of the far distance over which billboards dissolve out (Forge `IMPOSTOR_FAR_FADE`). */
export const IMPOSTOR_FAR_FADE = 0.15;
/** A generated plant's crown radius for the tint, as a share of its bounding sphere (no vertex data at run time). */
const CROWN_OF_SPHERE = 0.6;

/** What drawing a type's far billboards needs. */
export interface FarBillboardType {
  /** The `forge.foliageType` GUID: one batch per type. */
  readonly id: string;
  /** LOD 0's `forge.model` GUID: the bake source without an impostor, the sphere with one. */
  readonly mesh: string;
  readonly impostor: ImpostorRef | null;
  readonly plant: PlantFamilyDraw | null;
  readonly cullStart: number;
  readonly cullEnd: number;
  readonly farDistance: number;
}

export interface FarBillboards {
  /** Replaces the billboards `owner` contributes to `type` (16 column-major floats each); empty removes them. */
  set(type: FarBillboardType, owner: string, matrices: ArrayLike<number>): void;
  remove(owner: string): void;
  /** `QualitySettings.foliageCullDistanceScale`. */
  setQuality(cullScale: number): void;
  /** A type's look for the far tint once its atlas is in; null before (or without one). */
  look(typeId: string): FoliageFarLook | null;
  /** Called when a type's look becomes known. */
  onLook(listener: () => void): () => void;
  readonly batches: readonly GpuDrivenBatch[];
  /** Settles when every type asked for so far has its batch (or failed). */
  ready(): Promise<void>;
  dispose(): void;
}

export interface FarBillboardsOptions {
  readonly gpuDriven: Pick<GpuDrivenDrawing, "createBatch" | "removeBatch">;
  readonly resources: WorldResources;
  readonly parent: Object3D;
  readonly cullScale: number;
  /** The world's plant drawing (a family's appearance); without it a family type draws the summer look. */
  readonly plants?: PlantWorld;
}

interface TypeEntry {
  readonly type: FarBillboardType;
  readonly keys: string[];
  batch: GpuDrivenBatch | null;
  part: GpuBatchPart | null;
  baked: ModelImpostor | null;
  look: FoliageFarLook | null;
  /** The model fade window the billboards complement: (start, end) in metres. */
  readonly near: { value: Vector2 };
  disposed: boolean;
  readonly owners: Map<string, { readonly matrices: Float32Array; handles: number[] | null }>;
  loading: Promise<void>;
}

const sameType = (a: FarBillboardType, b: FarBillboardType): boolean =>
  a.mesh === b.mesh && a.cullStart === b.cullStart && a.cullEnd === b.cullEnd && a.farDistance === b.farDistance
  && JSON.stringify(a.impostor) === JSON.stringify(b.impostor) && JSON.stringify(a.plant) === JSON.stringify(b.plant);

export function createFarBillboards(options: FarBillboardsOptions): FarBillboards {
  const types = new Map<string, TypeEntry>();
  const listeners = new Set<() => void>();
  let cullScale = options.cullScale;

  const applyDistances = (entry: TypeEntry): void => {
    const window = foliageFadeWindow(entry.type.cullStart, entry.type.cullEnd, cullScale);
    const farEnd = entry.type.farDistance * (cullScale > 0 ? cullScale : 1);
    // The near batch's fade uniform (gpuDrivenBatch.ts setDistances) keeps start below end.
    entry.near.value.set(window ? Math.min(window[0], window[1] * 0.999999) : NO_CULL_DISTANCE, window ? window[1] : NO_CULL_DISTANCE);
    entry.batch?.setDistances({ fadeStart: farEnd * (1 - IMPOSTOR_FAR_FADE), cullEnd: farEnd, lodStarts: [] });
  };

  const shadingOf = (entry: TypeEntry): InstanceShading => {
    const farEnd = entry.type.farDistance * (cullScale > 0 ? cullScale : 1);
    const family = entry.type.plant && options.plants ? options.plants.shading(entry.type.plant, null, farEnd) : null;
    const near = uniform(entry.near.value);
    return (material, instance, role) => {
      if (!isImpostor(material)) return;
      const result = family ? family(material, instance, role) : applyImpostor(material, instance, role, null);
      // The models keep a pixel while the dither is below their fade (maskWithFade): the billboard the rest.
      const away = distance(cameraPosition, instance.origin);
      const modelsShow = float(1).sub(smoothstep(near.x, near.y, away));
      const mine = detailFadeDither.lessThan(modelsShow).not();
      material.maskNode = material.maskNode ? (material.maskNode as Node<"bool">).and(mine) : mine;
      const offset = result && "worldOffset" in result ? result.worldOffset : undefined;
      if (!offset) return result;
      return { worldOffset: offset.mul(select(away.lessThan(near.x), float(0), float(1))) };
    };
  };

  const notify = (): void => { for (const listener of listeners) listener(); };

  const load = async (entry: TypeEntry): Promise<void> => {
    const world = options.resources;
    try {
      const { parts, sphere } = await loadModelParts(world, entry.type.mesh, entry.keys);
      if (entry.disposed) return;
      let draw: ImpostorAtlasDraw | null = null;
      const ref = entry.type.impostor;
      if (ref) {
        entry.keys.push(resourceKey.texture(ref.albedo, "srgb"), resourceKey.texture(ref.normal, "linear"));
        const [albedo, normal] = await Promise.all([world.texture(ref.albedo, "srgb"), world.texture(ref.normal, "linear")]);
        if (entry.disposed) return;
        draw = { albedo, normal, views: ref.views, center: sphere.center.clone(), radius: sphere.radius };
        // The bake's colour; reading the atlas back works only for an uncompressed one.
        const color = ref.color ?? textureMeanColor(albedo, "right");
        entry.look = color ? { color, radius: sphere.radius * CROWN_OF_SPHERE } : null;
      } else {
        const baked = await bakeModelImpostor(parts);
        if (entry.disposed) { baked?.dispose(); return; }
        if (!baked) { console.warn(`foliage type ${entry.type.id}: model ${entry.type.mesh} has nothing to bake; no far billboards`); return; }
        entry.baked = baked;
        draw = baked.draw;
        entry.look = { color: baked.color, radius: baked.radius };
      }
      entry.part = impostorPart(draw, `foliage-far/${entry.type.id}`);
      const capacity = [...entry.owners.values()].reduce((sum, owned) => sum + owned.matrices.length / MATRIX_FLOATS, 0);
      entry.batch = options.gpuDriven.createBatch({
        name: `foliage-far/${entry.type.id}`, parent: options.parent, lods: [[entry.part]],
        bounds: { center: [draw.center.x, draw.center.y, draw.center.z], radius: draw.radius },
        distanceMode: "origin", castShadow: false, source: "foliage",
        ...(capacity > 0 ? { capacity } : {}),
        instanceShading: shadingOf(entry),
      });
      applyDistances(entry);
      for (const owned of entry.owners.values()) owned.handles = entry.batch.instances.addMany(owned.matrices, owned.matrices.length / MATRIX_FLOATS);
      if (entry.look) notify();
    } catch (error) {
      console.warn(`foliage type ${entry.type.id}: far billboards not drawn: ${String(error)}`);
    }
  };

  const disposeEntry = (entry: TypeEntry): void => {
    entry.disposed = true;
    if (entry.batch) options.gpuDriven.removeBatch(entry.batch);
    entry.batch = null;
    if (entry.part) {
      entry.part.geometry.dispose();
      for (const material of [entry.part.material].flat()) material.dispose();
      entry.part = null;
    }
    entry.baked?.dispose();
    entry.baked = null;
    for (const key of entry.keys) options.resources.release(key);
    types.delete(entry.type.id);
  };

  const entryFor = (type: FarBillboardType): TypeEntry => {
    const existing = types.get(type.id);
    if (existing && sameType(existing.type, type)) return existing;
    const owners = new Map<string, { matrices: Float32Array; handles: number[] | null }>();
    if (existing) {
      for (const [owner, owned] of existing.owners) owners.set(owner, { matrices: owned.matrices, handles: null });
      disposeEntry(existing);
    }
    const entry: TypeEntry = {
      type, keys: [], batch: null, part: null, baked: null, look: null, near: { value: new Vector2(NO_CULL_DISTANCE, NO_CULL_DISTANCE) },
      disposed: false, owners, loading: Promise.resolve(),
    };
    applyDistances(entry);
    entry.loading = load(entry);
    types.set(type.id, entry);
    return entry;
  };

  const drop = (entry: TypeEntry, owner: string): void => {
    const owned = entry.owners.get(owner);
    if (!owned) return;
    entry.owners.delete(owner);
    if (owned.handles && entry.batch) for (const handle of owned.handles) entry.batch.instances.remove(handle);
  };

  return {
    set(type, owner, matrices) {
      const entry = entryFor(type);
      drop(entry, owner);
      if (matrices.length < MATRIX_FLOATS) return;
      const owned = { matrices: Float32Array.from(matrices), handles: null as number[] | null };
      entry.owners.set(owner, owned);
      if (entry.batch) owned.handles = entry.batch.instances.addMany(owned.matrices, owned.matrices.length / MATRIX_FLOATS);
    },
    remove(owner) {
      for (const entry of types.values()) drop(entry, owner);
    },
    setQuality(next) {
      cullScale = next;
      for (const entry of types.values()) applyDistances(entry);
    },
    look: (typeId) => types.get(typeId)?.look ?? null,
    onLook(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get batches() {
      return [...types.values()].flatMap((entry) => (entry.batch ? [entry.batch] : []));
    },
    async ready() {
      await Promise.all([...types.values()].map((entry) => entry.loading));
    },
    dispose() {
      listeners.clear();
      for (const entry of [...types.values()]) disposeEntry(entry);
    },
  };
}

