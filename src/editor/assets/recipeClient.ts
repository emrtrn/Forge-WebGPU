// A model recipe's output and connections, as the dev server's index has them
// (engine/procgen/recipeLinks.ts).

import { FORGE_REQUEST_HEADER } from "../../core/index.ts";
import type { RecipeLinks } from "../../engine/procgen/recipeLinks.ts";

export async function fetchRecipeLinks(recipe: string): Promise<RecipeLinks> {
  const response = await fetch(`/__forge/recipe-links?id=${encodeURIComponent(recipe)}`, { headers: { [FORGE_REQUEST_HEADER]: "1" } });
  const body = await response.json() as RecipeLinks & { message?: string };
  if (!response.ok) throw new Error(body.message ?? "The recipe cannot be read.");
  return body;
}
