// A world's typed view of the host's resource cache (architecture A6, §4.9).
// Bindings ask for what they draw by asset GUID or procedural recipe; the
// counts go to the world's owner, and `releaseAll` runs when the world goes.

import type { BufferGeometry, Material, Object3D } from "three/webgpu";
import { createShapeMaterial } from "../materials/shapeMaterial.ts";
import { resourceKey, type ResourceCache, type ResourceOwner } from "./resourceCache.ts";
import { createShapeGeometry, type ShapePrimitive } from "./shapes.ts";

/** A loaded model: placements clone `scene` (geometry and materials are shared). */
export interface ModelTemplate {
  readonly scene: Object3D;
}

/** Loads a model asset by GUID (the host's glTF loader and asset URLs). */
export interface ModelSource {
  load(guid: string): Promise<ModelTemplate>;
}

export const shapeMaterialKey = (color: string, doubleSided: boolean): string =>
  `shapeMaterial:${color.toLowerCase()}:${doubleSided ? "double" : "single"}`;

export interface WorldResources {
  readonly owner: ResourceOwner;
  /** Key `model:<guid>`. */
  model(guid: string): Promise<ModelTemplate>;
  /** Key `shape:<primitive>`. */
  shapeGeometry(primitive: ShapePrimitive): Promise<BufferGeometry>;
  /** Key `shapeMaterial:<color>:<sides>`. */
  shapeMaterial(color: string, doubleSided: boolean): Promise<Material>;
  /** Gives back one use of a key. */
  release(key: string): void;
  releaseAll(): void;
}

export function createWorldResources(cache: ResourceCache, name: string, models: ModelSource): WorldResources {
  const owner = cache.owner(name);
  return {
    owner,
    model: (guid) => owner.acquire(resourceKey.model(guid), () => models.load(guid)),
    shapeGeometry: (primitive) => owner.acquire(resourceKey.shape(primitive), () => createShapeGeometry(primitive)),
    shapeMaterial: (color, doubleSided) =>
      owner.acquire(shapeMaterialKey(color, doubleSided), () => createShapeMaterial(color, doubleSided)),
    release: (key) => owner.release(key),
    releaseAll: () => owner.releaseAll(),
  };
}
