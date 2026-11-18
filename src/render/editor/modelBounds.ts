// Model bounds for the editor's Generate Zones (plan 5c R9b Z5): a static
// mesh's walls are its model's box, read from the viewport's resource cache
// (the model is loaded for the moment and released). Model space; cached per
// model for the editor's lifetime (a model file edit is a new GUID's or the
// same box until reload, which the generation tolerates).

import { Box3 } from "three/webgpu";
import type { Vec3 } from "../../core/index.ts";
import { resourceKey } from "../resources/resourceCache.ts";
import type { RenderHost } from "../host/renderHost.ts";

export type ModelBoundsReader = (model: string) => Promise<{ readonly min: Vec3; readonly max: Vec3 } | null>;

export function createModelBounds(host: () => RenderHost | null): ModelBoundsReader {
  const cache = new Map<string, { min: Vec3; max: Vec3 } | null>();
  return async (model) => {
    if (cache.has(model)) return cache.get(model)!;
    const resources = host()?.world?.resources;
    if (!resources) return null;
    let bounds: { min: Vec3; max: Vec3 } | null = null;
    try {
      const template = await resources.model(model);
      template.scene.updateMatrixWorld(true);
      const box = new Box3().setFromObject(template.scene);
      if (!box.isEmpty()) bounds = { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
      resources.release(resourceKey.model(model));
    } catch {
      // A model that fails to load is skipped (counted by the cache).
    }
    cache.set(model, bounds);
    return bounds;
  };
}
