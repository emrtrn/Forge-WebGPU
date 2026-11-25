// `generated` models (vegetation plan §7.2, PG5; user decisions 2026-11-25): a
// brief's model row or a cover's plant names a recipe (tree, shrub, grass,
// rock), and the build takes what the recipe generated: a rock's models as
// static meshes, a plant's family as `forge.plant` actors or its Foliage Types
// as rules. Its published prototypes share the placements. A recipe without
// output, or one the user rejected on a family sheet, gives the placeholder
// (no rule); one listed but not approved is used and reported.

import type { AssetId, AssetIndex } from "../../core/index.ts";
import { stableHex } from "../forgeImport/ids.ts";
import { plantAssetId } from "../forgeImport/placements.ts";
import { recipeState, type SheetEntry, type SheetState } from "../plant/familySheet.ts";
import { builtRecipe } from "../procgen/recipeOutputs.ts";

export interface GeneratedSource {
  readonly recipe: AssetId;
  readonly name: string;
  readonly state: "built" | "missing" | "rejected";
  /** The user's answer; null when the project has no family sheet. */
  readonly approval: SheetState | null;
  /** Placement asset ids, one per prototype: models, or `plant:` ids. Empty unless built. */
  readonly placements: readonly string[];
  /** One per prototype. Empty unless built. */
  readonly foliageTypes: readonly AssetId[];
}

export type GeneratedSources = (recipe: AssetId) => GeneratedSource | null;

/**
 * The recipes of an index as the build reads them; null for a GUID that is no model recipe. `sheets`: the
 * entries of every family sheet of the project.
 */
export function generatedSources(index: Pick<AssetIndex, "entries" | "jsonAssets" | "metas">, sheets: readonly (readonly SheetEntry[])[]): GeneratedSources {
  const read = new Map<AssetId, GeneratedSource | null>();
  return (recipe) => {
    const known = read.get(recipe);
    if (known !== undefined) return known;
    const built = builtRecipe(index, recipe);
    let source: GeneratedSource | null = null;
    if (built) {
      const path = index.entries.get(recipe)!.path;
      // With a page in the project a recipe it does not list waits for an answer too.
      const approval = sheets.length > 0 ? recipeState(sheets, recipe, built.digest) ?? "pending" : null;
      const state = approval === "rejected" ? "rejected" : built.built ? "built" : "missing";
      const prototypes = state === "built" ? built.prototypes : [];
      const { family } = built.outputs;
      source = {
        recipe, name: path.slice(path.lastIndexOf("/") + 1).split(".")[0]!, state, approval,
        placements: prototypes.map((prototype) => (family === null ? prototype.mesh : plantAssetId(family, prototype.index))),
        foliageTypes: prototypes.map((prototype) => prototype.foliageType),
      };
    }
    read.set(recipe, source);
    return source;
  };
}

/** 0..1 from an id: which of several models a placement without a pick of its own takes. */
export const stablePick = (id: string): number => Number.parseInt(stableHex(`pick/${id}`).slice(0, 8), 16) / 4294967296;
