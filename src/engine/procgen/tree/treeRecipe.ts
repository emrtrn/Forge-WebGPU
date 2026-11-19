import type { JsonObject } from "../../../core/index.ts";
import { generatedOutputId, srgbTriple } from "../recipeOutput.ts";
import { bakeLeafTexture } from "../texture/leafTexture.ts";
import { bakeLeafAtlas } from "./treeCards.ts";
import { recipeTreeStructure } from "./treeGrowth.ts";

/** A blank v4 leaf slot and an explicit reference to its generated material resolve identically. */
export function defaultTreeLeafMaterial(recipeId: string, version: unknown, leaf: unknown) {
  if (version !== 4) return null;
  const id = generatedOutputId(recipeId, "tree/leafMaterial");
  if (leaf != null && leaf !== id) return null;
  return { schema: "forge.material/1", id,
    baseColor: "#ffffff", baseColorTexture: generatedOutputId(recipeId, "tree/leafTexture"),
    roughness: 0.8, alphaMode: "mask", alphaTest: 0.5, side: "double", flipY: true };
}

/** The atlas belongs to the first variant, including when previewing another seed. */
export function treeRecipeAtlas(data: JsonObject, previewTileLimit?: number) {
  const seed = (data.variants as number[])[0] ?? 1;
  const { params, skeleton } = recipeTreeStructure({ ...data, seed });
  if ("error" in skeleton) throw new Error(`seed ${seed}: ${skeleton.error}`);
  const card = (data.leaves as JsonObject).texture as JsonObject;
  const twigColor = srgbTriple(String(card.twigColor));
  const leaf = bakeLeafTexture({
    ...card, seed, size: Math.min(Number(card.size), previewTileLimit ?? Infinity),
    leafColor: srgbTriple(String(card.leafColor)), twigColor,
  });
  return bakeLeafAtlas(params, skeleton, { width: leaf.size, height: leaf.size, rgba: leaf.rgba }, twigColor);
}
