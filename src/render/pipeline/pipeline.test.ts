// The frame pipeline's three-free parts: the output transform (Forge's
// exposure rule), the plan (passes, MRT, rebuild key) and the MRT budget per
// quality profile. Rewrites of Forge WebGL's post-process checks in
// tools/engine-tests.ts (docs/PORT_LOG.md §2); the pipeline's TSL nodes are
// checked on the device by the render smoke.

import { describe, expect, test } from "vitest";
import { CINEMATIC_PROFILE, QUALITY_LEVELS, QUALITY_PROFILES, applyQualityToPostProcess, type QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { probeMrtBudget, type ProbeDevice } from "./mrtProbe.ts";
import { EXPOSURE_SCALE, resolveOutput, toneMappingExposure, type PostProcessSettings } from "./output.ts";
import { MRT_BYTES_LIMIT, MRT_TARGETS, bloomResolutionScale, mrtBytesPerSample, planPipeline } from "./pipelinePlan.ts";
import { dofFocalLength } from "./renderPipeline.ts";

/** Forge's POST_PROCESS_DEFAULTS in `forge.postProcess` form (reflection off). */
const DEFAULTS: PostProcessSettings = {
  exposure: 1,
  toneMapping: "aces",
  antialias: "none",
  reflection: "off",
  bloom: { enabled: false, threshold: 1, intensity: 1, radius: 1 },
  saturation: 1,
  contrast: 1,
  temperature: 0,
  tint: 0,
  vignette: { enabled: false, intensity: 0.35, offset: 1 },
  dof: { enabled: false, focusDistance: 10, aperture: 1, maxBlur: 1 },
  ao: { enabled: false, radius: 1, intensity: 1 },
  chromaticAberration: { enabled: false, amount: 0.5 },
  grain: { enabled: false, intensity: 0.5 },
};
type Patch = { [K in keyof PostProcessSettings]?: PostProcessSettings[K] extends object ? Partial<PostProcessSettings[K]> : PostProcessSettings[K] };
const post = (patch: Patch = {}): PostProcessSettings => {
  const merged: Record<string, unknown> = { ...DEFAULTS };
  for (const [key, value] of Object.entries(patch)) {
    const base = (DEFAULTS as unknown as Record<string, unknown>)[key];
    merged[key] = typeof value === "object" && value !== null ? { ...(base as object), ...value } : value;
  }
  return merged as unknown as PostProcessSettings;
};
const ULTRA = QUALITY_PROFILES.ultra;
/** Every effect a level can author. */
const EVERYTHING = post({
  antialias: "traa", reflection: "ssr", saturation: 1.1,
  bloom: { enabled: true }, vignette: { enabled: true }, dof: { enabled: true }, ao: { enabled: true },
  chromaticAberration: { enabled: true }, grain: { enabled: true },
});

describe("output transform", () => {
  // Rewritten from "applyPostProcessToneMapping maps tonemapper enum and ignores hidden/null" (25290).
  test("the Post Process tone mapper and exposure x 0.2; without one the sky's or none", () => {
    expect(resolveOutput({ skyExposure: null, postProcess: post({ toneMapping: "aces", exposure: 1.25 }), exposureMultiplier: 1 }))
      .toMatchObject({ toneMapping: "aces", exposure: 0.25 });
    expect(resolveOutput({ skyExposure: null, postProcess: post({ toneMapping: "neutral", exposure: 0.8 }), exposureMultiplier: 1 }).exposure).toBeCloseTo(0.16);
    expect(resolveOutput({ skyExposure: null, postProcess: post({ toneMapping: "none", exposure: 2 }), exposureMultiplier: 1 }))
      .toMatchObject({ toneMapping: "none", exposure: 0.4 });
    // No Post Process (Forge's null / hidden): no tone mapping without a sky.
    expect(resolveOutput({ skyExposure: null, postProcess: null, exposureMultiplier: 1 }))
      .toEqual({ toneMapping: "none", exposure: 1, skyRadiance: 1, postProcess: null });
  });

  // Rewritten from "post process tone mapping can override scene exposure after sky" (25333; the world test
  // in features/world-environment/render.test.ts draws it end to end).
  test("a Post Process overrides the sky's exposure; the World Environment multiplies whichever presents", () => {
    expect(resolveOutput({ skyExposure: 0.4, postProcess: null, exposureMultiplier: 1 })).toMatchObject({ toneMapping: "aces", skyRadiance: 1 });
    expect(resolveOutput({ skyExposure: 0.4, postProcess: null, exposureMultiplier: 1 }).exposure).toBeCloseTo(0.08);
    const over = resolveOutput({ skyExposure: 0.6, postProcess: post({ toneMapping: "neutral", exposure: 1.7 }), exposureMultiplier: 1 });
    expect(over.toneMapping).toBe("neutral");
    expect(over.exposure).toBeCloseTo(0.34);
    expect(over.skyRadiance).toBeCloseTo(0.6);
    expect(resolveOutput({ skyExposure: 1, postProcess: null, exposureMultiplier: 2.5 }).exposure).toBeCloseTo(0.5);
    expect(resolveOutput({ skyExposure: 1, postProcess: post(), exposureMultiplier: 2.5 }).exposure).toBeCloseTo(0.5);
  });

  // Rewritten from "authored exposure 1 maps to the previous 0.2 renderer exposure" (25371).
  test("authored exposure 1 maps to the previous 0.2 renderer exposure; under a Post Process the sky keeps its own as radiance", () => {
    expect(EXPOSURE_SCALE).toBe(0.2);
    expect(toneMappingExposure(1)).toBe(0.2);
    expect(toneMappingExposure(-1)).toBe(0);
    // Forge drew the sky at 0.2 x 0.2 = 0.04 only without an effect pass; the dome is now at the sky's exposure against the scene.
    const both = resolveOutput({ skyExposure: 1, postProcess: post(), exposureMultiplier: 1 });
    expect(both.exposure * both.skyRadiance).toBeCloseTo(0.2);
  });
});

describe("pipeline plan", () => {
  // Rewritten from "hasPostProcessEffectPasses tracks enabled pass effects only" (25377).
  test("a pass exists only for an enabled effect; otherwise the scene is drawn direct", () => {
    expect(planPipeline(null, ULTRA).direct).toBe(true);
    expect(planPipeline(post(), ULTRA).direct).toBe(true);
    for (const patch of [
      { bloom: { enabled: true } }, { vignette: { enabled: true } }, { saturation: 1.1 }, { contrast: 0.9 },
      { chromaticAberration: { enabled: true } }, { grain: { enabled: true } }, { dof: { enabled: true } }, { ao: { enabled: true } },
      { antialias: "smaa" }, { antialias: "traa" }, { reflection: "ssr" }, { temperature: 0.5 }, { tint: -0.5 },
    ] as Patch[]) {
      expect(planPipeline(post(patch), ULTRA).direct, JSON.stringify(patch)).toBe(false);
    }
    // Disabled DoF / CA / grain plus neutral white balance leave the chain empty.
    expect(planPipeline(post({ dof: { focusDistance: 30 }, temperature: 0 }), ULTRA).direct).toBe(true);
  });

  // Rewritten from "createPostProcessEffectPasses follows enabled-set ordering" (25437) and "PostProcessPipeline
  // keeps effect, outline, SMAA, output order and lifecycles" (25601): the order now puts anti-aliasing before
  // DoF and bloom; the editor overlay joins after TRAA in phase 4.
  test("passes follow the pipeline order", () => {
    expect(planPipeline(EVERYTHING, ULTRA).passes).toEqual([
      "scene", "gtao", "ssr", "traa", "dof", "bloom", "grading", "chromaticAberration", "vignette", "grain", "output",
    ]);
    expect(planPipeline(post({ antialias: "smaa", bloom: { enabled: true }, ao: { enabled: true } }), ULTRA).passes)
      .toEqual(["scene", "gtao", "smaa", "bloom", "output"]);
    // Cinematic: SSGI in GTAO's place (user decision 2026-11-13).
    expect(planPipeline(EVERYTHING, CINEMATIC_PROFILE).passes.slice(0, 4)).toEqual(["scene", "ssgi", "ssr", "traa"]);
  });

  // Rewritten from "createPostProcessAntialiasPass creates SMAA only when enabled" (25564).
  test("anti-aliasing is the authored one, gated: SMAA / TRAA only when enabled and allowed", () => {
    const gate = (patch: Patch, quality: QualitySettings) => planPipeline(applyQualityToPostProcess(post(patch), quality), quality).passes;
    expect(gate({ antialias: "none" }, ULTRA)).toEqual([]);
    expect(gate({ antialias: "smaa" }, ULTRA)).toEqual(["scene", "smaa", "output"]);
    expect(gate({ antialias: "smaa" }, QUALITY_PROFILES.low)).toEqual([]);
    expect(gate({ antialias: "traa" }, QUALITY_PROFILES.medium)).toEqual(["scene", "traa", "output"]);
  });

  // Rewritten from "scaledBloomResolution scales the bloom target and guards bad input" (25475).
  test("bloom resolution: the node's half size, halved again on a half resolution profile; bad input is full", () => {
    expect(bloomResolutionScale(1)).toBe(0.5);
    expect(bloomResolutionScale(0.5)).toBe(0.25);
    expect(bloomResolutionScale(0)).toBe(0.5);
    expect(bloomResolutionScale(Number.NaN)).toBe(0.5);
    const bloomed = post({ bloom: { enabled: true } });
    expect(planPipeline(bloomed, QUALITY_PROFILES.medium).bloomResolutionScale).toBe(0.25);
  });

  test("the key changes with a switch or a scale, not with an authored number", () => {
    const base = planPipeline(post({ bloom: { enabled: true } }), ULTRA).key;
    expect(planPipeline(post({ bloom: { enabled: true, intensity: 3, threshold: 0.2 } }), ULTRA).key).toBe(base);
    expect(planPipeline(post({ bloom: { enabled: true }, vignette: { enabled: true } }), ULTRA).key).not.toBe(base);
    expect(planPipeline(post({ bloom: { enabled: true } }), QUALITY_PROFILES.medium).key).not.toBe(base);
    const ssr = post({ reflection: "ssr" });
    expect(planPipeline(ssr, ULTRA).ssrResolutionScale).toBe(0.5);
    expect(planPipeline(ssr, CINEMATIC_PROFILE).ssrResolutionScale).toBe(1);
  });

  test("depth of field: Forge's Bokeh ratio as the distance to full blur", () => {
    expect(dofFocalLength(1, 1)).toBeCloseTo(50);
    expect(dofFocalLength(2, 1)).toBeCloseTo(25);
    expect(dofFocalLength(0, 1)).toBeGreaterThan(1e5);
  });
});

describe("MRT budget (phase 3 decision 4)", () => {
  test("the full set is 30 bytes per sample by the WebGPU rule", () => {
    expect(MRT_TARGETS.map((target) => `${target.name}:${target.format}`)).toEqual([
      "output:rgba16float", "normal:rgba8unorm", "velocity:rg16float", "metalrough:rg8unorm", "diffuse:rgba8unorm",
    ]);
    expect(mrtBytesPerSample(MRT_TARGETS)).toBe(30);
    expect(mrtBytesPerSample(MRT_TARGETS)).toBeLessThanOrEqual(MRT_BYTES_LIMIT);
  });

  test("every profile's largest set (a level authoring everything) fits", () => {
    const bytes: Record<string, number> = {};
    const targets: Record<string, string> = {};
    for (const [level, quality] of [...QUALITY_LEVELS.map((name) => [name, QUALITY_PROFILES[name]] as const), ["cinematic", CINEMATIC_PROFILE] as const]) {
      const plan = planPipeline(applyQualityToPostProcess(EVERYTHING, quality), quality);
      bytes[level] = plan.mrtBytes;
      targets[level] = plan.mrt.map((target) => target.name).join(",");
      expect(plan.mrtBytes, level).toBeLessThanOrEqual(MRT_BYTES_LIMIT);
    }
    expect(targets).toEqual({
      ultra: "output,normal,velocity,metalrough",
      high: "output,normal,velocity,metalrough",
      medium: "output,normal,velocity,metalrough",
      low: "output",
      cinematic: "output,normal,velocity,metalrough,diffuse",
    });
    expect(bytes).toEqual({ ultra: 22, high: 22, medium: 22, low: 8, cinematic: 30 });
  });

  test("the device probe builds one pipeline with every target in a validation scope", async () => {
    const seen: unknown[] = [];
    let scoped = false;
    const device = (error: string | null): ProbeDevice => ({
      limits: { maxColorAttachmentBytesPerSample: 32 },
      pushErrorScope: () => void (scoped = true),
      popErrorScope: async () => (error ? { message: error } : null),
      createShaderModule: (descriptor) => descriptor,
      createRenderPipeline: (descriptor) => void seen.push(descriptor),
    });
    expect(await probeMrtBudget(device(null))).toEqual({ bytes: 30, limit: 32, ok: true, error: null });
    expect(scoped).toBe(true);
    const formats = (seen[0] as { fragment: { targets: { format: string }[] } }).fragment.targets.map((target) => target.format);
    expect(formats).toEqual(["rgba16float", "rgba8unorm", "rg16float", "rg8unorm", "rgba8unorm"]);
    expect(await probeMrtBudget(device("too many bytes"))).toMatchObject({ ok: false, error: "too many bytes" });
  });
});
