// Static Mesh: render binding. Each `forge.staticMesh` component shows its
// model asset through the host's resource cache, keyed by the model's GUID:
// placements clone the loaded scene, so geometry is shared.
//
// Materials (plan phase 3 step 4; Forge WebGL's applyMaterialSlotOverrides /
// resolveMeshMaterialSlots / tintedMaterial): slot i of the model (its i-th
// unique GLB material) draws with the placement's `materials[i]`, else the
// model's default for that slot (`forge.model` `materials`), else the GLB's
// own material. `forge.material` assets come from the cache
// (`material:<guid>:<signature>`), shared by every placement. A placement
// colour replaces the base colour on a copy the placement owns (textures
// stay). `castShadow` is the component's; every mesh receives shadows.
//
// A component without a model, or whose model fails to load, draws nothing; a
// material that fails leaves its slot on the GLB's own material. Failures are
// counted by the cache and reported by the host. Instancing comes with step 8.

import type { Material, Object3D } from "three/webgpu";
import { Mesh } from "three/webgpu";
import { parseComponentTypeTag, type WorldActor } from "../../core/index.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import type { ModelTemplate } from "../../render/resources/worldResources.ts";
import { defineRenderBinding, type RenderBindingContext } from "../../render/sync/renderBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { StaticMesh, type StaticMeshData } from "./schema.ts";

interface Placed {
  object: Object3D | null;
  removed: boolean;
  /** Cache keys this placement holds a use of. */
  readonly keys: string[];
  /** Tinted material copies this placement owns. */
  readonly owned: Material[];
}

/** The material GUID each model slot draws with: the placement's override, else the model's default, else null (the GLB's). */
export function slotMaterialIds(model: Pick<ModelTemplate, "slots" | "slotMaterials">, overrides: readonly (string | null)[]): (string | null)[] {
  return model.slots.map((_, index) => overrides[index] ?? model.slotMaterials[index] ?? null);
}

/** Puts each mesh's slot materials on the clone; `chosen[i]` replaces the template's slot i material. */
export function assignSlotMaterials(object: Object3D, slots: readonly Material[], chosen: readonly Material[]): void {
  const slotOf = new Map<Material, number>();
  slots.forEach((material, index) => slotOf.set(material, index));
  const resolve = (material: Material, local: number): Material => chosen[slotOf.get(material) ?? local] ?? material;
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const mesh = child as Mesh;
    mesh.material = Array.isArray(mesh.material)
      ? (mesh.material as Material[]).map((material, local) => resolve(material, local))
      : resolve(mesh.material as Material, 0);
  });
}

/** A copy of `material` whose base colour is `color` (Forge's tintedMaterial). */
function tinted(material: Material, color: string): Material {
  const copy = material.clone();
  const target = (copy as Material & { color?: { set(value: string): unknown } }).color;
  target?.set(color);
  return copy;
}

async function materialsFor(ctx: RenderBindingContext, entry: Placed, model: ModelTemplate, data: StaticMeshData): Promise<Material[]> {
  const ids = slotMaterialIds(model, data.materials);
  const loaded = await Promise.all(
    ids.map((guid) => {
      if (guid === null) return Promise.resolve(null);
      entry.keys.push(ctx.resources.materialKey(guid));
      return ctx.resources.material(guid).then(
        (material) => material,
        () => null, // counted by the cache; the slot keeps the GLB's material
      );
    }),
  );
  return model.slots.map((own, index) => {
    const chosen = loaded[index] ?? own;
    if (data.color === null) return chosen;
    const copy = tinted(chosen, data.color);
    entry.owned.push(copy);
    return copy;
  });
}

export default defineRenderBinding({
  feature: "forge.staticMesh",
  create(ctx) {
    const placed = new Map<string, Placed>();
    const meshesOf = (actor: WorldActor) =>
      Object.entries(actor.components).filter(([, component]) => parseComponentTypeTag(component.type)?.name === StaticMesh.name);

    const add = (actor: WorldActor, key: string, data: StaticMeshData): void => {
      if (data.mesh === null) return;
      const entry: Placed = { object: null, removed: false, keys: [resourceKey.model(data.mesh)], owned: [] };
      placed.set(`${actor.id}/${key}`, entry);
      ctx.resources.model(data.mesh).then(
        async (model) => {
          if (entry.removed) return;
          const materials = await materialsFor(ctx, entry, model, data);
          if (entry.removed) {
            // Removed while its materials loaded: its keys are already given back.
            for (const material of entry.owned) material.dispose();
            return;
          }
          const object = model.scene.clone();
          object.name = `${actor.name}/${key}`;
          object.matrixAutoUpdate = false;
          assignSlotMaterials(object, model.slots, materials);
          object.traverse((child) => {
            child.castShadow = data.castShadow;
            child.receiveShadow = true;
          });
          componentWorldMatrix(ctx.world, actor, key, object.matrix);
          object.matrixWorldNeedsUpdate = true;
          entry.object = object;
          ctx.root.add(object);
        },
        () => {
          // Counted by the cache and reported by the host; the placement stays empty.
        },
      );
    };

    const remove = (id: string): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      entry.removed = true;
      entry.object?.removeFromParent();
      for (const key of entry.keys) ctx.resources.release(key);
      for (const material of entry.owned) material.dispose();
    };

    return {
      actorsAdded(actors) {
        for (const actor of actors) {
          for (const [key, component] of meshesOf(actor)) add(actor, key, component as unknown as StaticMeshData);
        }
      },
      actorsRemoved(actors) {
        for (const actor of actors) for (const [key] of meshesOf(actor)) remove(`${actor.id}/${key}`);
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
      },
    };
  },
});
