// Material contributions (architecture §4.9, D12): what features add to a
// surface material, as TSL node functions applied in one fixed order instead
// of stacked `onBeforeCompile` patches:
//
//   world mask -> fade (5b) -> wind (5c) -> wetness (5a) -> dent (8)
//
// A material in the resource cache is keyed by its asset and the set of
// contributions it carries (`material:<guid>:<signature>`), so two placements
// that need the same contributions share one material. Phase 3 brings the
// order and the world mask; the others arrive in their phases and take their
// place in `MATERIAL_CONTRIBUTIONS` and `applyContributions`.
//
// World mask (Forge WebGL's worldMaskPatch, rewritten): per-fragment hiding
// driven by a top-down mask texture. A fragment asks what the mask says about
// the ground under it (world X / Z only, clamped to the mask's edge) and is
// discarded under an interleaved-gradient-noise dither when hidden; the shadow
// caster agrees (`maskShadowNode`). Generic: fog of war is one caller. No
// engine system drives one yet.

import { clamp, dot, float, fract, Fn, positionWorld, screenCoordinate, smoothstep, texture, uniform, vec2 } from "three/tsl";
import { Vector2, type NodeMaterial, type Texture, type UniformNode } from "three/webgpu";

export const MATERIAL_CONTRIBUTIONS = ["worldMask", "fade", "wind", "wetness", "dent"] as const;
export type MaterialContribution = (typeof MATERIAL_CONTRIBUTIONS)[number];

/** Live inputs of one world mask, shared by every material it drives. */
export interface WorldMask {
  /** The mask; its green channel is read. */
  readonly texture: Texture;
  /** World width of the square the mask's 0..1 UV covers, centred on the origin. */
  readonly span: UniformNode<"float">;
  /** Below `x` never hides, above `y` always does, dithered between. */
  readonly range: UniformNode<"vec2">;
  /** Global multiplier; 0 disables hiding without a rebuild. */
  readonly strength: UniformNode<"float">;
}

export interface MaterialContributions {
  readonly worldMask?: WorldMask;
}

/** The cache key part of a contribution set: the names in contribution order, or `none`. */
export function contributionSignature(contributions: MaterialContributions): string {
  const present = MATERIAL_CONTRIBUTIONS.filter((name) => (contributions as Record<string, unknown>)[name] !== undefined);
  return present.length === 0 ? "none" : present.join("+");
}

export function createWorldMask(options: { readonly texture: Texture; readonly span: number; readonly rangeLow: number; readonly rangeHigh: number }): WorldMask {
  return {
    texture: options.texture,
    span: uniform(options.span),
    range: uniform(new Vector2(options.rangeLow, options.rangeHigh)),
    strength: uniform(1),
  };
}

/** True where the world mask keeps the fragment (Forge's discard test, inverted for `maskNode`). */
export function worldMaskKeeps(mask: WorldMask) {
  return Fn(() => {
    const at = clamp(vec2(float(0.5).add(positionWorld.x.div(mask.span)), float(0.5).sub(positionWorld.z.div(mask.span))), 0, 1);
    const value = texture(mask.texture, at).g;
    const hidden = smoothstep(mask.range.x, mask.range.y, value).mul(mask.strength);
    // Interleaved gradient noise, static in screen space.
    const dither = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));
    // Strictly greater hides: a strength or mask of exactly zero never discards.
    return hidden.lessThanEqual(dither);
  })();
}

/** Applies the contributions to a material in the fixed order. */
export function applyContributions(material: NodeMaterial, contributions: MaterialContributions): void {
  if (contributions.worldMask) {
    const keeps = worldMaskKeeps(contributions.worldMask);
    material.maskNode = keeps;
    material.maskShadowNode = keeps;
  }
  // fade (5b), wind (5c), wetness (5a), dent (8) follow here, in this order.
}
