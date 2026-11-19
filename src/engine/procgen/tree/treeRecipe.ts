import type { JsonObject } from "../../../core/index.ts";
import { srgbTriple } from "../recipeOutput.ts";
import { bakeLeafTexture } from "../texture/leafTexture.ts";
import { bakeLeafAtlas } from "./treeCards.ts";
import { normalizeTreeParams } from "./treeParams.ts";
import { buildTreeSkeleton } from "./treeSkeleton.ts";

/** The atlas belongs to the first variant, including when previewing another seed. */
export function treeRecipeAtlas(data: JsonObject, previewTileLimit?: number) {
  const seed = (data.variants as number[])[0] ?? 1;
  const params = normalizeTreeParams({ ...data, seed });
  const skeleton = buildTreeSkeleton(params);
  if ("error" in skeleton) throw new Error(`seed ${seed}: ${skeleton.error}`);
  const card = (data.leaves as JsonObject).texture as JsonObject;
  const twigColor = srgbTriple(String(card.twigColor));
  const leaf = bakeLeafTexture({
    ...card, seed, size: Math.min(Number(card.size), previewTileLimit ?? Infinity),
    leafColor: srgbTriple(String(card.leafColor)), twigColor,
  });
  return bakeLeafAtlas(params, skeleton, { width: leaf.size, height: leaf.size, rgba: leaf.rgba }, twigColor);
}
