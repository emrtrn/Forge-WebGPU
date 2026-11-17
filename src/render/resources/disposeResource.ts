// Frees what an evicted cache entry loaded (plan phase 5b step 5; Forge's
// disposeGltfResources, deferred here from phase 3). The cache evicts an
// entry only when no owner holds it, so its GPU objects have no user left.
//
// - A model template: every geometry, material and the material's textures
//   in its scene. They are the GLB's own: slot override materials and
//   `forge.texture` textures are cache entries of their own. Its merged slot
//   geometries (modelParts.ts) go too.
// - A material (`forge.material`, a shape material): the material only; its
//   textures are cache entries (`texture:<guid>:<space>`) and go on their own.
// - A geometry or a texture: itself.
// - Anything else (terrain data, which owns pooled, streamed slots) is left
//   to its owner.

import type { BufferGeometry, Material, Object3D, Texture } from "three/webgpu";
import { disposeMergedParts } from "./modelParts.ts";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isTexture = (value: unknown): value is Texture => isObject(value) && value.isTexture === true;

function disposeMaterialAndTextures(material: Material, disposed: Set<unknown>): void {
  if (disposed.has(material)) return;
  disposed.add(material);
  for (const value of Object.values(material)) {
    if (isTexture(value) && !disposed.has(value)) {
      disposed.add(value);
      value.dispose();
    }
  }
  material.dispose();
}

function disposeModel(scene: Object3D): void {
  const disposed = new Set<unknown>();
  scene.traverse((object) => {
    const mesh = object as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (mesh.geometry && !disposed.has(mesh.geometry)) {
      disposed.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) disposeMaterialAndTextures(material, disposed);
  });
}

/** The cache's disposer: by resource kind (the key's prefix), then by what the value is. */
export function disposeResource(key: string, value: unknown): void {
  if (!isObject(value)) return;
  if (key.startsWith("model:") && isObject(value.scene) && value.scene.isObject3D === true) {
    disposeModel(value.scene as unknown as Object3D);
    disposeMergedParts(value.scene as unknown as Object3D);
    return;
  }
  if (key.startsWith("terrain:")) return;
  if (typeof value.dispose === "function" && (value.isMaterial === true || value.isBufferGeometry === true || value.isTexture === true)) {
    (value as unknown as { dispose(): void }).dispose();
  }
}
