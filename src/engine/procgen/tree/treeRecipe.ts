import type { JsonObject } from "../../../core/index.ts";
import { generatedOutputId, srgbTriple } from "../recipeOutput.ts";
import { bakeLeafTexture } from "../texture/leafTexture.ts";
import { bakeSprayAtlas, SPRAY_CUT } from "../texture/sprayTexture.ts";
import { CROWN_GENERATOR_VERSION, normalizeCrownParams } from "./crown/crownParams.ts";
import { bakeLeafAtlas } from "./treeCards.ts";
import { recipeTreeStructure } from "./treeGrowth.ts";
import type { LeafAtlas } from "./treeMesh.ts";

/** A blank modern leaf slot and an explicit reference to its generated material resolve identically. */
export function defaultTreeLeafMaterial(recipeId: string, version: unknown, leaf: unknown) {
  if (version !== 4 && version !== 5 && version !== CROWN_GENERATOR_VERSION) return null;
  const id = generatedOutputId(recipeId, "tree/leafMaterial");
  if (leaf != null && leaf !== id) return null;
  return { schema: "forge.material/1", id,
    baseColor: "#ffffff", baseColorTexture: generatedOutputId(recipeId, "tree/leafTexture"),
    ...(version === CROWN_GENERATOR_VERSION
      ? { normalTexture: generatedOutputId(recipeId, "tree/leafNormal"), roughness: 1, alphaTest: SPRAY_CUT }
      : { roughness: 0.8, alphaTest: 0.5 }),
    alphaMode: "mask", side: "double", flipY: true };
}

/** What a recipe's leaf material samples. */
export interface RecipeAtlas {
  readonly size: number;
  readonly rgba: Uint8Array;
  /** Generator version 6: the sprays' tangent-space normals. */
  readonly normal?: Uint8Array;
  readonly atlas: LeafAtlas;
}

/** The atlas belongs to the first variant, including when previewing another seed. */
export function treeRecipeAtlas(data: JsonObject, previewTileLimit?: number): RecipeAtlas {
  const seed = (data.variants as number[])[0] ?? 1;
  if (data.generatorVersion === CROWN_GENERATOR_VERSION) {
    return { ...bakeSprayAtlas(normalizeCrownParams(data).spray, seed, previewTileLimit), atlas: { leaf: [0, 0, 1, 1], clusters: [] } };
  }
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
