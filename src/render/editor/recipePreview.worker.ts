// A recipe's meshes, leaf atlas and impostor for its editor preview: the same
// pure generators `forge generate` runs (engine/procgen), off the main thread.
// Newer requests are told apart by their ticket.

import type { JsonObject } from "../../core/index.ts";
import { generateGrass, type GrassShape } from "../../engine/procgen/grass.ts";
import type { ProcMesh } from "../../engine/procgen/mesh.ts";
import { meshBytes } from "../../engine/procgen/recipeMemory.ts";
import { generateRock } from "../../engine/procgen/rock/rockGenerator.ts";
import { bakeSurfaceRecipe } from "../../engine/procgen/texture/surfaceRecipe.ts";
import { generateTree } from "../../engine/procgen/tree/treeGenerator.ts";
import { bakeTreeImpostor, type TreeImpostor } from "../../engine/procgen/tree/treeImpostor.ts";
import { materialLookOf, treeImpostorSurfaces, type MaterialLook } from "../../engine/procgen/tree/treeLook.ts";
import type { TreeMesh } from "../../engine/procgen/tree/treeMesh.ts";
import { treeRecipeAtlas } from "../../engine/procgen/tree/treeRecipe.ts";

interface MeshRequest {
  readonly kind: "meshes";
  readonly ticket: number;
  readonly recipe: JsonObject;
  readonly seeds: readonly number[];
  readonly draft: boolean;
  /** A tree's LOD 0 without its thinning, before the LODs. */
  readonly source: boolean;
}

/** A material document and, when its colour texture is a generated surface, that texture's recipe. */
export interface PreviewMaterial { readonly document: JsonObject; readonly surface: JsonObject | null }

interface ImpostorRequest {
  readonly kind: "impostor";
  readonly ticket: number;
  readonly recipe: JsonObject;
  readonly seed: number;
  readonly wood: PreviewMaterial | null;
  readonly leaf: PreviewMaterial | null;
}

export type RecipePreviewRequest = MeshRequest | ImpostorRequest;

export interface PreviewPart {
  readonly role: "wood" | "leaf" | "body";
  readonly mesh: ProcMesh;
  readonly uvs?: Float32Array | undefined;
  /** `_WIND`, vec4. */
  readonly wind?: Float32Array | undefined;
  /** `_LEAF`, vec2. */
  readonly leaf?: Float32Array | undefined;
}

export interface PreviewLod {
  /** `Source`, `LOD 0`… */
  readonly name: string;
  readonly triangles: number;
  readonly parts: readonly PreviewPart[];
  /** A two-sided leaf card LOD drawn without a leaf material. */
  readonly doubleSided: boolean;
}

export interface PreviewPrototype {
  readonly seed: number;
  readonly source: PreviewLod | null;
  readonly lods: readonly PreviewLod[];
  /** What the generator counts: `295 stems · 840 leaf clusters`. */
  readonly detail: string;
  /** Vertex and index bytes of the LODs. */
  readonly bytes: number;
}

export interface RecipeMeshes {
  readonly prototypes: readonly PreviewPrototype[];
  readonly atlas: { readonly size: number; readonly rgba: Uint8Array } | null;
  readonly milliseconds: number;
}

export type RecipePreviewReply =
  | { readonly ticket: number; readonly kind: "meshes"; readonly meshes: RecipeMeshes }
  | { readonly ticket: number; readonly kind: "impostor"; readonly impostor: TreeImpostor; readonly milliseconds: number }
  | { readonly ticket: number; readonly kind: "error"; readonly error: string };

let cached: { key: string; atlas: ReturnType<typeof treeRecipeAtlas> } | null = null;

function atlasOf(recipe: JsonObject, draft: boolean): ReturnType<typeof treeRecipeAtlas> {
  const key = JSON.stringify([draft, recipe.generatorVersion, recipe.growth, recipe.shrub, (recipe.variants as number[])[0], recipe.habit, recipe.height,
    recipe.trunkRadius, recipe.taper, recipe.flare, recipe.crownStart, recipe.irregularity, recipe.levels, recipe.leaves, recipe.lods]);
  if (cached?.key !== key) cached = { key, atlas: treeRecipeAtlas(recipe, draft ? 64 : undefined) };
  return cached.atlas;
}

const treePart = (role: "wood" | "leaf", mesh: TreeMesh): PreviewPart => ({ role, mesh, uvs: mesh.uvs, wind: mesh.attributes.wind, leaf: mesh.attributes.leaf });
const bytesOf = (lods: readonly PreviewLod[]): number => meshBytes(lods.flatMap((lod) => lod.parts.map((part) => ({
  positions: part.mesh.positions, normals: part.mesh.normals, indices: part.mesh.indices, colors: part.mesh.colors, uvs: part.uvs,
  attributes: { wind: part.wind, leaf: part.leaf },
}))));
const counted = (value: number, noun: string): string => `${value.toLocaleString("en-US")} ${noun}`;

