import assert from "node:assert";
import { test } from "vitest";
import { normalizeJsonAsset, type JsonObject } from "../../core/index.ts";
import { TreeRecipeAssetType, type TreeRecipeData } from "./schema.ts";

const read = (document: JsonObject): TreeRecipeData => {
  const result = normalizeJsonAsset(TreeRecipeAssetType, document, { strict: true });
  assert.deepStrictEqual(result.issues, []);
  return result.value as unknown as TreeRecipeData;
};
const ID = "ast_00000000000000000000000000000abc", WOOD = "ast_00000000000000000000000000000001";

test("a recipe of a removed generator opens as the crown generator's: what it is stays, how it was built goes", () => {
  const old = {
    id: ID, variants: [4, 9], height: 17, trunkRadius: 0.4, crownStart: 0.3, levels: [{ count: 9 }],
    leaves: { perStem: 6, texture: { kind: "broad", leafColor: "#123456" } },
    lods: [{ radialSegments: 10, ringsPerMeter: 2, minRadius: 0, leafFraction: 1, leafCards: "clusters", screenSize: 0.5 }],
    impostor: { enabled: false, screenSize: 0.03 }, materials: { wood: WOOD, leaf: null },
  } as JsonObject;
  const growth = { age: 20, matureAge: 80, width: 1.1, widestPoint: 0.4, fullness: 0.9, leaderDominance: 0.2 };
  for (const schema of ["forge.treeRecipe/1", "forge.treeRecipe/2"]) {
    const first = read({ schema, ...old, generatorVersion: 1, growth });
    assert.equal(first.generatorVersion, 6);
    assert.deepStrictEqual([first.variants, first.height, first.trunkRadius, first.crownStart], [[4, 9], 17, 0.4, 0.3]);
    assert.equal(first.spray.leafColor, "#123456");
    assert.equal(first.materials.wood, WOOD);
    assert.deepStrictEqual([first.impostor.enabled, first.impostor.screenSize], [false, 0.08]);
    assert.equal(first.lods.length, 3);
    assert.equal(first.growth.age, 60, "only generator 4 read the growth group");
  }
  assert.deepStrictEqual(read({ schema: "forge.treeRecipe/2", ...old, generatorVersion: 4, growth }).growth, { ...growth, clumping: 0.5, droop: 0 });
  const conifer = read({ schema: "forge.treeRecipe/2", ...old, generatorVersion: 1, habit: "conifer" });
  assert.deepStrictEqual([conifer.habit, conifer.spray.leafShape], ["conifer", "needle"]);
  // Early shrub recipes kept the default habit.
  assert.equal(read({ schema: "forge.treeRecipe/2", ...old, generatorVersion: 5 }).habit, "shrub");
});

test("a crown recipe saved before the change keeps its LODs", () => {
  const lod = { radialSegments: 9, ringsPerMeter: 2, minRadius: 0.01, leafFraction: 0.5, screenSize: 0.3 };
  const kept = read({ schema: "forge.treeRecipe/2", id: ID, generatorVersion: 6, levels: [], leaves: {}, lods: [{ ...lod, leafCards: "leaves" }], growth: { width: 0.5 } });
  assert.deepStrictEqual(kept.lods, [lod]);
  assert.equal(kept.growth.width, 0.5);
});
