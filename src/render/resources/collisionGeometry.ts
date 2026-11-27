import type { ModelCollisionGeometry } from "../../engine/physics/physicsService.ts";
import { roadMeshPart } from "../sync/roadMeshes.ts";
import { modelParts } from "./modelParts.ts";
import { resourceKey } from "./resourceCache.ts";
import type { WorldResources } from "./worldResources.ts";

export function renderCollisionGeometry(resourcesFor: () => WorldResources): ModelCollisionGeometry {
  return async (asset) => {
    const resources = resourcesFor();
    try {
      const model = await resources.model(asset);
      return modelParts(model, model.slots).map((part) => {
        const mesh = roadMeshPart(part);
        return { positions: mesh.attributes.position!.values, indices: mesh.indices };
      });
    } finally {
      resources.release(resourceKey.model(asset));
    }
  };
}
