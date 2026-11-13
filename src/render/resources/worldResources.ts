// A world's typed view of the host's resource cache (architecture A6, §4.9).
// Bindings ask for what they draw by asset GUID or procedural recipe; the
// counts go to the world's owner, and `releaseAll` runs when the world goes.

import type { BufferGeometry, Material, Object3D } from "three/webgpu";
import type { MaterialContributions } from "../materials/contributions.ts";
import { createShapeMaterial } from "../materials/shapeMaterial.ts";
import { resourceKey, type ResourceCache, type ResourceOwner } from "./resourceCache.ts";
import { createShapeGeometry, type ShapePrimitive } from "./shapes.ts";
import type { SurfaceMaterials } from "./surfaceMaterials.ts";
import type { TerrainData, TerrainSource } from "./terrains.ts";

/** A loaded model: placements clone `scene` (geometry and materials are shared). */
export interface ModelTemplate {
  readonly scene: Object3D;
  /** The GLB's unique materials in traversal order: slot i (`modelMaterialSlots`). */
  readonly slots: readonly Material[];
  /** The model's default material per slot (`forge.model` `materials`); null keeps the GLB's. */
  readonly slotMaterials: readonly (string | null)[];
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
  /** A `forge.material` asset with these contributions; key `material:<guid>:<signature>`. */
  material(guid: string, contributions?: MaterialContributions): Promise<Material>;
  /** The key `material(guid, contributions)` counts under, for `release`. */
  materialKey(guid: string, contributions?: MaterialContributions): string;
  /** A `forge.terrain` data document with its tiles and layer inputs; key `terrain:<guid>`. */
  terrain(guid: string): Promise<TerrainData>;
  /** Gives back one use of a key. */
  release(key: string): void;
  releaseAll(): void;
}

export function createWorldResources(
  cache: ResourceCache,
  name: string,
  models: ModelSource,
  materials: SurfaceMaterials | null = null,
  terrains: TerrainSource | null = null,
): WorldResources {
  const owner = cache.owner(name);
  const materialKey = (guid: string, contributions: MaterialContributions = {}): string =>
    materials ? materials.key(guid, contributions) : resourceKey.material(guid, "none");
  return {
    owner,
    model: (guid) => owner.acquire(resourceKey.model(guid), () => models.load(guid)),
    material: (guid, contributions = {}) =>
      owner.acquire(materialKey(guid, contributions), () =>
        materials ? materials.build(guid, contributions) : Promise.reject(new Error(`forge render: no material source for ${guid}`)),
      ),
    materialKey,
    terrain: (guid) =>
      owner.acquire(resourceKey.terrain(guid), () =>
        terrains ? terrains.load(guid) : Promise.reject(new Error(`forge render: no terrain source for ${guid}`)),
      ),
    shapeGeometry: (primitive) => owner.acquire(resourceKey.shape(primitive), () => createShapeGeometry(primitive)),
    shapeMaterial: (color, doubleSided) =>
      owner.acquire(shapeMaterialKey(color, doubleSided), () => createShapeMaterial(color, doubleSided)),
    release: (key) => owner.release(key),
    releaseAll: () => owner.releaseAll(),
  };
}
