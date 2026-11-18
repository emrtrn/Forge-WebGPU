// `forge generate` for a `forge.treeRecipe` (vegetation plan PG2 / PG3, §5.2,
// §6.4; user decision 2026-11-18: one GLB per LOD, wood and leaves two
// material slots). Beside `<dir>/<stem>.treerecipe.json`, in `<dir>/<stem>/`:
// - `<stem>_leaf.png`: the leaf atlas (engine/procgen/tree/treeCards.ts): the
//   leaf card (engine/procgen/texture/leafTexture.ts) and the species'
//   branch-tip card library, baked from the first seed's tree;
// - per seed and LOD `<stem>_<seed>_lod<i>.glb`: primitive 0 the wood (slot 0,
//   bark UVs), primitive 1 the leaf cards or, on a `clusters` LOD, the
//   branch-tip cards (slot 1, atlas UVs); both carry `_WIND` (trunk bend,
//   branch sway, phase, flutter) and the leaves `_LEAF` (shedding threshold,
//   colour variety), stable across LODs;
// - per seed `<stem>_<seed>_impostor_{albedo,normal}.png`: the prototype's
//   impostor (engine/procgen/tree/treeImpostor.ts: wood left, leaves right);
// - `<stem>.plantfamily.json`: one prototype per seed (its LOD chain,
//   impostor, height), the recipe's materials, collider and response profile;
// - per seed `<stem>_<seed>.foliagetype.json`: the prototype as a foliage type
//   (the family's, LOD0 and its LODs, its impostor, swaying from the vertex
//   weights).

import type { JsonObject } from "../../src/core/index.ts";
import type { BakeTexture } from "../../src/engine/procgen/bake/rasterizer.ts";
import { writeGlb, type GlbPrimitive } from "../../src/engine/procgen/glb.ts";
import { meshBounds } from "../../src/engine/procgen/mesh.ts";
import { bakeLeafTexture } from "../../src/engine/procgen/texture/leafTexture.ts";
import { bakeLeafAtlas } from "../../src/engine/procgen/tree/treeCards.ts";
import { generateTree } from "../../src/engine/procgen/tree/treeGenerator.ts";
import { bakeTreeImpostor, type TreeImpostorSurface } from "../../src/engine/procgen/tree/treeImpostor.ts";
import { normalizeTreeParams } from "../../src/engine/procgen/tree/treeParams.ts";
import { buildTreeSkeleton } from "../../src/engine/procgen/tree/treeSkeleton.ts";
import { binaryWithMeta, documentOutput, GENERATED_MODEL_OPTIMIZE, GENERATOR_VERSIONS, outputId, round, srgbTriple, type Output } from "./outputs.ts";
import { encodeRgbaPng } from "./png.ts";

/** How a material looks to the bake (generate.ts reads it from the material document). */
export interface MaterialLook {
  /** sRGB 0..1 base colour. */
  readonly color: readonly [number, number, number];
  /** Its decoded base colour texture; "leafAtlas" when it is this recipe's own leaf texture. */
  readonly texture: BakeTexture | "leafAtlas" | null;
  readonly tiling: readonly [number, number];
  readonly flipY: boolean;
  readonly alphaTest: number;
}

/** The recipe's fields the tree generator reads. */
function treeInput(data: JsonObject, seed: number): Record<string, unknown> {
  const leaves = data.leaves as JsonObject;
  return {
    seed, habit: data.habit, height: data.height, trunkRadius: data.trunkRadius, taper: data.taper, flare: data.flare,
    crownStart: data.crownStart, irregularity: data.irregularity, levels: data.levels,
    leaves: { perStem: leaves.perStem, size: leaves.size, cards: leaves.cards, clusters: leaves.clusters }, lods: data.lods,
  };
}

