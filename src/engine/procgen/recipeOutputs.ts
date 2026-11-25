// What a model recipe (tree, shrub, grass, rock) writes, from its document
// alone: the generators' output GUIDs derive from the recipe's GUID and the
// output's role (tools/procgen/), so World Builder, the approval page and the
// editor find a recipe's family, models and foliage types without a list of
// them (vegetation plan PG5, user decision 2026-11-25: a `generated` row names
// the recipe).

import { isJsonObject, type AssetId, type AssetIndex, type JsonObject } from "../../core/index.ts";
import { stableHex } from "../forgeImport/ids.ts";
import { generatedOutputId } from "./recipeOutput.ts";
import { treePrototypeKey, treePrototypes } from "./tree/treeRecipe.ts";

export const PLANT_RECIPE_TYPES = ["forge.treeRecipe", "forge.grassRecipe"] as const;
export const MODEL_RECIPE_TYPES = [...PLANT_RECIPE_TYPES, "forge.rockRecipe"] as const;
export type RecipeGenerator = "tree" | "grass" | "rock";

const GENERATORS: Readonly<Record<string, RecipeGenerator>> = { "forge.treeRecipe": "tree", "forge.grassRecipe": "grass", "forge.rockRecipe": "rock" };

export function recipeGenerator(type: string): RecipeGenerator | null {
  return Object.hasOwn(GENERATORS, type) ? GENERATORS[type]! : null;
}

export interface RecipePrototype {
  readonly seed: number;
  /** A tree recipe's young tree: after the mature prototypes. */
  readonly young: boolean;
  /** LOD 0's model. */
  readonly mesh: AssetId;
  readonly foliageType: AssetId;
}

export interface RecipeOutputs {
  readonly recipe: AssetId;
  readonly generator: RecipeGenerator;
  /** The plant family; null for rocks. */
  readonly family: AssetId | null;
  /** In recipe order; a repeated seed counts once. */
  readonly prototypes: readonly RecipePrototype[];
}

const outputId = (recipe: string, role: string): AssetId => generatedOutputId(recipe, role) as AssetId;

function prototypeOf(recipe: string, generator: RecipeGenerator, seed: number, young = false): RecipePrototype {
  const key = treePrototypeKey(seed, young);
  return { seed, young, mesh: outputId(recipe, `${generator}/${key}/lod0`), foliageType: outputId(recipe, `${generator}/${key}/foliageType`) };
}

/** Null when `type` is not a model recipe. */
export function recipeOutputs(recipe: AssetId, type: string, document: Readonly<Record<string, unknown>>): RecipeOutputs | null {
  const generator = recipeGenerator(type);
  if (!generator) return null;
  const listed = Array.isArray(document.variants) ? document.variants.filter((seed): seed is number => typeof seed === "number") : [];
  const seeds = generator === "tree" ? treePrototypes(document) : [...new Set(listed.length > 0 ? listed : [1])].map((seed) => ({ seed, young: false }));
  return {
    recipe, generator,
    family: generator === "rock" ? null : outputId(recipe, `${generator}/family`),
    prototypes: seeds.map(({ seed, young }) => prototypeOf(recipe, generator, seed, young)),
  };
}

export interface BuiltPrototype extends RecipePrototype {
  /** The family's prototype index (rocks: the position in the list). */
  readonly index: number;
}

/** A recipe with the output it has now. */
export interface BuiltRecipe {
  readonly outputs: RecipeOutputs;
  /** The family (plants) and at least one prototype are there. */
  readonly built: boolean;
  /** The published prototypes, the family's own order for plants. */
  readonly prototypes: readonly BuiltPrototype[];
  /** Digest of the published output; null when nothing is built. */
  readonly digest: string | null;
}

/** JSON with every object's keys sorted: the digest must not depend on how a document was written. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isJsonObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

type Index = Pick<AssetIndex, "entries" | "jsonAssets" | "metas">;

/** Null when the index has no model recipe of this GUID. */
export function builtRecipe(index: Index, recipe: AssetId): BuiltRecipe | null {
  const entry = index.entries.get(recipe);
  const document = index.jsonAssets.get(recipe) as JsonObject | undefined;
  const outputs = entry && document ? recipeOutputs(recipe, entry.type, document) : null;
  if (!outputs) return null;

  const family = outputs.family === null ? null : (index.jsonAssets.get(outputs.family) as JsonObject | undefined) ?? null;
  const published = outputs.family === null
    ? outputs.prototypes
    : (Array.isArray(family?.prototypes) ? (family.prototypes as unknown[]) : []).map((prototype) =>
      prototypeOf(recipe, outputs.generator, isJsonObject(prototype) && typeof prototype.seed === "number" ? prototype.seed : NaN, isJsonObject(prototype) && prototype.young === true));
  const prototypes = published
    .map((prototype, position) => ({ ...prototype, index: position }))
    .filter((prototype) => index.entries.has(prototype.mesh) && index.entries.has(prototype.foliageType));
  const built = prototypes.length > 0;
  if (!built) return { outputs, built, prototypes, digest: null };

  const parts: string[] = [];
  for (const [id, meta] of index.metas) if (meta.generated?.recipe === recipe) parts.push(`${id}:${meta.generated.contentHash}`);
  parts.sort();
  if (family) parts.push(canonicalJson(family));
  return { outputs, built, prototypes, digest: stableHex(parts.join("\n")) };
}
