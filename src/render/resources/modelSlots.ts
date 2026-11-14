// A model's material slots (plan phase 3 step 4; Forge WebGL's
// applyMaterialSlotOverrides / resolveMeshMaterialSlots): slot i of a model is
// its i-th unique GLB material; it draws with the placement's override, else
// the model's default (`forge.model` `materials`), else the GLB's own. Shared
// by the static mesh binding and the editor's thumbnails (plan phase 4 step 6b).

import { Mesh, type Material, type Object3D } from "three/webgpu";
import type { ModelTemplate } from "./worldResources.ts";

/** The material GUID each model slot draws with: the placement's override, else the model's default, else null (the GLB's). */
export function slotMaterialIds(model: Pick<ModelTemplate, "slots" | "slotMaterials">, overrides: readonly (string | null)[]): (string | null)[] {
  return model.slots.map((_, index) => overrides[index] ?? model.slotMaterials[index] ?? null);
}

/** The material a mesh's material takes: its slot's chosen one (`chosen[i]` for template slot i). */
export function slotResolver(slots: readonly Material[], chosen: readonly Material[]): (material: Material, local: number) => Material {
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
