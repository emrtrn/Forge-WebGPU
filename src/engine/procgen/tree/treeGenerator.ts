import { meshStats } from "../stats.ts";
import type { MeshStats } from "../stats.ts";
import { clusterLibrary, leafAtlasOf } from "./treeCards.ts";
import { buildTreeLod, planTreeLod } from "./treeMesh.ts";
import type { LeafAtlas, TreeLodMesh } from "./treeMesh.ts";
import { normalizeTreeParams } from "./treeParams.ts";
import type { TreeParams } from "./treeParams.ts";
import { buildTreeSkeleton } from "./treeSkeleton.ts";

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
  clusters: number;
} | { ok: false; report: TreeReport };

const TRIANGLE_CAPS = [20000, 5000, 800, 800];

export function generateTree(
  input: Readonly<Record<string, unknown>> | TreeParams,
  options?: {
    triangleCaps?: readonly number[];
    /** The species' leaf atlas (treeCards.ts): leaf cards in its leaf tile, `clusterCards` LODs from its library. Without one, leaf cards span the whole texture and the cards come from this tree's own library (geometry only). */
    atlas?: LeafAtlas;
  },
): TreeResult {
  const params = normalizeTreeParams({ ...input });
  const skeleton = buildTreeSkeleton(params);
  if ("error" in skeleton) return { ok: false, report: { code: "skeleton", message: skeleton.error } };

  const atlas = options?.atlas ?? (params.lods.some((lod) => lod.clusterCards)
    ? { ...leafAtlasOf(clusterLibrary(params, skeleton)), leaf: [0, 0, 1, 1] as const }
    : undefined);
  const plans: ReturnType<typeof planTreeLod>[] = [];
  for (const [lod, settings] of params.lods.entries()) {
    const requested = options?.triangleCaps?.[lod];
    const cap = requested !== undefined && Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : TRIANGLE_CAPS[lod]!;
    const plan = planTreeLod(params, skeleton, settings, settings.clusterCards && (atlas?.clusters.length ?? 0) > 0);
    if (plan.triangles > cap) return { ok: false, report: {
      code: "budget", lod, message: `LOD${lod} requests ${plan.triangles} triangles; cap is ${cap}`,
    } };
    plans.push(plan);
  }
  const lods = params.lods.map((lod, i) => buildTreeLod(params, skeleton, lod, plans[i]!, atlas));
  const stats = lods.map(lod => {
    const wood = meshStats(lod.wood), leaves = lod.leaves ? meshStats(lod.leaves) : null;
    return { wood, leaves, triangles: wood.triangles + (leaves?.triangles ?? 0) };
  });
  return { ok: true, lods, stats, height: params.height, stems: skeleton.stems.length, clusters: plans[0]!.clusters };
}
