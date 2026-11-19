// Static Mesh: render binding. Each `forge.staticMesh` component shows its
// model asset through the host's resource cache, keyed by the model's GUID.
//
// Instancing (plan phase 3 step 8, spike mode (b); Forge WebGL's
// createInstancedModelGroup): placements that share a model, slot overrides
// and shadow switch are one batch (render/sync/instanceBatches.ts), one
// `InstancedMesh` per renderable part of the model. The batch holds the cache
// uses of the model and its materials; it goes with its last placement.
//
// Materials (plan phase 3 step 4; Forge WebGL's applyMaterialSlotOverrides /
// resolveMeshMaterialSlots): slot i of the model (its i-th unique GLB
// material) draws with the placement's `materials[i]`, else the model's
// default for that slot (`forge.model` `materials`), else the GLB's own
// material. `forge.material` assets come from the cache
// (`material:<guid>:<signature>`), shared by every batch. A placement colour
// is its instance colour over the material's (Forge's applyInstanceColors):
// the drawn base colour is the placement's, textures stay. `castShadow` is
// the component's; every mesh receives shadows.
//
// A component without a model, or whose model fails to load, draws nothing; a
// material that fails leaves its slot on the GLB's own material. Failures are
// counted by the cache and reported by the host.
//
// Path (plan 5c R9.4): with the host's automatic LOD drawing, a batch's
// eligible parts may draw GPU-driven with LODs (`render/triangles/staticPath.ts`
// decides per batch); picking keeps the instanced source.
//
// Cells (plan 5c R9a): with `staticCellSize` above 0 a batch holds the
// placements of one world cell only (`render/sync/batchCells.ts`); a move into
// another cell changes batch.
//
// Zones (plan 5c R9b): a light model's batch holds one zone's placements and
// draws by its zone's mode; a model that takes the GPU path (known once it
// loads) is not split: its instances carry their zone and the GPU cull reads
// the zone masks (user decision 2026-11-18). Its placements then move to the
// zoneless batch.
//
// Edits (plan phase 4 decision 3): a transform-only change moves the actor's
// placements in their batches (`changeInstances`); any other is removed and
// added again.

import { Box3, Matrix4, Sphere, Vector3, type Material } from "three/webgpu";
import { parseComponentTypeTag, type WorldActor } from "../../core/index.ts";
import { modelParts } from "../../render/resources/modelParts.ts";
import { assignSlotMaterials, slotMaterialIds } from "../../render/resources/modelSlots.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import type { ModelTemplate } from "../../render/resources/worldResources.ts";
import { cellSuffix, placementParts, placementZone, zoneSuffix } from "../../render/sync/batchCells.ts";
import { lodParts } from "../../render/triangles/staticPath.ts";
import { changeInstances, createInstanceBatch, type InstanceBatch } from "../../render/sync/instanceBatches.ts";
import { defineRenderBinding, type RenderBindingContext } from "../../render/sync/renderBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { createStreamedPlacements } from "../../render/sync/streamedPlacements.ts";
import { StaticMesh, type StaticMeshData } from "./schema.ts";

interface Batch {
  readonly instances: InstanceBatch;
  /** Cache keys this batch holds a use of. */
  readonly keys: string[];
  disposed: boolean;
  /** Its zone's registration (R9b); null in no zone. */
  untrack: (() => void) | null;
}

// The slot rules live in render/resources/modelSlots.ts (the editor's thumbnails use them too), the
// template's parts in render/resources/modelParts.ts (the GPU-driven batches use them too).
export { assignSlotMaterials, modelParts, slotMaterialIds };


async function materialsFor(ctx: RenderBindingContext, batch: Batch, model: ModelTemplate, overrides: readonly (string | null)[]): Promise<Material[]> {
  const ids = slotMaterialIds(model, overrides);
  const loaded = await Promise.all(
    ids.map((guid) => {
      if (guid === null) return Promise.resolve(null);
      batch.keys.push(ctx.resources.materialKey(guid));
      return ctx.resources.material(guid).then(
        (material) => material,
        () => null, // counted by the cache; the slot keeps the GLB's material
      );
    }),
  );
  return model.slots.map((own, index) => loaded[index] ?? own);
}

/** Placements that draw alike: the model, the placement's slot overrides and its shadow switch. */
export const staticMeshBatchKey = (data: StaticMeshData): string =>
  `${data.mesh}|${data.materials.map((id) => id ?? "").join(",")}|${data.castShadow ? "cast" : "none"}`;

