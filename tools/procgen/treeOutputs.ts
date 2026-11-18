// `forge generate` for a `forge.treeRecipe` (vegetation plan PG2, §5.2; user
// decision 2026-11-18: one GLB per LOD, wood and leaves two material slots).
// Beside `<dir>/<stem>.treerecipe.json`, in `<dir>/<stem>/`:
// - `<stem>_leaf.png`: the leaf card texture (engine/procgen/texture/leafTexture.ts);
// - per seed and LOD `<stem>_<seed>_lod<i>.glb`: primitive 0 the wood (slot 0,
//   bark UVs), primitive 1 the leaf cards (slot 1, card UVs); both carry
//   `_WIND` (trunk bend, branch sway, phase, flutter) and the leaves `_LEAF`
//   (shedding threshold, colour variety), stable across LODs;
// - `<stem>.plantfamily.json`: one prototype per seed (its LOD chain, height),
//   the recipe's materials, collider and response profile;
// - per seed `<stem>_<seed>.foliagetype.json`: the prototype as a foliage type
//   (the family's, LOD0 and its LODs, swaying from the vertex weights).

import type { JsonObject } from "../../src/core/index.ts";
import { writeGlb, type GlbPrimitive } from "../../src/engine/procgen/glb.ts";
import { meshBounds } from "../../src/engine/procgen/mesh.ts";
import { bakeLeafTexture } from "../../src/engine/procgen/texture/leafTexture.ts";
import { generateTree } from "../../src/engine/procgen/tree/treeGenerator.ts";
import { binaryWithMeta, documentOutput, GENERATED_MODEL_OPTIMIZE, GENERATOR_VERSIONS, outputId, round, srgbTriple, type Output } from "./outputs.ts";
import { encodeRgbaPng } from "./png.ts";

export function treeOutputs(recipeId: string, data: JsonObject, folder: string, stem: string, stats: string[]): Output[] {
  const outputs: Output[] = [];
  const version = GENERATOR_VERSIONS.tree;
  const generated = { recipe: recipeId, generator: "tree", generatorVersion: version };
  const leaves = data.leaves as JsonObject;
  const card = leaves.texture as JsonObject;
  const materials = data.materials as { wood: string | null; leaf: string | null };
  const lods = data.lods as Array<JsonObject & { screenSize: number }>;
  const seeds = [...new Set((data.variants as number[] | undefined) ?? [1])];

  const leafStarted = performance.now();
  const leafTexture = bakeLeafTexture({
    seed: seeds[0] ?? 1, kind: card.kind, size: Number(card.size), count: card.count,
    leafColor: srgbTriple(String(card.leafColor)), twigColor: srgbTriple(String(card.twigColor)),
  });
  const leafBytes = encodeRgbaPng(leafTexture.size, leafTexture.size, leafTexture.rgba);
  binaryWithMeta(outputs, `${folder}/${stem}_leaf.png`, outputId(recipeId, "tree/leafTexture"), "forge.texture@2", leafBytes, { anisotropy: 4, mipmaps: true }, generated);
  stats.push(`${stem}_leaf.png: ${leafTexture.size} × ${leafTexture.size}, ${leafBytes.length} bytes, ${Math.round(performance.now() - leafStarted)} ms`);

  const familyId = outputId(recipeId, "tree/family");
  const prototypes: JsonObject[] = [];
  seeds.forEach((seed, prototype) => {
    const started = performance.now();
    const result = generateTree({
      seed, habit: data.habit, height: data.height, trunkRadius: data.trunkRadius, taper: data.taper, flare: data.flare,
      crownStart: data.crownStart, irregularity: data.irregularity, levels: data.levels,
      leaves: { perStem: leaves.perStem, size: leaves.size, cards: leaves.cards }, lods,
    });
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
      stats.push(`${name}.glb: wood ${lodStats.wood.triangles}, leaves ${lodStats.leaves?.triangles ?? 0} triangles`);
    });
    stats.push(`seed ${seed}: ${result.stems} stems, ${result.clusters} leaf clusters, ${Math.round(performance.now() - started)} ms`);
    const chain = lodIds.map((mesh, lod) => ({ mesh, screenSize: lod === 0 ? 1 : round(Number(lods[lod]?.screenSize ?? 0.25)) }));
    prototypes.push({ seed, lods: chain, height: round(height) });
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
    });
  });
  documentOutput(outputs, `${folder}/${stem}.plantfamily.json`, {
    schema: "forge.plantFamily/1",
    id: familyId,
    generatorVersion: version,
    prototypes,
    materials: { wood: materials.wood, leaf: materials.leaf },
    collider: data.collision === "none" ? "none" : "trunk",
    response: data.response as JsonObject,
  });
  return outputs;
}
