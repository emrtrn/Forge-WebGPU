import assert from "node:assert/strict";
import { test } from "vitest";
import type { AssetId } from "../../core/index.ts";
import { generatedOutputId } from "./recipeOutput.ts";
import { builtRecipe, recipeOutputs } from "./recipeOutputs.ts";

const RECIPE = `ast_${"1".repeat(32)}` as AssetId;
const id = (role: string) => generatedOutputId(RECIPE, role);

type Index = Parameters<typeof builtRecipe>[0];
function indexOf(type: string, document: object, outputs: { entries?: readonly string[]; metas?: Readonly<Record<string, string>>; family?: object }): Index {
  return {
    entries: new Map([RECIPE, ...(outputs.entries ?? [])].map((asset) => [asset, { id: asset, type: asset === RECIPE ? type : "any" }])),
    metas: new Map(Object.entries(outputs.metas ?? {}).map(([asset, contentHash]) => [asset, { generated: { recipe: RECIPE, contentHash } }])),
    jsonAssets: new Map<string, unknown>([[RECIPE, document], ...(outputs.family ? [[id("tree/family"), outputs.family] as const] : [])]),
  } as unknown as Index;
}

test("a recipe's outputs derive from its GUID and seeds", () => {
  const rock = recipeOutputs(RECIPE, "forge.rockRecipe", { variants: [3, 1, 3] })!;
  assert.equal(rock.family, null);
  assert.deepEqual(rock.prototypes.map((p) => p.seed), [3, 1]);
  assert.equal(rock.prototypes[0]!.mesh, id("rock/3/lod0"));
  const grass = recipeOutputs(RECIPE, "forge.grassRecipe", {})!;
  assert.equal(grass.family, id("grass/family"));
  assert.equal(grass.prototypes[0]!.foliageType, id("grass/1/foliageType"));
  assert.equal(recipeOutputs(RECIPE, "forge.surfaceTextureRecipe", {}), null);
});

test("a plant's published prototypes follow its family, not the recipe's draft", () => {
  const family = { prototypes: [{ seed: 7 }, { seed: 2 }] };
  const index = indexOf("forge.treeRecipe", { variants: [2, 9] }, {
    entries: [id("tree/7/lod0"), id("tree/7/foliageType"), id("tree/2/lod0"), id("tree/2/foliageType"), id("tree/9/lod0")], family,
  });
  const built = builtRecipe(index, RECIPE)!;
  assert.equal(built.built, true);
  assert.deepEqual(built.prototypes.map((p) => [p.seed, p.index]), [[7, 0], [2, 1]]);
  // A prototype without its foliage type keeps the others' indices.
  const partial = builtRecipe(indexOf("forge.treeRecipe", {}, { entries: [id("tree/2/lod0"), id("tree/2/foliageType")], family }), RECIPE)!;
  assert.deepEqual(partial.prototypes.map((p) => [p.seed, p.index]), [[2, 1]]);
});

test("nothing built has no digest; the digest follows the output's content, not its order", () => {
  const entries = [id("rock/1/lod0"), id("rock/1/foliageType")];
  const none = builtRecipe(indexOf("forge.rockRecipe", {}, {}), RECIPE)!;
  assert.deepEqual([none.built, none.digest], [false, null]);
  const digest = (metas: Record<string, string>) => builtRecipe(indexOf("forge.rockRecipe", {}, { entries, metas }), RECIPE)!.digest;
  assert.equal(digest({ a: "1", b: "2" }), digest({ b: "2", a: "1" }));
  assert.notEqual(digest({ a: "1", b: "2" }), digest({ a: "1", b: "3" }));
  assert.notEqual(digest({ a: "1" }), digest({ a: "1", b: "2" }));
  const tree = [id("tree/1/lod0"), id("tree/1/foliageType")];
  const response = (family: object) => builtRecipe(indexOf("forge.treeRecipe", {}, { entries: tree, family }), RECIPE)!.digest;
  assert.equal(response({ prototypes: [{ seed: 1 }], response: { a: 1, b: 2 } }), response({ response: { b: 2, a: 1 }, prototypes: [{ seed: 1 }] }));
  assert.notEqual(response({ prototypes: [{ seed: 1 }], response: { a: 1 } }), response({ prototypes: [{ seed: 1 }], response: { a: 2 } }));
  assert.equal(builtRecipe(indexOf("forge.material", {}, {}), RECIPE), null);
});