export default defineRenderBinding({
  feature: "forge.staticMesh",
  create(ctx) {
    const batches = new Map<string, Batch>();
    /** Placement id -> its batch key. */
    const placed = new Map<string, string>();
    const placementsByModel = new Map<string, Set<string>>();
    const placementModels = new Map<string, string>();
    const modelBounds = new Map<string, Box3>();
    // Dev only: once a resident source batch qualifies, keep its cell layout for the pose.
    const s12Sizes = new Map<string, number>();
    const measureCells = ctx.staticPath?.() === "s12-cells";
    const matrix = new Matrix4();
    const meshesOf = (actor: WorldActor) =>
      Object.entries(actor.components).filter(([, component]) => parseComponentTypeTag(component.type)?.name === StaticMesh.name);

    const batchFor = (key: string, model: string, data: StaticMeshData, zone: string | null): Batch => {
      const existing = batches.get(key);
      if (existing) return existing;
      const batch: Batch = {
        instances: createInstanceBatch({
          name: `${key.includes("|s12") ? "s12-cell/" : ""}staticMesh/${model}`, source: "staticMesh", parent: ctx.root, castShadow: data.castShadow,
          ...(ctx.prepare ? { prepare: ctx.prepare } : {}),
          ...(ctx.gpuDriven?.instancedCasters ? { shadowCasters: ctx.gpuDriven.instancedCasters } : {}),
          ...(ctx.triangles ? { triangles: ctx.triangles, ...(ctx.staticPath ? { staticPath: ctx.staticPath } : {}) } : {}),
        }),
        keys: [resourceKey.model(model)],
        disposed: false,
        untrack: null,
      };
      batches.set(key, batch);
      if (zone !== null && ctx.zones) batch.untrack = ctx.zones.track(zone, batch.instances);
      ctx.resources.model(model).then(
        async (template) => {
          if (batch.disposed) return;
          const materials = await materialsFor(ctx, batch, template, data.materials);
          if (batch.disposed) return;
          const bounds = new Box3().setFromObject(template.scene);
          const radius = bounds.getBoundingSphere(new Sphere()).radius;
          const parts = modelParts(template, materials);
          batch.instances.setParts(parts, radius, undefined, bounds);
          if (!ctx.zones) return;
          const boundsChanged = !modelBounds.get(model)?.equals(bounds);
          modelBounds.set(model, bounds);
          // R9b: a model on the GPU path leaves the zone split (its zone batches merge into one).
          const usingGpu = ctx.triangles && !unsplit.has(model) && lodParts(ctx.staticPath?.() ?? "gpu", parts).some(Boolean);
          if (usingGpu) unsplit.add(model);
          if (boundsChanged || usingGpu) rekey(model);
        },
        () => {
          // Counted by the cache and reported by the host; the batch stays empty.
        },
      );
      return batch;
    };

    const disposeBatch = (key: string, batch: Batch): void => {
      batches.delete(key);
      batch.disposed = true;
      batch.untrack?.();
      batch.instances.dispose();
      // Every use is taken synchronously when asked (the model at once, the materials when the model arrives).
      for (const resource of batch.keys) ctx.resources.release(resource);
      batch.keys.length = 0;
    };

    const cellSize = (): number => ctx.staticCellSize?.() ?? 0;
    /** Models whose batches draw GPU-driven: not split by zone (the instances carry their zone). */
    const unsplit = new Set<string>();
    const placementKey = (data: StaticMeshData, at: Matrix4) => {
      let bounds = data.mesh === null ? undefined : modelBounds.get(data.mesh);
      if (bounds === undefined && data.mesh !== null && ctx.zones?.residency) {
        const indexed = ctx.modelBounds?.(data.mesh);
        if (indexed) {
          bounds = new Box3(new Vector3(...indexed.min), new Vector3(...indexed.max));
          modelBounds.set(data.mesh, bounds);
        }
      }
      const zone = placementZone(ctx.zones, at, bounds);
      const batchZone = data.mesh !== null && unsplit.has(data.mesh) ? null : zone;
      const base = staticMeshBatchKey(data) + cellSuffix(at, cellSize()) + zoneSuffix(batchZone);
      const size = s12Sizes.get(base);
      return { key: size === undefined ? base : `${base}|s12${cellSuffix(at, size)}`, zone, batchZone };
    };
    const rekey = (model?: string): void => {
      const ids = model === undefined ? [...placements.ids()] : [...(placementsByModel.get(model) ?? [])];
      for (const id of ids) {
        const [actorId, key] = placementParts(id);
        const actor = ctx.world.actor(actorId);
        const component = actor?.components[key];
        if (!actor || !component) continue;
        const data = component as unknown as StaticMeshData;
        componentWorldMatrix(ctx.world, actor, key, matrix);
        if (!placements.matches(id, placementKey(data, matrix))) add(actor, key, data);
      }
    };
    const add = (actor: WorldActor, key: string, data: StaticMeshData): void => {
      if (data.mesh === null) return;
      const id = `${actor.id}/${key}`;
      componentWorldMatrix(ctx.world, actor, key, matrix);
      const assignment = placementKey(data, matrix);
      const model = data.mesh;
      let ids = placementsByModel.get(data.mesh);
      if (!ids) { ids = new Set(); placementsByModel.set(data.mesh, ids); }
      ids.add(id);
      placementModels.set(id, model);
      placements.set(id, actor.id, assignment, () => {
        const current = ctx.world.actor(actor.id) ?? actor;
        componentWorldMatrix(ctx.world, current, key, matrix);
        placed.set(id, assignment.key);
        batchFor(assignment.key, model, data, assignment.batchZone).instances.set(id, matrix, data.color, actor.id);
      }, () => batches.get(placed.get(id) ?? "")?.instances.ready === true);
    };

    const detach = (id: string): void => {
      const batchKey = placed.get(id);
      if (batchKey === undefined) return;
      placed.delete(id);
      const batch = batches.get(batchKey);
      if (!batch) return;
      batch.instances.delete(id);
      if (batch.instances.size === 0) disposeBatch(batchKey, batch);
    };
    const placements = createStreamedPlacements(ctx.zones, detach);
    const remove = (id: string): void => {
      placements.remove(id);
      const model = placementModels.get(id);
      if (model === undefined) return;
      placementModels.delete(id);
      const ids = placementsByModel.get(model);
      ids?.delete(id);
      if (ids?.size === 0) placementsByModel.delete(model);
    };

    const added = (actors: readonly WorldActor[]): void => {
      for (const actor of actors) {
        for (const [key, component] of meshesOf(actor)) add(actor, key, component as unknown as StaticMeshData);
      }
    };
    const removed = (actors: readonly WorldActor[]): void => {
      for (const actor of actors) for (const [key] of meshesOf(actor)) remove(`${actor.id}/${key}`);
    };
    const move = (actor: WorldActor): void => {
      for (const [key, component] of meshesOf(actor)) {
        const id = `${actor.id}/${key}`;
        const data = component as unknown as StaticMeshData;
        componentWorldMatrix(ctx.world, actor, key, matrix);
        // Into another cell or zone: another batch (R9a cells, R9b zones); within one, in place.
        if (!placements.matches(id, placementKey(data, matrix))) { add(actor, key, data); continue; }
        batches.get(placed.get(id) ?? "")?.instances.move(id, matrix);
      }
    };

    // The zone set changed (a zone or portal edited): placements whose zone changed move batch.
    const unsubscribe = ctx.zones?.onChange(rekey);

    return {
      isActorReady: placements.isActorReady,
      actorsAdded: added,
      actorsRemoved: removed,
      actorsChanged(changes) {
        changeInstances(changes, { move, removed, added });
      },
      sync(frame) {
        if (measureCells) {
          let changed = false;
          for (const [key, batch] of batches) {
            if (s12Sizes.has(key) || key.includes("|s12")) continue;
            const size = batch.instances.s12CellSize();
            if (size > 0) { s12Sizes.set(key, size); changed = true; }
          }
          if (changed) rekey();
        }
        for (const batch of batches.values()) {
          batch.instances.flush();
          batch.instances.updateCulling(frame.camera, ctx.quality().foliageCullDistanceScale);
        }
      },
      dispose() {
        unsubscribe?.();
        placements.dispose();
        for (const [key, batch] of [...batches]) disposeBatch(key, batch);
        placed.clear();
        placementModels.clear();
        placementsByModel.clear();
        modelBounds.clear();
      },
    };
  },
});
