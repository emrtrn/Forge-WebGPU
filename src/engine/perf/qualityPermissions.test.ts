// The WebGPU permission fields of the quality profiles (plan phase 3 decision 3,
// architecture §4.9): how the ladder maps onto the phase 1 pipeline profiles,
// and Cinematic off the ladder.

import { describe, expect, test } from "vitest";
import { calibrateFromMeasurement, stepQualityLevel, suggestStartingQualityLevel } from "./hardwareHints.ts";
import {
  CINEMATIC_PROFILE,
  QUALITY_LEVELS,
  QUALITY_PROFILES,
  isQualityLevel,
  normalizeGraphicsPreferences,
  resolveQualitySettings,
  type QualitySettings,
} from "./qualityProfiles.ts";

/** The pipeline passes a profile allows (the level still has to author them). */
const passes = (settings: QualitySettings) => ({
  traa: settings.traaAllowed,
  gtao: settings.aoAllowed,
  ssr: settings.ssrAllowed,
  ssgi: settings.ssgiAllowed,
});

describe("WebGPU quality permissions", () => {
  test("ultra and high are Balanced: TRAA, GTAO, half resolution SSR, no SSGI", () => {
    for (const level of ["ultra", "high"] as const) {
      expect(passes(QUALITY_PROFILES[level])).toEqual({ traa: true, gtao: true, ssr: "half", ssgi: false });
      expect(QUALITY_PROFILES[level].bloomAllowed).toBe(true);
      expect(QUALITY_PROFILES[level].aoResolutionScale).toBe(1);
    }
  });

  test("medium is Balanced without GTAO; low is Compatibility, no screen-space pass", () => {
    expect(passes(QUALITY_PROFILES.medium)).toEqual({ traa: true, gtao: false, ssr: "half", ssgi: false });
    expect(passes(QUALITY_PROFILES.low)).toEqual({ traa: false, gtao: false, ssr: "off", ssgi: false });
  });

  test("Cinematic is Ultra with SSGI and full resolution SSR", () => {
    expect(passes(CINEMATIC_PROFILE)).toEqual({ traa: true, gtao: true, ssr: "full", ssgi: true });
    const { ssrAllowed: _ssr, ssgiAllowed: _ssgi, ...rest } = CINEMATIC_PROFILE;
    const { ssrAllowed: _ultraSsr, ssgiAllowed: _ultraSsgi, ...ultra } = QUALITY_PROFILES.ultra;
    expect(rest).toEqual(ultra);
    const resolved = resolveQualitySettings("cinematic");
    expect(resolved).toEqual(CINEMATIC_PROFILE);
    expect(resolved).not.toBe(CINEMATIC_PROFILE);
  });

  test("Cinematic is off the ladder: hints, calibration and steps never reach it; the player can pick it", () => {
    expect(QUALITY_LEVELS).not.toContain("cinematic");
    expect(stepQualityLevel("ultra", "up")).toBe("ultra");
    const strong = suggestStartingQualityLevel({
      hardwareConcurrency: 32,
      deviceMemoryGb: 8,
      screenWidth: 3840,
      screenHeight: 2160,
      devicePixelRatio: 1,
      isTouch: false,
      webglRenderer: "NVIDIA GeForce RTX 4090",
    });
    expect(strong.level).not.toBe("cinematic");
    const fast = calibrateFromMeasurement({
      currentLevel: "ultra",
      targetFrameRate: 60,
      metrics: { frameTimeMs: 4, averageFrameTimeMs: 4, p95FrameTimeMs: 5, spikeCount: 0, sampleWindowSeconds: 10, sampleCount: 600, estimatedRefreshIntervalMs: 4 },
    });
    expect(fast.level).toBe("ultra");
    expect(isQualityLevel("cinematic")).toBe(true);
    expect(normalizeGraphicsPreferences({ selectedQualityLevel: "cinematic", manuallySelected: true }).selectedQualityLevel).toBe("cinematic");
  });

  test("a custom override carries the new fields, wrong values are dropped", () => {
    const prefs = normalizeGraphicsPreferences({
      selectedQualityLevel: "custom",
      customSettings: { traaAllowed: false, ssrAllowed: "full", ssgiAllowed: true, aoResolutionScale: 0.5 },
    });
    expect(prefs.customSettings).toEqual({ traaAllowed: false, ssrAllowed: "full", ssgiAllowed: true, aoResolutionScale: 0.5 });
    const wrong = normalizeGraphicsPreferences({
      selectedQualityLevel: "custom",
      customSettings: { traaAllowed: "yes", ssrAllowed: "quarter", aoResolutionScale: 0.25, renderScale: 0.9 },
    });
    expect(wrong.customSettings).toEqual({ renderScale: 0.9 });
    expect(resolveQualitySettings("custom", { ssrAllowed: "off" }, "cinematic").ssgiAllowed).toBe(true);
  });
});