function buildTree(request: MeshRequest): RecipeMeshes {
  const started = performance.now();
  const { recipe } = request;
  const atlas = atlasOf(recipe, request.draft);
  const settings = recipe.lods as JsonObject[];
  const lodsOf = (lods: readonly JsonObject[], seed: number, triangleCaps?: readonly number[]) => {
    const tree = generateTree({ ...recipe, lods: [...lods], seed }, { atlas: atlas.atlas, ...(triangleCaps ? { triangleCaps } : {}) });
    if (!tree.ok) throw new Error(tree.report.message);
    return { tree, lods: tree.lods.map((lod, index): PreviewLod => ({
      name: `LOD ${index}`, triangles: tree.stats[index]!.triangles,
      parts: [treePart("wood", lod.wood), ...(lod.leaves ? [treePart("leaf", lod.leaves)] : [])],
      doubleSided: lods[index]?.leafCards === "clustersMaterialBackfaces",
    })) };
  };
  const prototypes = request.seeds.map((seed): PreviewPrototype => {
    const { tree, lods } = lodsOf(settings, seed);
    let source: PreviewLod | null = null;
    if (request.source && settings[0] && recipe.generatorVersion !== 5) {
      const full = lodsOf([{ ...settings[0], minRadius: 0, leafFraction: 1, leafCards: "leaves" }, ...settings.slice(1)], seed, [200000]).lods[0]!;
      source = { ...full, name: "Source" };
    }
    return { seed, source, lods, detail: `${counted(tree.stems, "stems")} · ${counted(tree.clusters, "leaf clusters")}`, bytes: bytesOf(lods) };
  });
  return { prototypes, atlas: { size: atlas.size, rgba: atlas.rgba.slice() }, milliseconds: Math.round(performance.now() - started) };
}

function buildGrass(request: MeshRequest): RecipeMeshes {
  const started = performance.now();
  const blades = Math.round(request.recipe.bladeCount as number);
  const prototypes = request.seeds.map((seed): PreviewPrototype => {
    const lods = generateGrass(request.recipe as unknown as GrassShape, seed).map(({ mesh, wind }, index): PreviewLod => ({
      name: `LOD ${index}`, triangles: mesh.indices.length / 3, parts: [{ role: "body", mesh, wind }], doubleSided: true,
    }));
    return { seed, source: null, lods, detail: counted(blades, "blades"), bytes: bytesOf(lods) };
  });
  return { prototypes, atlas: null, milliseconds: Math.round(performance.now() - started) };
}

function buildRock(request: MeshRequest): RecipeMeshes {
  const started = performance.now();
  const { recipe } = request;
  const noise = (recipe.noise ?? {}) as JsonObject;
  const prototypes = request.seeds.map((seed): PreviewPrototype => {
    const rock = generateRock({
      seed, size: recipe.size, shape: recipe.shape, cuts: recipe.cuts, noiseAmplitude: noise.amplitude, noiseScale: noise.scale,
      noiseOctaves: noise.octaves, flattenBottom: recipe.flattenBottom, embedDepth: recipe.embedDepth, lods: recipe.lods,
    });
    if (!rock.ok) throw new Error(rock.report.message);
    const lods = rock.lods.map((mesh, index): PreviewLod => ({ name: `LOD ${index}`, triangles: rock.stats[index]!.triangles, parts: [{ role: "body", mesh }], doubleSided: false }));
    return { seed, source: null, lods, detail: `${recipe.collision === "hull" ? rock.collider.points.length / 3 : 0} collider points`, bytes: bytesOf(lods) };
  });
  return { prototypes, atlas: null, milliseconds: Math.round(performance.now() - started) };
}

function buildImpostor({ recipe, seed, wood, leaf }: ImpostorRequest): { impostor: TreeImpostor; milliseconds: number } {
  const started = performance.now();
  const atlas = atlasOf(recipe, false);
  const tree = generateTree({ ...recipe, seed }, { atlas: atlas.atlas });
  if (!tree.ok) throw new Error(tree.report.message);
  const settings = recipe.impostor as { views: number; frameSize: string };
  const woodTexture = wood?.surface ? bakeSurfaceRecipe(wood.surface) : null;
  const looks = {
    wood: wood ? materialLookOf(wood.document, woodTexture ? { width: woodTexture.size, height: woodTexture.size, rgba: woodTexture.baseColor } : null) : null,
    leaf: leaf ? materialLookOf(leaf.document, "leafAtlas" satisfies MaterialLook["texture"]) : null,
  };
  const impostor = bakeTreeImpostor(tree.lods[0]!, treeImpostorSurfaces(looks, atlas), { views: settings.views, frameSize: Number(settings.frameSize) });
  return { impostor, milliseconds: Math.round(performance.now() - started) };
}

function reply(request: RecipePreviewRequest): { message: RecipePreviewReply; transfer: ArrayBufferLike[] } {
  const { ticket } = request;
  if (request.kind === "impostor") {
    const built = buildImpostor(request);
    return { message: { ticket, kind: "impostor", ...built }, transfer: [built.impostor.albedo.buffer, built.impostor.normal.buffer] };
  }
  const schema = String(request.recipe.schema);
  const meshes = schema.startsWith("forge.grassRecipe/") ? buildGrass(request) : schema.startsWith("forge.rockRecipe/") ? buildRock(request) : buildTree(request);
  const transfer: ArrayBufferLike[] = meshes.atlas ? [meshes.atlas.rgba.buffer] : [];
  for (const { source, lods } of meshes.prototypes) for (const lod of source ? [source, ...lods] : lods) for (const part of lod.parts) {
    for (const data of [part.mesh.positions, part.mesh.normals, part.mesh.indices, part.mesh.colors, part.uvs, part.wind, part.leaf]) if (data) transfer.push(data.buffer);
  }
  // A rock level is one shared index array: a buffer is transferred once.
  return { message: { ticket, kind: "meshes", meshes }, transfer: [...new Set(transfer)] };
}

self.onmessage = ({ data }: MessageEvent<RecipePreviewRequest>) => {
  try {
    const { message, transfer } = reply(data);
    self.postMessage(message, { transfer: transfer as ArrayBuffer[] });
  } catch (error) {
    self.postMessage({ ticket: data.ticket, kind: "error", error: error instanceof Error ? error.message : String(error) } satisfies RecipePreviewReply);
  }
};
