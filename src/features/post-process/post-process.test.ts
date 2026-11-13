import { describe, expect, test } from "vitest";
import { createComponent, createSchemaRegistry, formOf, installFeatures, normalizeComponent } from "../../core/index.ts";
import { CINEMATIC_PROFILE, QUALITY_PROFILES, applyQualityToPostProcess } from "../../engine/perf/qualityProfiles.ts";
import postProcessFeature from "./feature.ts";
import { PostProcess, type PostProcessData } from "./schema.ts";

const post = (patch: Partial<PostProcessData> = {}): PostProcessData => ({ ...createComponent(PostProcess), ...patch });

describe("post process schema", () => {
  test("defaults are Forge WebGL's POST_PROCESS_DEFAULTS, reflection off", () => {
    expect(createComponent(PostProcess)).toEqual({
      type: "forge.postProcess@1",
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
    });
  });

  test("ranges are the ones of Forge's Details panel; out of range is clamped", () => {
    const rows: string[] = [];
    const walk = (fields: ReturnType<typeof formOf>["fields"], prefix: string): void => {
      for (const field of fields) {
        if (field.kind === "number") rows.push(`${prefix}${field.label} ${field.range.min}..${field.range.max}`);
        else if (field.kind === "object") walk(field.fields, `${field.label}.`);
        else rows.push(`${prefix}${field.label}`);
      }
    };
    walk(formOf(PostProcess).fields, "");
    expect(rows).toEqual([
      "Exposure 0..4", "Tonemapper", "Anti-aliasing", "Reflection",
      "Bloom.Enabled", "Bloom.Threshold 0..2", "Bloom.Intensity 0..5", "Bloom.Radius 0..2",
      "Saturation 0..2", "Contrast 0..2", "Temperature -1..1", "Tint -1..1",
      "Vignette.Enabled", "Vignette.Intensity 0..2", "Vignette.Offset 0..2",
      "Depth of Field.Enabled", "Depth of Field.Focus Distance 0..100", "Depth of Field.Aperture 0..2", "Depth of Field.Max Blur 0..2",
      "Ambient Occlusion.Enabled", "Ambient Occlusion.Radius 0..4", "Ambient Occlusion.Intensity 0..2",
      "Chromatic Aberration.Enabled", "Chromatic Aberration.Amount 0..2",
      "Film Grain.Enabled", "Film Grain.Intensity 0..1",
    ]);
    const result = normalizeComponent(PostProcess, { type: "forge.postProcess@1", exposure: 9, bloom: { intensity: -1 } }, { strict: true });
    expect(result.value).toMatchObject({ exposure: 4, bloom: { intensity: 0, threshold: 1 } });
  });

  test("the feature installs the singleton; every field has a Turkish hint and an English name", () => {
    const registry = createSchemaRegistry();
    installFeatures([postProcessFeature], registry);
    expect(registry.getComponent(PostProcess.name)).toBe(PostProcess);
    expect(PostProcess.singleton).toBe(true);
    expect(PostProcess.spatial).toBe(false);
    expect(PostProcess.hint).toBeTruthy();
    const walk = (fields: ReturnType<typeof formOf>["fields"]): void => {
      for (const field of fields) {
        expect(field.hint, field.key).toBeTruthy();
        expect(field.label, field.key).toMatch(/^[A-Z][A-Za-z -]*$/);
        if (field.kind === "object") walk(field.fields);
      }
    };
    walk(formOf(PostProcess).fields);
  });
});

describe("applyQualityToPostProcess", () => {
  // Rewritten from Forge tools/engine-tests.ts "quality profiles: post-process merge only gates off,
  // never re-authors (Principle #2)" (16901): the same assertions on `forge.postProcess` data.
  test("quality profiles: post-process merge only gates off, never re-authors (Principle #2)", () => {
    const authoredOn = post({
      antialias: "smaa",
      bloom: { enabled: true, threshold: 1, intensity: 2.5, radius: 1 },
      dof: { enabled: true, focusDistance: 10, aperture: 1, maxBlur: 1 },
      ao: { enabled: true, radius: 1, intensity: 1 },
    });
    // Low disallows AO/DoF/SMAA (bloom too); all authored-on effects gate off.
    const gated = applyQualityToPostProcess(authoredOn, QUALITY_PROFILES.low);
    expect(gated.ao.enabled).toBe(false);
    expect(gated.dof.enabled).toBe(false);
    expect(gated.bloom.enabled).toBe(false);
    expect(gated.antialias).toBe("none");
    // Numeric authored params pass through untouched (gate, don't re-author).
    expect(gated.bloom.intensity).toBe(2.5);
    // Ultra allows everything, so authored-on stays on.
    const full = applyQualityToPostProcess(authoredOn, QUALITY_PROFILES.ultra);
    expect(full.ao.enabled).toBe(true);
    expect(full.dof.enabled).toBe(true);
    expect(full.bloom.enabled).toBe(true);
    expect(full.antialias).toBe("smaa");

    // Author left everything OFF: even Ultra must NOT turn anything on.
    const allowMax = applyQualityToPostProcess(post(), CINEMATIC_PROFILE);
    expect(allowMax.ao.enabled).toBe(false);
    expect(allowMax.dof.enabled).toBe(false);
    expect(allowMax.bloom.enabled).toBe(false);
    expect(allowMax.antialias).toBe("none");
    expect(allowMax.reflection).toBe("off");
    // The authored data is never written.
    expect(authoredOn.ao.enabled).toBe(true);
  });

  test("the WebGPU passes: TRAA by traaAllowed, SSR by ssrAllowed; medium keeps TRAA and SSR, drops GTAO", () => {
    const authored = post({ antialias: "traa", reflection: "ssr", ao: { enabled: true, radius: 1, intensity: 1 } });
    const medium = applyQualityToPostProcess(authored, QUALITY_PROFILES.medium);
    expect([medium.antialias, medium.reflection, medium.ao.enabled]).toEqual(["traa", "ssr", false]);
    const low = applyQualityToPostProcess(authored, QUALITY_PROFILES.low);
    expect([low.antialias, low.reflection]).toEqual(["none", "off"]);
    const cinematic = applyQualityToPostProcess(authored, CINEMATIC_PROFILE);
    expect([cinematic.antialias, cinematic.reflection, cinematic.ao.enabled]).toEqual(["traa", "ssr", true]);
  });
});
