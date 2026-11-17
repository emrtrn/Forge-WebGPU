// A model template's renderable parts (plan phase 3 step 8): each mesh of the
// template with its slot materials and its matrix under the template root.
// The static mesh batches and the GPU-driven batches (phase 5c step 5) draw
// the same parts.
//
// Slot merging (plan 5c R8.1, lossless): pieces of the template that draw the
// same material slot with the same vertex attributes become one geometry, their
// matrices baked in (a mirrored matrix flips the winding), so a batch draws one
// mesh per slot instead of one per GLB primitive. A slot with a single whole
// piece keeps its own geometry and matrix. Morph targets and skinned meshes are
// not merged. The merge runs once per template; the geometries it makes are the
// template's and go with it (`disposeMergedParts`, from disposeResource).
// A baked or merged part names its raw pieces (`lodPieces`, R9.2) so its
// automatic LOD comes from the per-primitive LOD cache.

import { BufferAttribute, BufferGeometry, Matrix4, Mesh, type Material, type Object3D } from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { InstancePart } from "../sync/instanceBatches.ts";
import type { LodPiece } from "../triangles/triangleDrawing.ts";
import type { ModelTemplate } from "./worldResources.ts";

/** One drawable piece under the template root: a slot's geometry and its own material. */
interface SlotPiece {
  readonly geometry: BufferGeometry;
  readonly local: Matrix4;
  readonly slot: number;
  readonly own: Material;
  readonly name: string;
}

interface Piece extends SlotPiece {
  /** Index (or vertex) range of the source geometry; null for all of it. */
  readonly range: { start: number; count: number } | null;
}

interface Merged { readonly pieces: (SlotPiece & { lodPieces?: LodPiece[] })[]; readonly owned: BufferGeometry[] }

function lodPiecesOf(list: readonly Piece[]): LodPiece[] {
  let vertexOffset = 0;
  return list.map((piece) => {
    const vertexCount = piece.geometry.attributes.position!.count;
    const entry = { geometry: piece.geometry, vertexOffset, vertexCount, flip: piece.local.determinant() < 0, scale: piece.local.getMaxScaleOnAxis(), range: piece.range };
    vertexOffset += vertexCount;
    return entry;
  });
}

const mergedByScene = new WeakMap<Object3D, Merged>();

/** Pieces with equal signatures can merge; null never merges (morph targets). */
function signatureOf(geometry: BufferGeometry): string | null {
  if (Object.keys(geometry.morphAttributes).length > 0) return null;
  return Object.entries(geometry.attributes)
    .map(([name, attribute]) => {
      const a = attribute as BufferAttribute;
      return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`;
    })
    .sort()
    .join("|");
}

/** The piece as a standalone indexed geometry in template-root space. */
function baked(piece: Piece): BufferGeometry {
  const source = piece.geometry;
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, (attribute as BufferAttribute).clone());
  const all = source.index ? source.index.count : source.attributes.position!.count;
  const start = piece.range?.start ?? 0;
  const end = Math.min(all, start + (piece.range?.count ?? all));
  const indices = new Uint32Array(Math.max(0, end - start));
  for (let i = start; i < end; i += 1) indices[i - start] = source.index ? source.index.getX(i) : i;
  geometry.applyMatrix4(piece.local);
  if (piece.local.determinant() < 0) {
    for (let i = 0; i + 2 < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

function slotPieces(model: ModelTemplate): Merged {
  const cached = mergedByScene.get(model.scene);
  if (cached) return cached;
  const slotOf = new Map<Material, number>();
  model.slots.forEach((material, index) => slotOf.set(material, index));
  model.scene.updateMatrixWorld(true);
  const keyed = new Map<string, Piece[]>();
  const order: Piece[][] = [];
  model.scene.traverse((child) => {
    if (!(child instanceof Mesh) || (child as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh === true) return;
    const mesh = child as Mesh;
    const materials = Array.isArray(mesh.material) ? (mesh.material as Material[]) : [mesh.material as Material];
    const signature = signatureOf(mesh.geometry);
    const ranges = Array.isArray(mesh.material) && mesh.geometry.groups.length > 0
      ? mesh.geometry.groups.map((group) => ({ range: { start: group.start, count: group.count }, local: group.materialIndex ?? 0 }))
      : [{ range: null, local: 0 }];
    for (const { range, local } of ranges) {
      const own = materials[local];
      if (!own) continue;
      const slot = slotOf.get(own) ?? local;
      const piece: Piece = { geometry: mesh.geometry, local: mesh.matrixWorld.clone(), slot, own, name: mesh.name || "mesh", range };
      const key = signature === null ? null : `${slot}#${signature}`;
      const list = key === null ? undefined : keyed.get(key);
      if (list) list.push(piece);
      else {
        const created = [piece];
        if (key !== null) keyed.set(key, created);
        order.push(created);
      }
    }
  });
  const pieces: Merged["pieces"] = [];
  const owned: BufferGeometry[] = [];
  const bakedPiece = (piece: Piece): SlotPiece & { lodPieces: LodPiece[] } => {
    const geometry = baked(piece);
    owned.push(geometry);
    return { ...piece, geometry, local: new Matrix4(), lodPieces: lodPiecesOf([piece]) };
  };
  for (const list of order) {
    const first = list[0]!;
    if (list.length === 1) {
      pieces.push(first.range === null ? first : bakedPiece(first));
      continue;
    }
    const parts = list.map(baked);
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) {
      for (const piece of list) pieces.push(piece.range === null ? piece : bakedPiece(piece));
      continue;
    }
    geometry.name = `slot ${first.slot}`;
    owned.push(geometry);
    pieces.push({ geometry, local: new Matrix4(), slot: first.slot, own: first.own, name: geometry.name, lodPieces: lodPiecesOf(list) });
  }
  const result = { pieces, owned };
  mergedByScene.set(model.scene, result);
  return result;
}

/** Frees the merged geometries of a template's scene (its model cache entry goes). */
export function disposeMergedParts(scene: Object3D): void {
  const entry = mergedByScene.get(scene);
  if (!entry) return;
  mergedByScene.delete(scene);
  for (const geometry of entry.owned) geometry.dispose();
}

/** The template's renderable parts with their slot materials and their matrices under the template root. */
export function modelParts(model: ModelTemplate, chosen: readonly Material[]): InstancePart[] {
  return slotPieces(model).pieces.map((piece) => ({
    geometry: piece.geometry,
    material: chosen[piece.slot] ?? piece.own,
    local: piece.local.clone(),
    name: piece.name,
    slots: [piece.slot],
    ...(piece.lodPieces ? { lodPieces: piece.lodPieces } : {}),
  }));
}
