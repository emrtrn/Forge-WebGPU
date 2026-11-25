// `forge generate` for a `forge.treeRecipe` (vegetation plan PG2 / PG3, §5.2,
// §6.4; user decision 2026-11-18: one GLB per LOD, wood and leaves two
// material slots). Beside `<dir>/<stem>.treerecipe.json`, in `<dir>/<stem>/`:
// - `<stem>_leaf.ktx2`: the leaf atlas (engine/procgen/tree/treeCards.ts): the
//   leaf card (engine/procgen/texture/leafTexture.ts) and the species'
//   branch-tip card library, baked from the first seed's tree; stored for the
//   leaf material's V flip (ktx2.ts);
// - per seed and LOD `<stem>_<seed>_lod<i>.glb`: primitive 0 the wood (slot 0,
//   bark UVs), primitive 1 the leaf cards or, on a `clusters` LOD, the
//   branch-tip cards (slot 1, atlas UVs); both carry `_WIND` (trunk bend,
//   branch sway, phase, flutter) and the leaves `_LEAF` (shedding threshold,
//   colour variety), stable across LODs;
// - per seed `<stem>_<seed>_impostor_{albedo,normal}.ktx2`: the prototype's
//   impostor (engine/procgen/tree/treeImpostor.ts: wood left, leaves right);
// - `<stem>.plantfamily.json`: one prototype per seed (its LOD chain,
//   impostor, height), the recipe's materials, collider and response profile;
// - per seed `<stem>_<seed>.foliagetype.json`: the prototype as a foliage type
//   (the family's, LOD0 and its LODs, its impostor, swaying from the vertex
//   weights).
// Textures are KTX2 (tools/procgen/ktx2.ts; PG3, user decision 2026-11-19).

import type { JsonObject } from "../../src/core/index.ts";
import { writeGlb, type GlbPrimitive } from "../../src/engine/procgen/glb.ts";
import { meshBounds } from "../../src/engine/procgen/mesh.ts";
import { defaultTreeLeafMaterial, treeRecipeAtlas } from "../../src/engine/procgen/tree/treeRecipe.ts";
import { treeOutputVersion } from "../../src/engine/procgen/tree/treeGrowth.ts";
import { generateTree } from "../../src/engine/procgen/tree/treeGenerator.ts";
import { bakeTreeImpostor } from "../../src/engine/procgen/tree/treeImpostor.ts";
import { treeImpostorSurfaces, type TreeLooks } from "../../src/engine/procgen/tree/treeLook.ts";
import { binaryWithMeta, documentOutput, GENERATED_MODEL_OPTIMIZE, outputId, round, type Output } from "./outputs.ts";
import { encodeRgbaKtx2 } from "./ktx2.ts";

const toLinear = (byte: number): number => { const c = byte / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgbByte = (linear: number): number => {
  const c = Math.min(1, Math.max(0, linear));
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
};

/**
 * The leaf layer's (the atlas's right half) coverage-weighted mean colour, averaged in linear light, as sRGB
 * `#rrggbb`: the far tint's colour (render/foliage/farBillboards.ts; the run-time read of an uncompressed
 * atlas, modelImpostor.ts `meanColor`, does the same). Null for an empty layer.
 */
function leafMeanHex(rgba: Uint8Array, width: number): string | null {
  let r = 0, g = 0, b = 0, weight = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if ((i / 4) % width < width / 2) continue;
    const alpha = rgba[i + 3]! / 255;
    if (alpha <= 0) continue;
    r += toLinear(rgba[i]!) * alpha; g += toLinear(rgba[i + 1]!) * alpha; b += toLinear(rgba[i + 2]!) * alpha;
    weight += alpha;
  }
  if (weight <= 0) return null;
  return `#${[r, g, b].map((c) => toSrgbByte(c / weight).toString(16).padStart(2, "0")).join("")}`;
}

