// `forge.treeRecipe` to LOD meshes: the crown generator (crown/, vegetation
// plan PG5b, §9.8).

import type { MeshStats } from "../stats.ts";
import { generateCrownTree } from "./crown/crownTree.ts";
import type { TreeLodMesh } from "./treeMesh.ts";

export interface TreeReport {
  code: "budget" | "skeleton";
  message: string;
  lod?: number;
}

export type TreeResult = {
  ok: true;
  lods: TreeLodMesh[];
  stats: { wood: MeshStats; leaves: MeshStats | null; triangles: number }[];
  height: number;
  stems: number;
  sprays: number;
  /** Each LOD's leaf area (m²), and what its index is taken over. */
  crown: { leafArea: readonly number[]; referenceArea: number; radius: number };
} | { ok: false; report: TreeReport };

export function generateTree(recipe: Readonly<Record<string, unknown>>, options?: { triangleCaps?: readonly number[] }): TreeResult {
  return generateCrownTree(recipe, options);
}
