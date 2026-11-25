// How a tree's materials look to its impostor bake: `forge generate` (a
// material read in Node) and the recipe's preview (in its worker) bake with
// the same surfaces.

import type { JsonObject } from "../../../core/index.ts";
import type { BakeTexture } from "../bake/rasterizer.ts";
import { srgbTriple } from "../recipeOutput.ts";
import type { TreeImpostorSurface } from "./treeImpostor.ts";

export interface MaterialLook {
  /** sRGB 0..1 base colour. */
  readonly color: readonly [number, number, number];
  /** Its decoded base colour texture; "leafAtlas" when it is this recipe's own leaf texture. */
  readonly texture: BakeTexture | "leafAtlas" | null;
  readonly tiling: readonly [number, number];
  readonly flipY: boolean;
  readonly alphaTest: number;
}

/** A `forge.material` document's look, its base colour texture given. */
export function materialLookOf(doc: JsonObject, texture: MaterialLook["texture"]): MaterialLook {
  const tiling = Array.isArray(doc.uvTiling) ? doc.uvTiling as [number, number] : [1, 1] as const;
  return {
    color: srgbTriple(typeof doc.baseColor === "string" ? doc.baseColor : "#ffffff"),
    texture, tiling: [tiling[0], tiling[1]], flipY: doc.flipY !== false,
    alphaTest: doc.alphaMode === "mask" && typeof doc.alphaTest === "number" ? doc.alphaTest : 0,
  };
}

export interface TreeLooks { readonly wood: MaterialLook | null; readonly leaf: MaterialLook | null }

export function treeImpostorSurfaces(looks: TreeLooks, atlas: { readonly size: number; readonly rgba: Uint8Array }, recipe: JsonObject): { wood: TreeImpostorSurface; leaf: TreeImpostorSurface } {
  const surfaceOf = (look: MaterialLook | null, fallback: readonly [number, number, number], alphaTest: number): TreeImpostorSurface => ({
    color: look?.color ?? fallback,
    texture: look?.texture === "leafAtlas" ? { width: atlas.size, height: atlas.size, rgba: atlas.rgba } : look?.texture ?? null,
    tiling: look?.tiling ?? [1, 1],
    flipY: look?.flipY ?? true,
    alphaTest: look ? look.alphaTest : alphaTest,
  });
  return {
    wood: { ...surfaceOf(looks.wood, [0.35, 0.27, 0.2], 0), twigTint: srgbTriple(String((recipe.bark as JsonObject | undefined)?.twigTint ?? "#ffffff")) },
    // Without a leaf material the GLB's own "Leaf" colour over the atlas, as the model draws.
    leaf: surfaceOf(looks.leaf ?? { color: [1, 1, 1], texture: "leafAtlas", tiling: [1, 1], flipY: true, alphaTest: 0.5 }, [1, 1, 1], 0.5),
  };
}