export async function treeOutputs(
  recipeId: string, data: JsonObject, folder: string, stem: string, stats: string[],
  looks: TreeLooks = { wood: null, leaf: null },
): Promise<Output[]> {
  const outputs: Output[] = [];
  const version = treeOutputVersion(data.generatorVersion);
  const shrub = version === 5;
  const generated = { recipe: recipeId, generator: "tree", generatorVersion: version };
  const materials = { ...data.materials as { wood: string | null; leaf: string | null } };
  const leaf = defaultTreeLeafMaterial(recipeId, version, materials.leaf);
  if (leaf) {
    documentOutput(outputs, `${folder}/${stem}_leaf.material.json`, leaf);
    materials.leaf = leaf.id;
  }
  const lods = data.lods as Array<JsonObject & { screenSize: number }>;
  const impostorSettings = (data.impostor ?? { enabled: false }) as { enabled: boolean; views: number; frameSize: string; screenSize: number };
  const seeds = [...new Set((data.variants as number[] | undefined) ?? [1])];

  const leafStarted = performance.now();
  const leafAtlas = treeRecipeAtlas(data);
  // Stored for the leaf material's flip (without one the GLB's own "Leaf", drawn the generated way: flipped).
  const leafBytes = await encodeRgbaKtx2(leafAtlas.size, leafAtlas.size, leafAtlas.rgba, { srgb: true, flipY: looks.leaf?.flipY ?? true });
  const leafTextureId = outputId(recipeId, "tree/leafTexture");
  binaryWithMeta(outputs, `${folder}/${stem}_leaf.ktx2`, leafTextureId, "forge.texture@2", leafBytes, { anisotropy: 4, mipmaps: true }, generated);
  stats.push(`${stem}_leaf.ktx2: ${leafAtlas.size} × ${leafAtlas.size} (leaf + ${leafAtlas.atlas.clusters.length} branch-tip cards), ${leafBytes.length} bytes, ${Math.round(performance.now() - leafStarted)} ms`);

  const impostorLooks = treeImpostorSurfaces(looks, leafAtlas);

  const familyId = outputId(recipeId, "tree/family");
  const prototypes: JsonObject[] = [];
  for (const [prototype, seed] of seeds.entries()) {
    const started = performance.now();
    const result = generateTree({ ...data, seed }, { atlas: leafAtlas.atlas });
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
      const cardMode = lods[lod]?.leafCards;
      const bytes = writeGlb({
        nodes: [{ name, primitives, extras: { forgeGenerated: { recipe: recipeId, seed, lod } } }],
        materials: [{ name: "Wood", baseColor: [0.35, 0.27, 0.2, 1], roughness: 0.9 }, { name: "Leaf", baseColor: [0.3, 0.45, 0.16, 1], roughness: 0.8, doubleSided: cardMode === "clustersMaterialBackfaces" }],
        generator: `Forge procgen tree ${version}`,
      });
      const id = outputId(recipeId, `tree/${seed}/lod${lod}`);
      lodIds.push(id);
      binaryWithMeta(outputs, `${folder}/${name}.glb`, id, "forge.model@2", bytes, {
        materials: [materials.wood, materials.leaf], optimize: GENERATED_MODEL_OPTIMIZE, collision: { convex: [] },
      }, generated);
      if (lod === 0) height = Math.max(meshBounds(mesh.wood).max[1], mesh.leaves ? meshBounds(mesh.leaves).max[1] : 0);
      const lodStats = result.stats[lod]!;
      stats.push(`${name}.glb: wood ${lodStats.wood.triangles}, leaves ${lodStats.leaves?.triangles ?? 0} triangles${cardMode === "clusters" || cardMode === "clustersMaterialBackfaces" ? " (branch-tip cards)" : ""}`);
    });
    stats.push(`seed ${seed}: ${result.stems} stems, ${result.clusters} leaf clusters, ${Math.round(performance.now() - started)} ms`);

    let impostor: JsonObject = { albedo: null, normal: null, views: 8, screenSize: 0.03, color: null };
    if (!shrub && impostorSettings.enabled) {
      const bakeStarted = performance.now();
      const baked = bakeTreeImpostor(result.lods[0]!, impostorLooks, { views: impostorSettings.views, frameSize: Number(impostorSettings.frameSize) });
      const ids = { albedo: outputId(recipeId, `tree/${seed}/impostor/albedo`), normal: outputId(recipeId, `tree/${seed}/impostor/normal`) };
      let bytes = 0;
      for (const slot of ["albedo", "normal"] as const) {
        // Read with the atlas's own coordinates (impostorMaterial.ts): stored as baked.
        const ktx2 = await encodeRgbaKtx2(baked.width, baked.height, baked[slot], { srgb: slot === "albedo" });
        bytes += ktx2.length;
        binaryWithMeta(outputs, `${folder}/${stem}_${seed}_impostor_${slot}.ktx2`, ids[slot], "forge.texture@2", ktx2, { anisotropy: 1, mipmaps: true }, generated);
      }
      impostor = {
        albedo: ids.albedo, normal: ids.normal, views: baked.views, screenSize: round(impostorSettings.screenSize),
        color: leafMeanHex(baked.albedo, baked.width),
      };
      stats.push(`seed ${seed} impostor: ${baked.views} × ${baked.views} views, ${baked.width} × ${baked.height} × 2 textures, ${bytes} bytes, ${Math.round(performance.now() - bakeStarted)} ms`);
    }

    const chain = lodIds.map((mesh, lod) => ({ mesh, screenSize: lod === 0 ? 1 : round(Number(lods[lod]?.screenSize ?? 0.25)) }));
    prototypes.push({ seed, lods: chain, impostor, height: round(height) });
    const sway = data.sway as JsonObject;
    // Leave an LOD2 interval before fading a shrub out on the existing foliage path.
    const fadeStart = Math.max(75, height * 65);
    documentOutput(outputs, `${folder}/${stem}_${seed}.foliagetype.json`, {
      schema: "forge.foliageType/1",
      id: outputId(recipeId, `tree/${seed}/foliageType`),
      mesh: lodIds[0]!,
      family: familyId,
      prototype,
      radius: round(result.height * 0.3),
      scaleMin: 0.85,
      scaleMax: 1.15,
      alignToNormal: false,
      collision: !shrub && data.collision !== "none",
      ...(shrub ? { cullStart: round(fadeStart), cullEnd: round(fadeStart * 1.35) } : {}),
      sway: { enabled: true, source: "vertex", amplitude: sway.amplitude, height: round(height), frequency: sway.frequency },
      lods: chain.slice(1),
      impostor,
    });
  }
  documentOutput(outputs, `${folder}/${stem}.plantfamily.json`, {
    schema: "forge.plantFamily/1",
    id: familyId,
    generatorVersion: version,
    prototypes,
    materials: { wood: materials.wood, leaf: materials.leaf },
    collider: shrub || data.collision === "none" ? "none" : "trunk",
    sway: data.sway as JsonObject,
    response: data.response as JsonObject,
  });
  return outputs;
}
