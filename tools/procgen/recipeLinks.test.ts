// The links of real recipes: the starter pack's, through its asset index.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildAssetIndex, type AssetId } from "../../src/core/index.ts";
import { recipeLinks } from "../../src/engine/procgen/recipeLinks.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { scanRoots } from "../assets/scan.ts";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const BROADLEAF = "ast_1cc830feab66656728f8bf965079b68a" as AssetId;

describe("recipe links", async () => {
  const registry = await loadEngineRegistry(REPO);
  const roots = ["starter", "worldbuilder"].map((pack) => ({ label: `engine:content/packs/${pack}`, dir: join(REPO, "content/packs", pack) }));
  const index = buildAssetIndex((await scanRoots(roots)).files, { strict: true, registry });
  const idOf = (path: string): AssetId => [...index.entries.values()].find((entry) => `${entry.root}/${entry.path}`.endsWith(path))!.id as AssetId;

  test("a generated tree: its materials, the bark recipe behind them, its family and foliage types, the covers that grow it", () => {
    const links = recipeLinks(index, BROADLEAF)!;
    expect(links.built).toBe(true);
    expect(links.digest).toMatch(/^[0-9a-f]{32}$/);
    expect(links.prototypes.map((prototype) => prototype.index)).toEqual([0, 1, 2, 3, 4]);
    expect(links.prototypes.map((prototype) => prototype.young)).toEqual([false, false, false, true, true]);
    expect(links.uses.map((link) => link.name)).toEqual(expect.arrayContaining(["M_Bark", "M_Leaf", "Bark"]));
    expect(links.outputs.filter((link) => link.type === "forge.foliageType")).toHaveLength(5);
    expect(links.outputs.map((link) => link.id)).toContain(links.family);
    expect(links.usedBy.some((link) => link.type === "forge.groundCover")).toBe(true);
    expect(links.notes).toEqual([]);
  });

  test("a recipe without output, and one whose leaf material reads another recipe's atlas", () => {
    expect(recipeLinks(index, idOf("trees/M_Bark.material.json"))).toBeNull();

    const copy = `ast_${"c".repeat(32)}` as AssetId;
    const entry = index.entries.get(BROADLEAF)!;
    const copied = {
      ...index,
      entries: new Map([...index.entries, [copy, { ...entry, id: copy, path: "copy.treerecipe.json" }]]),
      jsonAssets: new Map([...index.jsonAssets, [copy, { ...index.jsonAssets.get(BROADLEAF)!, id: copy }]]),
      references: [...index.references, ...index.references.filter((reference) => reference.from === BROADLEAF).map((reference) => ({ ...reference, from: copy }))],
    };
    const links = recipeLinks(copied, copy)!;
    expect([links.built, links.digest, links.prototypes]).toEqual([false, null, []]);
    expect(links.notes).toEqual(["M_Leaf reads the leaf atlas of Broadleaf: this recipe's leaf texture does not change it."]);
  });
});
