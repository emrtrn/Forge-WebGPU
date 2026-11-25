import type { JsonObject } from "../../../core/index.ts";
import { generatedOutputId } from "../recipeOutput.ts";
import { bakeSprayAtlas, SPRAY_CUT, type SprayAtlas } from "../texture/sprayTexture.ts";
import { normalizeCrownParams } from "./crown/crownParams.ts";

/** A blank leaf slot and an explicit reference to its generated material resolve identically. */
export function defaultTreeLeafMaterial(recipeId: string, leaf: unknown) {
  const id = generatedOutputId(recipeId, "tree/leafMaterial");
  if (leaf != null && leaf !== id) return null;
  return { schema: "forge.material/1", id,
    baseColor: "#ffffff", baseColorTexture: generatedOutputId(recipeId, "tree/leafTexture"),
    normalTexture: generatedOutputId(recipeId, "tree/leafNormal"), roughness: 1, alphaTest: SPRAY_CUT,
    alphaMode: "mask", side: "double", flipY: true };
}

/** The atlas belongs to the first variant, including when previewing another seed. */
export function treeRecipeAtlas(data: JsonObject, previewTileLimit?: number): SprayAtlas {
  return bakeSprayAtlas(normalizeCrownParams(data).spray, (data.variants as number[])[0] ?? 1, previewTileLimit);
}
