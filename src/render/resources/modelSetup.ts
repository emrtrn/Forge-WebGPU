// What a loaded model gets once, before placements clone it (plan phase 3
// step 4): Forge WebGL's load-time steps, rewritten against three/webgpu.
//
// - `ensureVertexNormals` (render-three/models.ts): a mesh without normals
//   gets computed ones, so lighting does not go black.
// - `applyDefaultModelTextureAnisotropy` (render-three/textureConfig.ts): the
//   GLB's own textures are raised to the default anisotropy (8, capped by the
//   GPU), so they do not smear at grazing angles.
// - The UVW projection of the model's import settings (`forge.model@2`
//   `uvw`; Forge's applyAssetUvwMapping, src/scene/assetUvwLoader.ts): planar,
//   box, sphere or cylinder UVs from the vertex positions through the gizmo.
// - The material slots: the unique materials in traversal order (Forge's
//   collectAssetMaterialElements), the order `forge.model.materials` and
//   `forge.staticMesh.materials` index.
// Vertex colours are model defaults (phase 4 step 7), matched by primitive
// identity/topology. A mismatch never rewrites the stored data.

import {
  BufferAttribute,
  Euler,
  Matrix3,
  Matrix4,
  Mesh,
  Quaternion,
  RepeatWrapping,
  Texture,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three/webgpu";

export interface ModelVertexColors { readonly meshName: string; readonly primitiveIndex: number; readonly vertexCount: number; readonly colors: readonly number[] }
export function modelPrimitives(root: Object3D): { mesh: Mesh; meshName: string; primitiveIndex: number; vertexCount: number }[] {
  const result: { mesh: Mesh; meshName: string; primitiveIndex: number; vertexCount: number }[] = [];
  const counts = new Map<string, number>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const name = object.name;
    const primitiveIndex = counts.get(name) ?? 0;
    counts.set(name, primitiveIndex + 1);
    result.push({ mesh: object, meshName: name, primitiveIndex, vertexCount: object.geometry.getAttribute("position")?.count ?? 0 });
  });
  return result;
}
export function applyModelVertexColors(root: Object3D, entries: readonly ModelVertexColors[], warn: (message: string) => void = console.warn): void {
  const targets = modelPrimitives(root);
  for (const entry of entries) {
    const target = targets.find((one) => one.meshName === entry.meshName && one.primitiveIndex === entry.primitiveIndex);
    if (!target || target.vertexCount !== entry.vertexCount || entry.colors.length !== entry.vertexCount * 4) {
      warn(`Vertex colors do not match ${entry.meshName} primitive ${entry.primitiveIndex}; stored colors kept.`);
      continue;
    }
    target.mesh.geometry.setAttribute("color", new BufferAttribute(new Float32Array(entry.colors), 4));
    for (const material of meshMaterials(target.mesh)) {
      (material as Material & { vertexColors: boolean }).vertexColors = true;
      material.needsUpdate = true;
    }
  }
}
import { DEFAULT_ANISOTROPY } from "./textures.ts";

export type UvwMapType = "none" | "planar" | "box" | "sphere" | "cylinder";

export interface UvwSettings {
  readonly mapType: UvwMapType;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

function meshMaterials(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

export function ensureVertexNormals(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry as BufferGeometry;
    if (geometry.getAttribute("normal") || !geometry.getAttribute("position")) return;
    geometry.computeVertexNormals();
  });
}

export function applyDefaultModelTextureAnisotropy(root: Object3D, maxAnisotropy: number): void {
  const anisotropy = Math.min(DEFAULT_ANISOTROPY, Number.isFinite(maxAnisotropy) && maxAnisotropy > 0 ? maxAnisotropy : 1);
  if (anisotropy <= 1) return;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of meshMaterials(object)) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture && value.anisotropy < anisotropy) {
          value.anisotropy = anisotropy;
          value.needsUpdate = true;
        }
      }
    }
  });
}

/** The unique materials of a model in traversal order: slot i is the i-th. */
export function modelMaterialSlots(root: Object3D): Material[] {
  const materials: Material[] = [];
  const seen = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of meshMaterials(object)) {
      if (seen.has(material)) continue;
      seen.add(material);
      materials.push(material);
    }
  });
  return materials;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Forge's projectMappedUv. */
export function projectUv(type: Exclude<UvwMapType, "none">, point: Vector3, normal: Vector3): [number, number] {
  if (type === "sphere") {
    const radius = Math.max(point.length(), 1e-6);
    return [0.5 + Math.atan2(point.z, point.x) / (Math.PI * 2), Math.acos(Math.min(Math.max(point.y / radius, -1), 1)) / Math.PI];
  }
  if (type === "cylinder") return [0.5 + Math.atan2(point.z, point.x) / (Math.PI * 2), point.y + 0.5];
  if (type === "box") {
    const ax = Math.abs(normal.x);
    const ay = Math.abs(normal.y);
    const az = Math.abs(normal.z);
    if (ay >= ax && ay >= az) return [point.x + 0.5, point.z + 0.5];
    if (ax >= az) return [point.z + 0.5, point.y + 0.5];
    return [point.x + 0.5, point.y + 0.5];
  }
  return [point.x + 0.5, point.z + 0.5];
}

/** Rewrites the UVs of every mesh under `root` (model space) through the gizmo; `none` leaves them. */
export function applyUvwMapping(root: Object3D, uvw: UvwSettings, repeatTextures = true): void {
  if (uvw.mapType === "none") return;
  const mapType = uvw.mapType;
  root.updateMatrixWorld(true);
  const rootToAsset = root.matrixWorld.clone().invert();
  const rotation = new Quaternion().setFromEuler(new Euler(toRadians(uvw.rotation[0]), toRadians(uvw.rotation[1]), toRadians(uvw.rotation[2]), "XYZ"));
  const gizmo = new Matrix4()
    .compose(
      new Vector3(...uvw.position),
      rotation,
      new Vector3(Math.max(uvw.scale[0], 0.001), Math.max(uvw.scale[1], 0.001), Math.max(uvw.scale[2], 0.001)),
    )
    .invert();
  const inverseRotation = rotation.clone().invert();
  const point = new Vector3();
  const normal = new Vector3();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry as BufferGeometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    const toAsset = rootToAsset.clone().multiply(object.matrixWorld);
    const normalMatrix = new Matrix3().getNormalMatrix(toAsset);
    const normals = geometry.getAttribute("normal");
    const existing = geometry.getAttribute("uv");
    const uv = existing instanceof BufferAttribute && existing.count === position.count ? existing : new BufferAttribute(new Float32Array(position.count * 2), 2);
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(toAsset).applyMatrix4(gizmo);
      if (normals) normal.fromBufferAttribute(normals, index).applyMatrix3(normalMatrix);
      else normal.copy(point);
      normal.applyQuaternion(inverseRotation).normalize();
      const [u, v] = projectUv(mapType, point, normal);
      uv.setXY(index, u, v);
    }
    if (uv !== existing) geometry.setAttribute("uv", uv);
    uv.needsUpdate = true;
    // Projected UVs run past 0..1: the model's own textures repeat (Forge's setMaterialTexturesToRepeat).
    for (const material of repeatTextures ? meshMaterials(object) : []) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) {
          value.wrapS = RepeatWrapping;
          value.wrapT = RepeatWrapping;
          value.needsUpdate = true;
        }
      }
    }
  });
}
