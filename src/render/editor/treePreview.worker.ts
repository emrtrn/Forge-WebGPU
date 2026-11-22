import type { JsonObject } from "../../core/index.ts";
import { generateTree } from "../../engine/procgen/tree/treeGenerator.ts";
import { treeRecipeAtlas } from "../../engine/procgen/tree/treeRecipe.ts";
import { generateGrass, type GrassShape } from "../../engine/procgen/grass.ts";

export interface TreePreviewRequest {
  ticket: number;
  recipe: JsonObject;
  seed: number;
  draft: boolean;
}

let cached: { key: string; atlas: ReturnType<typeof treeRecipeAtlas> } | null = null;

function buildTree({ recipe, seed, draft }: TreePreviewRequest) {
  const start = performance.now();
  const key = JSON.stringify([draft, recipe.generatorVersion, recipe.growth, recipe.shrub, (recipe.variants as number[])[0], recipe.habit, recipe.height,
    recipe.trunkRadius, recipe.taper, recipe.flare, recipe.crownStart, recipe.irregularity, recipe.levels, recipe.leaves, recipe.lods]);
  if (cached?.key !== key) cached = { key, atlas: treeRecipeAtlas(recipe, draft ? 64 : undefined) };
  const atlas = cached.atlas;
  const tree = generateTree({ ...recipe, seed }, { atlas: atlas.atlas });
  if (!tree.ok) throw new Error(tree.report.message);
  return { lods: tree.lods, triangles: tree.stats.map(lod => lod.triangles), stems: tree.stems,
    clusters: tree.clusters, size: atlas.size, rgba: atlas.rgba.slice(), milliseconds: Math.round(performance.now() - start) };
}

function buildGrass({ recipe, seed }: TreePreviewRequest) {
  const start = performance.now();
  const lods = generateGrass(recipe as unknown as GrassShape, seed).map(lod => lod.mesh);
  return { lods, bladeCount: Math.round(recipe.bladeCount as number), milliseconds: Math.round(performance.now() - start) };
}

export type TreePreviewReply = { ticket: number; tree: ReturnType<typeof buildTree> }
  | { ticket: number; grass: ReturnType<typeof buildGrass> } | { ticket: number; error: string };

self.onmessage = ({ data }: MessageEvent<TreePreviewRequest>) => {
  try {
    if (data.recipe.schema === "forge.grassRecipe/1") {
      const grass = buildGrass(data);
      const buffers = grass.lods.flatMap(mesh => [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer, mesh.colors!.buffer]);
      self.postMessage({ ticket: data.ticket, grass }, { transfer: buffers as ArrayBuffer[] });
      return;
    }
    const tree = buildTree(data);
    const buffers: ArrayBufferLike[] = [tree.rgba.buffer];
    for (const lod of tree.lods) for (const mesh of [lod.wood, lod.leaves]) {
      if (!mesh) continue;
      buffers.push(mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer, mesh.uvs.buffer, mesh.attributes.wind.buffer);
      if (mesh.attributes.leaf) buffers.push(mesh.attributes.leaf.buffer);
    }
    self.postMessage({ ticket: data.ticket, tree }, { transfer: buffers as ArrayBuffer[] });
  } catch (error) {
    self.postMessage({ ticket: data.ticket, error: error instanceof Error ? error.message : String(error) });
  }
};
