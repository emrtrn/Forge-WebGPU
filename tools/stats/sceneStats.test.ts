import { expect, test } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { loadHlodLevel } from "../world/hlodInput.ts";
import { actor, actorId, encode, fixture, FOLDER, inputOf, level } from "../world/hlodTestKit.ts";
import { formatSceneStats, readModelInfo, sceneStats } from "./sceneStats.ts";

test("forge stats: placements, models, materials, draws and triangles of a level", async () => {
  const source = await fixture();
  source.set(`${FOLDER}/level.json`, encode(level([
    actor(1), actor(2, 20, [3, 4, 3]),
    { ...actor(3, 266), components: { mesh: { type: "forge.staticMesh@2", parent: null, mesh: actor(3).components.mesh.mesh, castShadow: false } } },
    { id: actorId(4), spatiallyLoaded: false, components: { shape: { type: "forge.shape@2", parent: null, primitive: "plane" } } },
    { id: actorId(5), components: { shape: { type: "forge.shape@2", parent: null, primitive: "cube" } } },
  ])));
  const input = await inputOf(source);
  const io = new NodeIO();
  const stats = await sceneStats({
    folder: FOLDER, level: loadHlodLevel(FOLDER, input), cells: 2, input,
    model: (id) => readModelInfo(async (path) => io.readBinary(source.get(path)!), input, id),
    foliageIndex: { types: ["a", "b"], cells: [{ counts: [3, 1] }, { counts: [0, 2] }] },
    hlodIndex: null,
  });
  expect(stats.actors).toEqual({ total: 5, spatial: 4, persistent: 1, cells: 2 });
  expect(stats.components).toEqual({ "forge.shape": 2, "forge.staticMesh": 3 });
  // The fixture cube: 12 triangles, one red opaque single-sided material.
  expect(stats.staticMeshes).toEqual({ placements: 3, uniqueModels: 1, uniqueModelMaterials: 1, sourceTriangles: 36 });
  expect(stats.shapes).toEqual({ placements: 2, byPrimitive: { plane: 1, cube: 1 }, triangles: 14 });
  expect(stats.materials).toEqual({ unique: 1, transparent: 0, doubleSided: 0, transparentDoubleSided: 0 });
  // Two static batches (the shadow switch splits them) of one primitive, two shape batches.
  expect(stats.draws).toEqual({ staticBatches: 2, shapeBatches: 2, drawsPerView: 4, shadowCastingBatches: 3, shadowDrawsPerCascade: 3,
    shadowDrawsByCascade: { high: [3, 3, 2], ultra: [3, 3, 3, 3] } });
  expect(stats.triangles.source).toBe(50);
  expect(stats.foliage).toEqual({ landscapeRules: 0, paintedInstances: 6, paintedTypes: 2 });
  expect(stats.models).toMatchObject([{ path: "content/cube.glb", placements: 3, triangles: 12, placedTriangles: 36, slots: 1, primitives: 1 }]);
  expect(stats.warnings).toEqual([]);
  expect(formatSceneStats(stats)).toContain("draws 4 per view (2 static + 2 shape batches)");
});