export function treeOutputs(
  recipeId: string, data: JsonObject, folder: string, stem: string, stats: string[],
  looks: { readonly wood: MaterialLook | null; readonly leaf: MaterialLook | null } = { wood: null, leaf: null },
): Output[] {
  const outputs: Output[] = [];
  const version = GENERATOR_VERSIONS.tree;
  const generated = { recipe: recipeId, generator: "tree", generatorVersion: version };
  const leaves = data.leaves as JsonObject;
  const card = leaves.texture as JsonObject;
  const materials = data.materials as { wood: string | null; leaf: string | null };
  const lods = data.lods as Array<JsonObject & { screenSize: number }>;
  const impostorSettings = (data.impostor ?? { enabled: false }) as { enabled: boolean; views: number; frameSize: string; screenSize: number };
  const seeds = [...new Set((data.variants as number[] | undefined) ?? [1])];

  const leafStarted = performance.now();
  const twigColor = srgbTriple(String(card.twigColor));
  const leafTexture = bakeLeafTexture({
    seed: seeds[0] ?? 1, kind: card.kind, size: Number(card.size), count: card.count,
    leafColor: srgbTriple(String(card.leafColor)), twigColor,
  });
  const firstParams = normalizeTreeParams(treeInput(data, seeds[0] ?? 1));
  const firstSkeleton = buildTreeSkeleton(firstParams);
  if ("error" in firstSkeleton) throw new Error(`seed ${seeds[0]}: ${firstSkeleton.error}`);
  const leafAtlas = bakeLeafAtlas(firstParams, firstSkeleton, { width: leafTexture.size, height: leafTexture.size, rgba: leafTexture.rgba }, twigColor);
  const leafBytes = encodeRgbaPng(leafAtlas.size, leafAtlas.size, leafAtlas.rgba);
  const leafTextureId = outputId(recipeId, "tree/leafTexture");
  binaryWithMeta(outputs, `${folder}/${stem}_leaf.png`, leafTextureId, "forge.texture@2", leafBytes, { anisotropy: 4, mipmaps: true }, generated);
  stats.push(`${stem}_leaf.png: ${leafAtlas.size} × ${leafAtlas.size} (leaf + ${leafAtlas.atlas.clusters.length} branch-tip cards), ${leafBytes.length} bytes, ${Math.round(performance.now() - leafStarted)} ms`);

  const surfaceOf = (look: MaterialLook | null, fallback: readonly [number, number, number], alphaTest: number): TreeImpostorSurface => ({
    color: look?.color ?? fallback,
    texture: look?.texture === "leafAtlas" ? { width: leafAtlas.size, height: leafAtlas.size, rgba: leafAtlas.rgba } : look?.texture ?? null,
    tiling: look?.tiling ?? [1, 1],
    flipY: look?.flipY ?? true,
    alphaTest: look ? look.alphaTest : alphaTest,
  });
  const impostorLooks = {
    wood: surfaceOf(looks.wood, [0.35, 0.27, 0.2], 0),
    // Without a leaf material the GLB's own "Leaf" colour over the atlas, as the model draws.
    leaf: surfaceOf(looks.leaf ?? { color: [1, 1, 1], texture: "leafAtlas", tiling: [1, 1], flipY: true, alphaTest: 0.5 }, [1, 1, 1], 0.5),
  };

  const familyId = outputId(recipeId, "tree/family");
  const prototypes: JsonObject[] = [];
  seeds.forEach((seed, prototype) => {
    const started = performance.now();
    const result = generateTree(treeInput(data, seed), { atlas: leafAtlas.atlas });
    if (!result.ok) throw new Error(`seed ${seed}: ${result.report.message}`);
    const lodIds: string[] = [];
    let height = 0;
    result.lods.forEach((mesh, lod) => {
      const name = `${stem}_${seed}_lod${lod}`;
      const primitives: GlbPrimitive[] = [{ mesh: mesh.wood, uvs: mesh.wood.uvs, material: 0, attributes: { _WIND: { data: mesh.wood.attributes.wind, size: 4 } } }];
      if (mesh.leaves) {
        primitives.push({
          mesh: mesh.leaves, uvs: mesh.leaves.uvs, material: 1,
          attributes: { _WIND: { data: mesh.leaves.attributes.wind, size: 4 }, _LEAF: { data: mesh.leaves.attributes.leaf!, size: 2 } },
        });
      }
      const bytes = writeGlb({
        nodes: [{ name, primitives, extras: { forgeGenerated: { recipe: recipeId, seed, lod } } }],
        materials: [{ name: "Wood", baseColor: [0.35, 0.27, 0.2, 1], roughness: 0.9 }, { name: "Leaf", baseColor: [0.3, 0.45, 0.16, 1], roughness: 0.8 }],
        generator: `Forge procgen tree ${version}`,
      });
      const id = outputId(recipeId, `tree/${seed}/lod${lod}`);
      lodIds.push(id);
      binaryWithMeta(outputs, `${folder}/${name}.glb`, id, "forge.model@2", bytes, {
        materials: [materials.wood, materials.leaf], optimize: GENERATED_MODEL_OPTIMIZE, collision: { convex: [] },
      }, generated);
      if (lod === 0) height = Math.max(meshBounds(mesh.wood).max[1], mesh.leaves ? meshBounds(mesh.leaves).max[1] : 0);
      const lodStats = result.stats[lod]!;
      stats.push(`${name}.glb: wood ${lodStats.wood.triangles}, leaves ${lodStats.leaves?.triangles ?? 0} triangles${lods[lod]?.leafCards === "clusters" ? " (branch-tip cards)" : ""}`);
    });
    stats.push(`seed ${seed}: ${result.stems} stems, ${result.clusters} leaf clusters, ${Math.round(performance.now() - started)} ms`);

    let impostor: JsonObject = { albedo: null, normal: null, views: 8, screenSize: 0.03 };
    if (impostorSettings.enabled) {
      const bakeStarted = performance.now();
      const baked = bakeTreeImpostor(result.lods[0]!, impostorLooks, { views: impostorSettings.views, frameSize: Number(impostorSettings.frameSize) });
      const ids = { albedo: outputId(recipeId, `tree/${seed}/impostor/albedo`), normal: outputId(recipeId, `tree/${seed}/impostor/normal`) };
      let bytes = 0;
      for (const slot of ["albedo", "normal"] as const) {
        const png = encodeRgbaPng(baked.width, baked.height, baked[slot]);
        bytes += png.length;
        binaryWithMeta(outputs, `${folder}/${stem}_${seed}_impostor_${slot}.png`, ids[slot], "forge.texture@2", png, { anisotropy: 1, mipmaps: true }, generated);
      }
      impostor = { albedo: ids.albedo, normal: ids.normal, views: baked.views, screenSize: round(impostorSettings.screenSize) };
      stats.push(`seed ${seed} impostor: ${baked.views} × ${baked.views} views, ${baked.width} × ${baked.height} × 2 textures, ${bytes} bytes, ${Math.round(performance.now() - bakeStarted)} ms`);
    }

    const chain = lodIds.map((mesh, lod) => ({ mesh, screenSize: lod === 0 ? 1 : round(Number(lods[lod]?.screenSize ?? 0.25)) }));
    prototypes.push({ seed, lods: chain, impostor, height: round(height) });
    const sway = data.sway as JsonObject;
    documentOutput(outputs, `${folder}/${stem}_${seed}.foliagetype.json`, {
      schema: "forge.foliageType/1",
      id: outputId(recipeId, `tree/${seed}/foliageType`),
      mesh: lodIds[0]!,
      family: familyId,
      prototype,
      radius: round(Number(data.height) * 0.3),
      scaleMin: 0.85,
      scaleMax: 1.15,
      alignToNormal: false,
      collision: data.collision !== "none",
      sway: { enabled: true, source: "vertex", amplitude: sway.amplitude, height: round(height), frequency: sway.frequency },
      lods: chain.slice(1),
      impostor,
    });
  });
  documentOutput(outputs, `${folder}/${stem}.plantfamily.json`, {
    schema: "forge.plantFamily/1",
    id: familyId,
    generatorVersion: version,
    prototypes,
    materials: { wood: materials.wood, leaf: materials.leaf },
    collider: data.collision === "none" ? "none" : "trunk",
    sway: data.sway as JsonObject,
    response: data.response as JsonObject,
  });
  return outputs;
}
