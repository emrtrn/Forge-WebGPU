// What a model recipe is connected to (vegetation plan PG5, user decision
// 2026-11-25: the links are shown; a `linked` recipe field comes with its
// first generator, PG6): the assets it uses and the recipes behind their
// textures, what it generated, who uses it or its output, and the ownership
// surprises worth a line (a copied recipe whose leaf material still reads the
// original's atlas). Pure over the asset index; the dev server answers with it.

import { fileLabel, isJsonObject, type AssetId, type AssetIndex, type JsonObject } from "../../core/index.ts";
import { builtRecipe, type BuiltPrototype, type RecipeGenerator } from "./recipeOutputs.ts";
import { generatedOutputId } from "./recipeOutput.ts";

export interface RecipeLink {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  /** `<root>/<path>`. */
  readonly file: string;
}

export interface RecipeLinks {
  /** The recipe itself. */
  readonly recipe: RecipeLink;
  readonly generator: RecipeGenerator;
  readonly built: boolean;
  readonly digest: string | null;
  readonly family: string | null;
  readonly prototypes: readonly BuiltPrototype[];
  readonly uses: readonly RecipeLink[];
  readonly outputs: readonly RecipeLink[];
  readonly usedBy: readonly RecipeLink[];
  readonly notes: readonly string[];
}

/** An asset's display name: its file's name up to the first dot. */
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1).split(".")[0] ?? path;

/** The recipe a plant family was generated from (its models' record), when it is there. */
function recipeOfFamily(index: AssetIndex, family: AssetId): AssetId | null {
  const document = index.jsonAssets.get(family) as JsonObject | undefined;
  for (const reference of index.references) {
    if (reference.from !== family) continue;
    const owner = index.metas.get(reference.target)?.generated?.recipe;
    if (owner && document && index.jsonAssets.has(owner)) return owner as AssetId;
  }
  return null;
}

/** `id`: a model recipe, or a generated plant family (its recipe's links). */
export function recipeLinks(index: AssetIndex, id: AssetId): RecipeLinks | null {
  const recipe = index.entries.get(id)?.type === "forge.plantFamily" ? recipeOfFamily(index, id) : id;
  if (recipe === null) return null;
  const built = builtRecipe(index, recipe);
  if (!built) return null;
  const link = (id: string): RecipeLink[] => {
    const entry = index.entries.get(id);
    return entry ? [{ id, type: entry.type, name: nameOf(entry.path), file: fileLabel(entry.root, entry.path) }] : [];
  };
  const links = (ids: Iterable<string>): RecipeLink[] => [...new Set(ids)].flatMap(link).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const ownerOf = (id: string): string | null => index.metas.get(id)?.generated?.recipe ?? null;

  const { outputs } = built;
  const owned = new Set<string>();
  for (const [id, meta] of index.metas) if (meta.generated?.recipe === recipe) owned.add(id);
  for (const id of [outputs.family, generatedOutputId(recipe, "tree/leafMaterial"), ...outputs.prototypes.map((p) => p.foliageType), ...built.prototypes.map((p) => p.foliageType)]) {
    if (id !== null && index.entries.has(id)) owned.add(id);
  }

  const notes: string[] = [];
  const uses = new Set<string>();
  for (const reference of index.references) {
    if (reference.from !== recipe || owned.has(reference.target)) continue;
    uses.add(reference.target);
    const document = index.jsonAssets.get(reference.target) as JsonObject | undefined;
    if (!isJsonObject(document)) continue;
    for (const textures of index.references) {
      if (textures.from !== reference.target) continue;
      const owner = ownerOf(textures.target);
      if (owner === null || owner === recipe || !index.entries.has(owner)) continue;
      uses.add(owner);
      if (index.entries.get(owner)!.type === "forge.treeRecipe" && outputs.generator === "tree") {
        const note = `${nameOf(index.entries.get(reference.target)!.path)} reads the leaf atlas of ${nameOf(index.entries.get(owner)!.path)}: this recipe's leaf texture does not change it.`;
        if (!notes.includes(note)) notes.push(note);
      }
    }
  }
  const usedBy = new Set<string>();
  for (const id of [recipe, ...owned]) {
    for (const reference of index.referrersOf(id)) if (reference.from !== recipe && !owned.has(reference.from)) usedBy.add(reference.from);
  }
  // The models and textures are many; the assets a person opens are the documents.
  const documents = [...owned].filter((id) => index.entries.get(id)?.storage === "document" || index.jsonAssets.has(id));
  return {
    recipe: link(recipe)[0]!, generator: outputs.generator, built: built.built, digest: built.digest, family: outputs.family, prototypes: built.prototypes,
    uses: links(uses), outputs: links(documents), usedBy: links(usedBy), notes,
  };
}
