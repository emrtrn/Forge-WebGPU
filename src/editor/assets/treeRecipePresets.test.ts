import { describe, expect, test } from "vitest";
import { createSchemaRegistry } from "../../core/index.ts";
import { TreeRecipeAssetType } from "../../features/plant/schema.ts";
import { assetDocumentAdapter } from "./assetDocument.ts";
import { createTreeSpeciesMatch, treeHabitDraft, treeSpeciesDraft, TREE_SPECIES } from "./treeRecipePresets.ts";

const registry = createSchemaRegistry(); registry.registerAssetType(TreeRecipeAssetType);
const id = `ast_${"4".repeat(32)}`, bark = `ast_${"5".repeat(32)}`;
const adapter = assetDocumentAdapter({ id, type: "forge.treeRecipe", file: "content/own.treerecipe.json", name: "own", writable: true }, registry)!;
const normalize = (raw: unknown) => { const result = adapter.normalize(raw); expect(result.issues).toEqual([]); return result.value!; };
const own = normalize({ schema: "forge.treeRecipe/3", id, variants: [7, 9], materials: { wood: bark, leaf: bark } });
const whole = { label: (guid: string) => guid, ofType: () => [] }, bare = { label: () => null, ofType: () => [] };

describe("tree species presets", () => {
  test("every starter species applies whole: the recipe keeps its identity and seeds and matches the species until it is changed", () => {
    const match = createTreeSpeciesMatch(adapter);
    expect([...TREE_SPECIES.keys()]).toEqual(["Birch", "Broadleaf", "Conifer", "Hazel", "Maple", "Oak", "Pine", "Poplar"]);
    for (const [name, species] of TREE_SPECIES) {
      const value = normalize(treeSpeciesDraft(own, name, whole));
      expect(value).toMatchObject({ id, variants: [7, 9], height: species.height, spray: species.spray, response: species.response });
      // Its own sprays are drawn: the starter's leaf material reads the starter's atlas.
      expect(value.materials).toEqual({ wood: (species.materials as { wood: string }).wood, leaf: null });
      expect(match(value)).toBe(name);
      expect(match({ ...value, height: 3.5 })).toBeNull();
      expect(match({ ...value, variants: [1] })).toBe(name);
    }
  });

  test("without the starter's bark in the project the recipe keeps its own; a habit keeps bark and response", () => {
    expect(treeSpeciesDraft(own, "Birch", bare)!.materials).toEqual({ wood: bark, leaf: null });
    expect(treeSpeciesDraft(own, "Nothing", whole)).toBeNull();
    const shrub = treeHabitDraft(own, "shrub", whole)!;
    expect(shrub).toMatchObject({ habit: "shrub", id, variants: [7, 9], response: own.response, materials: { wood: bark, leaf: null } });
    expect(treeHabitDraft(own, "broadleaf", whole)).toBeNull();
  });
});
