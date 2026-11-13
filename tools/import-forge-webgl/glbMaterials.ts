// How many material slots a GLB has (user decision 2026-11-13: a Forge
// placement's single `materialSlot` override is written on every slot).
//
// A slot is a unique material in the order three's GLTFLoader meets it while
// building the scene, which is the order Forge's `collectAssetMaterialElements`
// walked: the default scene's nodes depth first, a node's own primitives
// before its children; a primitive without a material shares the loader's one
// default material. Read from the container's JSON chunk only.

import { parseGlb } from "../assets/assetPerfReport.ts";

interface GltfNode {
  mesh?: number;
  children?: number[];
}

interface GltfMaterialJson {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: GltfNode[];
  meshes?: Array<{ primitives?: Array<{ material?: number }> }>;
}

/** Material keys in slot order: the glTF material index, or `default`. */
export function gltfMaterialSlots(json: GltfMaterialJson): string[] {
  const order: string[] = [];
  const meet = (key: string): void => {
    if (!order.includes(key)) order.push(key);
  };
  const meshMaterials = (mesh: number): void => {
    for (const primitive of json.meshes?.[mesh]?.primitives ?? []) {
      meet(primitive.material === undefined ? "default" : String(primitive.material));
    }
  };
  const visit = (index: number, seen: Set<number>): void => {
    if (seen.has(index)) return;
    seen.add(index);
    const node = json.nodes?.[index];
    if (!node) return;
    if (node.mesh !== undefined) meshMaterials(node.mesh);
    for (const child of node.children ?? []) visit(child, seen);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  if (scene) {
    const seen = new Set<number>();
    for (const node of scene.nodes ?? []) visit(node, seen);
  } else {
    (json.meshes ?? []).forEach((_, mesh) => meshMaterials(mesh));
  }
  return order;
}

/** Slot count of a GLB file (at least 1, as Forge counted); null when the bytes are not a GLB. */
export function glbMaterialSlotCount(bytes: Uint8Array): number | null {
  const parsed = parseGlb(bytes);
  if (!parsed) return null;
  return Math.max(1, gltfMaterialSlots(parsed.json as unknown as GltfMaterialJson).length);
}
