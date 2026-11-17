// A model template's renderable parts (plan phase 3 step 8): each mesh of the
// template with its slot materials and its matrix under the template root.
// The static mesh batches and the GPU-driven batches (phase 5c step 5) draw
// the same parts.

import { Mesh, type Material } from "three/webgpu";
import type { InstancePart } from "../sync/instanceBatches.ts";
import { slotResolver } from "./modelSlots.ts";
import type { ModelTemplate } from "./worldResources.ts";

/** The template's renderable parts with their slot materials and their matrices under the template root. */
export function modelParts(model: ModelTemplate, chosen: readonly Material[]): InstancePart[] {
  const resolve = slotResolver(model.slots, chosen);
  const slotOf = new Map<Material, number>();
  model.slots.forEach((material, index) => slotOf.set(material, index));
  model.scene.updateMatrixWorld(true);
  const parts: InstancePart[] = [];
  model.scene.traverse((child) => {
    if (!(child instanceof Mesh) || (child as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh === true) return;
    const mesh = child as Mesh;
    const material = Array.isArray(mesh.material)
      ? (mesh.material as Material[]).map((own, local) => resolve(own, local))
      : resolve(mesh.material as Material, 0);
    const own = Array.isArray(mesh.material) ? (mesh.material as Material[]) : [mesh.material as Material];
    const slots = own.map((one, local) => slotOf.get(one) ?? local);
    parts.push({ geometry: mesh.geometry, material, local: mesh.matrixWorld.clone(), name: mesh.name || "mesh", slots });
  });
  return parts;
}
