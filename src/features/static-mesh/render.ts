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
// Edits (plan phase 4 decision 3): a transform-only change moves the actor's
// placements in their batches (`changeInstances`); any other is removed and
// added again.

import { Matrix4, Mesh, type Material, type Object3D } from "three/webgpu";
import { parseComponentTypeTag, type WorldActor } from "../../core/index.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import type { ModelTemplate } from "../../render/resources/worldResources.ts";
import { changeInstances, createInstanceBatch, type InstanceBatch, type InstancePart } from "../../render/sync/instanceBatches.ts";
import { defineRenderBinding, type RenderBindingContext } from "../../render/sync/renderBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { StaticMesh, type StaticMeshData } from "./schema.ts";

interface Batch {
  readonly instances: InstanceBatch;
  /** Cache keys this batch holds a use of. */
  readonly keys: string[];
  disposed: boolean;
}

/** The material GUID each model slot draws with: the placement's override, else the model's default, else null (the GLB's). */
export function slotMaterialIds(model: Pick<ModelTemplate, "slots" | "slotMaterials">, overrides: readonly (string | null)[]): (string | null)[] {
  return model.slots.map((_, index) => overrides[index] ?? model.slotMaterials[index] ?? null);
}

/** The material a mesh's material takes: its slot's chosen one (`chosen[i]` for template slot i). */
function slotResolver(slots: readonly Material[], chosen: readonly Material[]): (material: Material, local: number) => Material {
  const slotOf = new Map<Material, number>();
  slots.forEach((material, index) => slotOf.set(material, index));
  return (material, local) => chosen[slotOf.get(material) ?? local] ?? material;
}

/** Puts each mesh's slot materials on the clone; `chosen[i]` replaces the template's slot i material. */
export function assignSlotMaterials(object: Object3D, slots: readonly Material[], chosen: readonly Material[]): void {
  const resolve = slotResolver(slots, chosen);
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const mesh = child as Mesh;
    mesh.material = Array.isArray(mesh.material)
      ? (mesh.material as Material[]).map((material, local) => resolve(material, local))
      : resolve(mesh.material as Material, 0);
  });
}

/** The template's renderable parts with their slot materials and their matrices under the template root. */
export function modelParts(model: ModelTemplate, chosen: readonly Material[]): InstancePart[] {
  const resolve = slotResolver(model.slots, chosen);
  model.scene.updateMatrixWorld(true);
  const parts: InstancePart[] = [];
  model.scene.traverse((child) => {
    if (!(child instanceof Mesh) || (child as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh === true) return;
    const mesh = child as Mesh;
    const material = Array.isArray(mesh.material)
      ? (mesh.material as Material[]).map((own, local) => resolve(own, local))
      : resolve(mesh.material as Material, 0);
    parts.push({ geometry: mesh.geometry, material, local: mesh.matrixWorld.clone(), name: mesh.name || "mesh" });
  });
  return parts;
}

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
    const matrix = new Matrix4();
    const meshesOf = (actor: WorldActor) =>
      Object.entries(actor.components).filter(([, component]) => parseComponentTypeTag(component.type)?.name === StaticMesh.name);

    const batchFor = (key: string, model: string, data: StaticMeshData): Batch => {
      const existing = batches.get(key);
      if (existing) return existing;
      const batch: Batch = {
        instances: createInstanceBatch({ name: `staticMesh/${model}`, source: "staticMesh", parent: ctx.root, castShadow: data.castShadow }),
        keys: [resourceKey.model(model)],
        disposed: false,
      };
      batches.set(key, batch);
      ctx.resources.model(model).then(
        async (template) => {
          if (batch.disposed) return;
          const materials = await materialsFor(ctx, batch, template, data.materials);
          if (batch.disposed) return;
          batch.instances.setParts(modelParts(template, materials));
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
      batch.instances.dispose();
      // Every use is taken synchronously when asked (the model at once, the materials when the model arrives).
      for (const resource of batch.keys) ctx.resources.release(resource);
      batch.keys.length = 0;
    };

    const add = (actor: WorldActor, key: string, data: StaticMeshData): void => {
      if (data.mesh === null) return;
      const id = `${actor.id}/${key}`;
      const batchKey = staticMeshBatchKey(data);
      placed.set(id, batchKey);
      componentWorldMatrix(ctx.world, actor, key, matrix);
      batchFor(batchKey, data.mesh, data).instances.set(id, matrix, data.color, actor.id);
    };

    const remove = (id: string): void => {
      const batchKey = placed.get(id);
      if (batchKey === undefined) return;
      placed.delete(id);
      const batch = batches.get(batchKey);
      if (!batch) return;
      batch.instances.delete(id);
      if (batch.instances.size === 0) disposeBatch(batchKey, batch);
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
      for (const [key] of meshesOf(actor)) {
        const id = `${actor.id}/${key}`;
        const batchKey = placed.get(id);
        if (batchKey === undefined) continue;
        batches.get(batchKey)?.instances.move(id, componentWorldMatrix(ctx.world, actor, key, matrix));
      }
    };

    return {
      actorsAdded: added,
      actorsRemoved: removed,
      actorsChanged(changes) {
        changeInstances(changes, { move, removed, added });
      },
      sync() {
        for (const batch of batches.values()) batch.instances.flush();
      },
      dispose() {
        for (const [key, batch] of [...batches]) disposeBatch(key, batch);
        placed.clear();
      },
    };
  },
});
