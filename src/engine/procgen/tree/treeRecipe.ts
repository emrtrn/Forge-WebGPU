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

export interface TreePrototype {
  readonly seed: number;
  readonly young: boolean;
  /** In its outputs' roles (`tree/<key>/lod0`) and file names: `3`, `3_young`. */
  readonly key: string;
}

export const treePrototypeKey = (seed: number, young: boolean): string => (young ? `${seed}_young` : String(seed));
const seedsOf = (value: unknown): number[] => [...new Set(Array.isArray(value) ? value.filter((seed): seed is number => typeof seed === "number") : [])];

/** A recipe's prototypes in family order: the mature seeds, then the young ones, so a family's indices hold when it gets young trees. */
export function treePrototypes(data: Readonly<Record<string, unknown>>): TreePrototype[] {
  const listed = seedsOf(data.variants), young = data.habit === "shrub" ? [] : seedsOf((data.young as JsonObject | undefined)?.variants);
  return [
    ...(listed.length > 0 ? listed : [1]).map((seed) => ({ seed, young: false, key: treePrototypeKey(seed, false) })),
    ...young.map((seed) => ({ seed, young: true, key: treePrototypeKey(seed, true) })),
  ];
}

/** A young crown has few sprays: a coarse LOD keeps more of them to hold its leaf area. */
const YOUNG_LEAF_GAIN = 1.6;
/** A young tree's impostor: half the frames' pixels, shown from half the size on. */
const YOUNG_IMPOSTOR = 0.5;

/** The recipe one prototype is generated from (`generateTree`). */
export function treePrototypeRecipe(data: JsonObject, { seed, young }: Pick<TreePrototype, "seed" | "young">): JsonObject {
  if (!young) return { ...data, seed };
  const growth = data.growth as JsonObject, share = (data.young as JsonObject).age as number, impostor = data.impostor as JsonObject | undefined;
  return {
    ...data, seed,
    growth: { ...growth, age: (growth.age as number) * share },
    lods: (data.lods as JsonObject[]).map((lod, index) => (index === 0 ? lod : { ...lod, leafFraction: Math.min(1, (lod.leafFraction as number) * YOUNG_LEAF_GAIN) })),
    ...(impostor ? { impostor: { ...impostor, frameSize: String(Math.max(64, Number(impostor.frameSize) * YOUNG_IMPOSTOR)), screenSize: (impostor.screenSize as number) * YOUNG_IMPOSTOR } } : {}),
  };
}

/** The atlas belongs to the first variant, including when previewing another seed. */
export function treeRecipeAtlas(data: JsonObject, previewTileLimit?: number): SprayAtlas {
  return bakeSprayAtlas(normalizeCrownParams(data).spray, (data.variants as number[])[0] ?? 1, previewTileLimit);
}
