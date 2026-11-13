// What the frame pipeline builds (plan phase 3 step 6, architecture §4.9):
// from the quality-gated Post Process and the quality settings, the passes in
// order and the scene pass's MRT targets. Three-free; the pipeline
// (renderPipeline.ts) builds TSL nodes from a plan and rebuilds only when the
// plan's key changes (a profile or a Post Process switch), never per frame.
//
// Order: scene pass (MRT) -> GTAO or SSGI -> SSR -> TRAA or SMAA -> depth of
// field -> bloom -> colour grading -> chromatic aberration -> vignette -> film
// grain -> tone mapping and exposure (the output transform). Forge WebGL's
// composer ran AO -> DoF -> bloom -> grading -> chromatic aberration ->
// vignette -> grain -> SMAA -> output; anti-aliasing moved before DoF and
// bloom (TRAA resolves the HDR scene; architecture §4.9).
//
// A plan without a pass is drawn straight to the canvas (Forge drew a level
// without effect passes without its composer), with the renderer's MSAA.
//
// MRT (phase 3 decision 4): a target is attached only for the passes that read
// it, in a fixed order; the format packing keeps the full set at 30 bytes per
// sample, under WebGPU's default `maxColorAttachmentBytesPerSample` (32), so
// no `requiredLimits`.

import type { QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import type { PostProcessSettings } from "./output.ts";

export type MrtTargetName = "output" | "normal" | "velocity" | "metalrough" | "diffuse";

export interface MrtTarget {
  readonly name: MrtTargetName;
  /** The WebGPU texture format. */
  readonly format: "rgba16float" | "rgba8unorm" | "rg16float" | "rg8unorm";
  /** WebGPU's render target pixel byte cost and component alignment of the format. */
  readonly byteCost: number;
  readonly alignment: number;
}

/** Every target in attachment order: the scene colour, packed view normal, motion, metalness / roughness, albedo. */
export const MRT_TARGETS: readonly MrtTarget[] = [
  { name: "output", format: "rgba16float", byteCost: 8, alignment: 2 },
  { name: "normal", format: "rgba8unorm", byteCost: 8, alignment: 1 },
  { name: "velocity", format: "rg16float", byteCost: 4, alignment: 2 },
  { name: "metalrough", format: "rg8unorm", byteCost: 2, alignment: 1 },
  { name: "diffuse", format: "rgba8unorm", byteCost: 8, alignment: 1 },
];

/** WebGPU's default limit, which the pipeline never raises. */
export const MRT_BYTES_LIMIT = 32;

/** Color attachment bytes per sample, by the WebGPU rule (each target aligned to its component size, then its cost). */
export function mrtBytesPerSample(targets: readonly MrtTarget[]): number {
  let total = 0;
  for (const target of targets) total = Math.ceil(total / target.alignment) * target.alignment + target.byteCost;
  return total;
}

export type PipelinePass =
  | "scene" | "gtao" | "ssgi" | "ssr" | "traa" | "smaa" | "dof" | "bloom"
  | "grading" | "chromaticAberration" | "vignette" | "grain" | "output";

export interface PipelinePlan {
  /** No pass: the scene is drawn straight to the canvas. */
  readonly direct: boolean;
  /** The passes in order, `scene` first and `output` last; empty when direct. */
  readonly passes: readonly PipelinePass[];
  readonly mrt: readonly MrtTarget[];
  readonly mrtBytes: number;
  /** GTAO / SSGI render scale. */
  readonly aoResolutionScale: number;
  /** SSR render scale (`half` 0.5, `full` 1). */
  readonly ssrResolutionScale: number;
  /** The bloom node's render scale: its own half size, halved again on a half resolution profile. */
  readonly bloomResolutionScale: number;
  /** Identity: the pipeline is rebuilt when it changes. */
  readonly key: string;
}

/** Forge's `hasColorGrading`: the grading pass changes the image at all. */
export function hasColorGrading(post: Pick<PostProcessSettings, "saturation" | "contrast" | "temperature" | "tint">): boolean {
  return post.saturation !== 1 || post.contrast !== 1 || post.temperature !== 0 || post.tint !== 0;
}

/**
 * Bloom render scale for a quality bloom scale. Three's bloom node already
 * works at half size (as Forge's UnrealBloomPass did inside); a quality scale
 * of 0.5 halves it again (Forge's `scaledBloomResolution`). Bad input falls
 * back to full size.
 */
export function bloomResolutionScale(qualityScale: number): number {
  const scale = Number.isFinite(qualityScale) && qualityScale > 0 ? qualityScale : 1;
  return 0.5 * Math.min(1, scale);
}

const DIRECT: PipelinePlan = {
  direct: true, passes: [], mrt: [], mrtBytes: 0, aoResolutionScale: 1, ssrResolutionScale: 1, bloomResolutionScale: 0.5, key: "direct",
};

/**
 * The plan for a quality-gated Post Process (`applyQualityToPostProcess`);
 * null (no Post Process) draws direct. Ambient occlusion is SSGI where the
 * profile allows it, else GTAO (user decision 2026-11-13).
 */
export function planPipeline(post: PostProcessSettings | null, quality: QualitySettings): PipelinePlan {
  if (!post) return DIRECT;
  const passes: PipelinePass[] = ["scene"];
  const ao = post.ao.enabled ? (quality.ssgiAllowed ? "ssgi" : "gtao") : null;
  if (ao) passes.push(ao);
  const ssr = post.reflection === "ssr";
  if (ssr) passes.push("ssr");
  if (post.antialias !== "none") passes.push(post.antialias);
  if (post.dof.enabled) passes.push("dof");
  if (post.bloom.enabled) passes.push("bloom");
  if (hasColorGrading(post)) passes.push("grading");
  if (post.chromaticAberration.enabled) passes.push("chromaticAberration");
  if (post.vignette.enabled) passes.push("vignette");
  if (post.grain.enabled) passes.push("grain");
  if (passes.length === 1) return DIRECT;
  passes.push("output");

  const needs: Record<MrtTargetName, boolean> = {
    output: true,
    normal: ao !== null || ssr,
    velocity: post.antialias === "traa",
    metalrough: ssr,
    diffuse: ao === "ssgi",
  };
  const mrt = MRT_TARGETS.filter((target) => needs[target.name]);
  const aoResolutionScale = ao ? quality.aoResolutionScale : 1;
  const ssrResolutionScale = ssr ? (quality.ssrAllowed === "full" ? 1 : 0.5) : 1;
  const bloomScale = post.bloom.enabled ? bloomResolutionScale(quality.bloomResolutionScale) : 0.5;
  return {
    direct: false,
    passes,
    mrt,
    mrtBytes: mrtBytesPerSample(mrt),
    aoResolutionScale,
    ssrResolutionScale,
    bloomResolutionScale: bloomScale,
    key: `${passes.join(",")}|ao${aoResolutionScale}|ssr${ssrResolutionScale}|bloom${bloomScale}`,
  };
}
