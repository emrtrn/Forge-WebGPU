// A `forge.surfaceTextureRecipe` document baked: the generator's outputs, the
// impostor bake reading them and the editor's preview call the same thing.

import type { JsonObject } from "../../../core/index.ts";
import { srgbTriple } from "../recipeOutput.ts";
import { bakeSurfaceTexture } from "./surfaceTexture.ts";

export function bakeSurfaceRecipe(data: JsonObject): ReturnType<typeof bakeSurfaceTexture> {
  return bakeSurfaceTexture({
    seed: data.seed,
    size: Number(data.size),
    layers: data.layers,
    colorRamp: ((data.colorRamp as JsonObject[] | undefined) ?? []).map((stop) => ({ at: stop.at, color: srgbTriple(String(stop.color)) })),
    normalStrength: data.normalStrength,
    roughness: data.roughness,
    aoStrength: data.aoStrength,
    metalness: data.metalness,
  });
}
