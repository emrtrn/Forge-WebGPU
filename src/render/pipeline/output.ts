// The frame's output transform (plan phase 3 step 6, architecture §4.9):
// which tone mapper and exposure present the frame, and how bright the sky
// dome is drawn against the scene. Three-free, so it is tested in Node.
//
// Forge WebGL's rule (`applySkyToneMapping`, then `applyPostProcessToneMapping`
// over it, then the World Environment's exposure multiplier):
// - a level without a sky and without a Post Process: no tone mapping;
// - a sky: ACES at the sky's exposure x 0.2;
// - a Post Process: its tone mapper at its exposure x 0.2, whatever the sky
//   set (the Post Process manages the scene's exposure);
// - the World Environment multiplies the exposure (night).
// With a Post Process Forge also drew the sky at the product of both
// exposures, but only without an effect pass (its composer ignored that
// local exposure, which is how L03 and Derekavak look in Forge). Here the sky
// dome is drawn at the sky's authored exposure relative to the scene (no
// second x 0.2): a level whose sky exposure is 1 looks as in Forge, and the
// field keeps a meaning (user decision 2026-11-13).

import type { PostProcessGates } from "../../engine/perf/qualityProfiles.ts";

/** Forge's `POST_PROCESS_RENDER_EXPOSURE_SCALE` and `SKY_ATMOSPHERE_RENDER_EXPOSURE_SCALE`: the authored 1 is exposure 0.2. */
export const EXPOSURE_SCALE = 0.2;

export type OutputToneMapping = "none" | "aces" | "neutral";

/** `forge.postProcess` as the renderer reads it (the component data has this shape). */
export interface PostProcessSettings extends PostProcessGates {
  readonly exposure: number;
  readonly toneMapping: OutputToneMapping;
  readonly bloom: { readonly enabled: boolean; readonly threshold: number; readonly intensity: number; readonly radius: number };
  readonly saturation: number;
  readonly contrast: number;
  readonly temperature: number;
  readonly tint: number;
  readonly vignette: { readonly enabled: boolean; readonly intensity: number; readonly offset: number };
  readonly dof: { readonly enabled: boolean; readonly focusDistance: number; readonly aperture: number; readonly maxBlur: number };
  readonly ao: { readonly enabled: boolean; readonly radius: number; readonly intensity: number };
  readonly chromaticAberration: { readonly enabled: boolean; readonly amount: number };
  readonly grain: { readonly enabled: boolean; readonly intensity: number };
}

/** The authored exposure (1-based) as tone mapping exposure. */
export function toneMappingExposure(exposure: number): number {
  return Math.max(0, exposure * EXPOSURE_SCALE);
}

export interface OutputInput {
  /** The Sky Atmosphere's authored exposure; null without a sky. */
  readonly skyExposure: number | null;
  /** The level's Post Process (quality-gated); null without one. */
  readonly postProcess: PostProcessSettings | null;
  /** The World Environment's exposure multiplier; 1 without one. */
  readonly exposureMultiplier: number;
}

/** What a frame is presented with. */
export interface FrameOutput {
  readonly toneMapping: OutputToneMapping;
  readonly exposure: number;
  /** The sky dome's radiance multiplier against the scene (1: as the scene). */
  readonly skyRadiance: number;
  /** The quality-gated Post Process the pipeline is built from; null without one. */
  readonly postProcess: PostProcessSettings | null;
}

export const NO_OUTPUT: FrameOutput = { toneMapping: "none", exposure: 1, skyRadiance: 1, postProcess: null };

export function resolveOutput(input: OutputInput): FrameOutput {
  const multiplier = Number.isFinite(input.exposureMultiplier) ? input.exposureMultiplier : 1;
  const post = input.postProcess;
  if (post) {
    return {
      toneMapping: post.toneMapping,
      exposure: toneMappingExposure(post.exposure) * multiplier,
      skyRadiance: input.skyExposure === null ? 1 : Math.max(0, input.skyExposure),
      postProcess: post,
    };
  }
  if (input.skyExposure !== null) {
    return { toneMapping: "aces", exposure: toneMappingExposure(input.skyExposure) * multiplier, skyRadiance: 1, postProcess: null };
  }
  return { toneMapping: "none", exposure: multiplier, skyRadiance: 1, postProcess: null };
}
