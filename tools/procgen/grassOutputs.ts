import type { JsonObject } from "../../src/core/index.ts";
import { writeGlb } from "../../src/engine/procgen/glb.ts";
import { generateGrass } from "../../src/engine/procgen/grass.ts";
import { meshBounds } from "../../src/engine/procgen/mesh.ts";
import type { GrassRecipeData } from "../../src/features/plant/schema.ts";
import { binaryWithMeta, documentOutput, GENERATED_MODEL_OPTIMIZE, GENERATOR_VERSIONS, outputId, round, type Output } from "./outputs.ts";

export function grassOutputs(recipeId: string, data: GrassRecipeData, folder: string, stem: string, stats: string[]): Output[] {
  const outputs: Output[] = [];
  const version = GENERATOR_VERSIONS.grass;
  const generated = { recipe: recipeId, generator: "grass", generatorVersion: version };
  const family = outputId(recipeId, "grass/family");
  const prototypes: JsonObject[] = [];
  const seeds = [...new Set(data.variants)];
  if (seeds.length === 0) throw new Error("A grass recipe needs at least one seed.");
  if (!seeds.every(Number.isInteger)) throw new Error("Grass seeds must be whole numbers.");
  const sway = { amplitude: round(data.height * 0.38), frequency: 0.72 };
  for (const [prototype, seed] of seeds.entries()) {
    const meshes = generateGrass(data, seed);
    const bounds = meshBounds(meshes[0].mesh);
    const height = round(bounds.max[1]);
    const lods = meshes.map(({ mesh, wind }, lod) => {
      const id = outputId(recipeId, `grass/${seed}/lod${lod}`);
      const name = `${stem}_${seed}_lod${lod}`;
      const bytes = writeGlb({
        nodes: [{ name, primitives: [{ mesh, material: 0, attributes: { _WIND: { data: wind, size: 4 } } }],
          extras: { forgeGenerated: { recipe: recipeId, seed, lod } } }],
        materials: [{ name: "Grass", baseColor: [1, 1, 1, 1], roughness: 0.88, doubleSided: true }],
        generator: `Forge procgen grass ${version}`,
      });
      binaryWithMeta(outputs, `${folder}/${name}.glb`, id, "forge.model@2", bytes, {
        optimize: GENERATED_MODEL_OPTIMIZE, collision: { convex: [] },
      }, generated);
      stats.push(`${name}.glb: ${mesh.positions.length / 3} vertices, ${mesh.indices.length / 3} triangles`);
      return { mesh: id, screenSize: lod === 0 ? 1 : 0.023 };
    });
    prototypes.push({ seed, height, lods });
    documentOutput(outputs, `${folder}/${stem}_${seed}.foliagetype.json`, {
      schema: "forge.foliageType/1", id: outputId(recipeId, `grass/${seed}/foliageType`),
      family, prototype, mesh: lods[0]!.mesh, lods: lods.slice(1),
      radius: round(Math.max(data.width, data.height * 0.37)),
      scaleMin: 0.8, scaleMax: 1.22, alignToNormal: false, castShadow: false, collision: false,
      cullStart: 46, cullEnd: 70, fadeSpread: 30,
      sway: { ...sway, enabled: true, source: "vertex", height },
    });
  }
  documentOutput(outputs, `${folder}/${stem}.plantfamily.json`, {
    schema: "forge.plantFamily/1", id: family, generatorVersion: version, prototypes,
    collider: "none", sway, response: { habit: "evergreen" },
  });
  return outputs;
}
