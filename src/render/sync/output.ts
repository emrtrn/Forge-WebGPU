// The world's output transform, once per frame before the bindings sync (plan
// phase 3 step 6): the authored sky exposure and Post Process are read by
// component name (the render layer cannot import features, as the
// environment override reads the singletons), the Post Process is gated by
// the quality profile (`applyQualityToPostProcess`), and Forge's exposure rule
// (render/pipeline/output.ts) with the World Environment's multiplier gives the
// tone mapping, the exposure, the sky dome's radiance and the gated Post
// Process the pipeline is built from. Bindings read it (`ctx.output`); the sky
// draws its dome at `skyRadiance`.

import { applyQualityToPostProcess, type QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import type { ResolvedEnvironment } from "../../engine/environment/environmentResolve.ts";
import { NO_OUTPUT, resolveOutput, type FrameOutput, type PostProcessSettings } from "../pipeline/output.ts";
import type { RenderWorldView } from "./renderBinding.ts";

export const SKY_ATMOSPHERE_COMPONENT = "forge.skyAtmosphere";
export const POST_PROCESS_COMPONENT = "forge.postProcess";

export interface OutputState {
  /** Live: rewritten every frame. */
  readonly output: FrameOutput;
  update(override: ResolvedEnvironment | null, quality: QualitySettings): void;
}

export function createOutputState(world: Pick<RenderWorldView, "componentsOf">): OutputState {
  const output: { -readonly [K in keyof FrameOutput]: FrameOutput[K] } = { ...NO_OUTPUT };
  return {
    output,
    update(override, quality) {
      const sky = world.componentsOf(SKY_ATMOSPHERE_COMPONENT)[0]?.component as unknown as { exposure: number } | undefined;
      const post = world.componentsOf(POST_PROCESS_COMPONENT)[0]?.component as unknown as PostProcessSettings | undefined;
      Object.assign(output, resolveOutput({
        skyExposure: sky ? Number(sky.exposure) : null,
        postProcess: post ? applyQualityToPostProcess(post, quality) : null,
        exposureMultiplier: override?.exposureMultiplier ?? 1,
      }));
    },
  };
}
