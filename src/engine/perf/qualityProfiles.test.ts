// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { decideAdaptiveStep, effectiveQualitySettings, selectReductionRung, type AdaptiveDecisionState } from "./adaptiveQuality.ts";
import { type FrameMetrics } from "./frameMetrics.ts";
import { QUALITY_LEVELS, QUALITY_PROFILES, defaultGraphicsPreferences, effectiveDevicePixelRatio, normalizeGraphicsPreferences, resolveQualitySettings } from "./qualityProfiles.ts";
import { test } from "vitest";

const check = test;

const adaptiveMetrics = (
  avg: number,
  { p95 = avg, sampleCount = 300, windowSeconds = 5 }: { p95?: number; sampleCount?: number; windowSeconds?: number } = {},
): FrameMetrics => ({
  frameTimeMs: avg,
  averageFrameTimeMs: avg,
  p95FrameTimeMs: p95,
  spikeCount: 0,
  sampleWindowSeconds: windowSeconds,
  sampleCount,
  estimatedRefreshIntervalMs: 8.3,
});

check("graphics preferences: defaults are adaptive-on / 60fps / medium", () => {
  const defaults = defaultGraphicsPreferences();
  assert.deepEqual(defaults, {
    adaptiveOptimizationEnabled: true,
    targetFrameRate: 60,
    selectedQualityLevel: "medium",
    allowAdaptiveFineTuning: true,
    manuallySelected: false,
    startupCalibrated: false,
  });
  // A junk value normalizes to a fresh default (never crashes).
  assert.deepEqual(normalizeGraphicsPreferences(null), defaults);
  assert.deepEqual(normalizeGraphicsPreferences("nope"), defaults);
});

check("graphics preferences: normalization validates each field and gates customSettings on level", () => {
  // Valid overrides survive.
  assert.deepEqual(
    normalizeGraphicsPreferences({
      adaptiveOptimizationEnabled: false,
      targetFrameRate: 30,
      selectedQualityLevel: "low",
      allowAdaptiveFineTuning: false,
      manuallySelected: true,
      startupCalibrated: true,
    }),
    {
      adaptiveOptimizationEnabled: false,
      targetFrameRate: 30,
      selectedQualityLevel: "low",
      allowAdaptiveFineTuning: false,
      manuallySelected: true,
      startupCalibrated: true,
    },
  );

  // Bad enum / fps values fall back to defaults field-by-field.
  const patched = normalizeGraphicsPreferences({
    targetFrameRate: 144,
    selectedQualityLevel: "insane",
  });
  assert.equal(patched.targetFrameRate, 60);
  assert.equal(patched.selectedQualityLevel, "medium");
  // The calibration flags default to false when absent or wrongly typed.
  assert.equal(patched.manuallySelected, false);
  assert.equal(patched.startupCalibrated, false);
  const badFlags = normalizeGraphicsPreferences({ manuallySelected: "yes", startupCalibrated: 1 });
  assert.equal(badFlags.manuallySelected, false);
  assert.equal(badFlags.startupCalibrated, false);

  // customSettings is dropped on a concrete profile...
  const concrete = normalizeGraphicsPreferences({
    selectedQualityLevel: "high",
    customSettings: { renderScale: 0.5 },
  });
  assert.equal(concrete.customSettings, undefined);

  // ...but whitelisted and kept on "custom" (unknown keys + bad types dropped).
  const custom = normalizeGraphicsPreferences({
    selectedQualityLevel: "custom",
    customSettings: {
      renderScale: 0.5,
      shadowMapSize: 1024,
      bloomResolutionScale: 0.5,
      aoAllowed: true,
      shadowMapSizeBogus: 99,
      maxPixelRatio: "nope",
      unknownKey: 1,
    },
  });
  assert.deepEqual(custom.customSettings, {
    renderScale: 0.5,
    shadowMapSize: 1024,
    bloomResolutionScale: 0.5,
    aoAllowed: true,
  });

  // An empty custom override collapses to undefined (no stale empty object).
  const emptyCustom = normalizeGraphicsPreferences({
    selectedQualityLevel: "custom",
    customSettings: { bogus: 1 },
  });
  assert.equal(emptyCustom.customSettings, undefined);
});

check("quality profiles: resolve returns fresh copies and layers custom over a base", () => {
  // Concrete levels return a copy, never the shared profile object.
  const high = resolveQualitySettings("high");
  assert.notEqual(high, QUALITY_PROFILES.high);
  assert.deepEqual(high, QUALITY_PROFILES.high);
  high.renderScale = 0.1; // mutating the copy must not corrupt the template
  assert.equal(QUALITY_PROFILES.high.renderScale, 1.0);

  // The ladder runs highest → lowest for adaptive stepping.
  assert.deepEqual(QUALITY_LEVELS, ["ultra", "high", "medium", "low"]);
  // Render scale and pixel-ratio cap are monotonically non-increasing.
  const scales = QUALITY_LEVELS.map((l) => QUALITY_PROFILES[l].renderScale);
  const caps = QUALITY_LEVELS.map((l) => QUALITY_PROFILES[l].maxPixelRatio);
  for (let i = 1; i < scales.length; i += 1) {
    assert.ok(scales[i]! <= scales[i - 1]!);
    assert.ok(caps[i]! <= caps[i - 1]!);
  }

  // Custom layers overrides onto the base (default medium); untouched fields keep the base.
  const custom = resolveQualitySettings("custom", { renderScale: 0.5, aoAllowed: true });
  assert.equal(custom.renderScale, 0.5);
  assert.equal(custom.aoAllowed, true);
  assert.equal(custom.shadowMapSize, QUALITY_PROFILES.medium.shadowMapSize);
  // An explicit base level can override the default.
  const fromLow = resolveQualitySettings("custom", { bloomAllowed: true }, "low");
  assert.equal(fromLow.shadowsEnabled, false); // low's shadows stay off
  assert.equal(fromLow.bloomAllowed, true);
});

check("quality profiles: effective pixel ratio caps the DPR then folds in render scale", () => {
  // Ultra (cap 2, scale 1) equals min(dpr, 2) — the renderer's MAX_PIXEL_RATIO,
  // so applying Ultra is a no-op regardless of device DPR.
  assert.equal(effectiveDevicePixelRatio(3, QUALITY_PROFILES.ultra), 2);
  assert.equal(effectiveDevicePixelRatio(1, QUALITY_PROFILES.ultra), 1);
  // Low: cap 1, scale 0.7 → min(dpr, 1) * 0.7.
  assert.ok(Math.abs(effectiveDevicePixelRatio(3, QUALITY_PROFILES.low) - 0.7) < 1e-9);
  // Medium: cap 1.5, scale 0.85 → on a 2x display, 1.5 * 0.85.
  assert.ok(Math.abs(effectiveDevicePixelRatio(2, QUALITY_PROFILES.medium) - 1.275) < 1e-9);
  // Bad DPR falls back to 1; a zero cap falls back to the DPR (never zero out).
  assert.ok(effectiveDevicePixelRatio(Number.NaN, QUALITY_PROFILES.ultra) > 0);
  assert.ok(effectiveDevicePixelRatio(0, QUALITY_PROFILES.low) > 0);
});

check("adaptive quality: decideAdaptiveStep honours disable, cooldown, window and hysteresis", () => {
  const prefs = defaultGraphicsPreferences(); // adaptive on, 60 FPS, medium
  const gpu = () => ({ type: "gpu" as const, confidence: 0.6, evidence: [] });
  const base = (over: Partial<AdaptiveDecisionState>): AdaptiveDecisionState => ({
    metrics: adaptiveMetrics(30),
    preferences: prefs,
    cooldownRemainingSeconds: 0,
    stableDurationSeconds: 0,
    classify: gpu,
    ...over,
  });

  // Degraded across a full ≥5s window and off cooldown → reduce.
  assert.equal(decideAdaptiveStep(base({})).kind, "reduce");
  // Adaptive disabled → always hold.
  assert.equal(
    decideAdaptiveStep(base({ preferences: { ...prefs, adaptiveOptimizationEnabled: false } })).kind,
    "none",
  );
  // Within cooldown → hold even when degraded.
  assert.equal(decideAdaptiveStep(base({ cooldownRemainingSeconds: 3 })).kind, "none");
  // Degraded but the window hasn't settled to 5s yet → hold.
  assert.equal(decideAdaptiveStep(base({ metrics: adaptiveMetrics(30, { windowSeconds: 3 }) })).kind, "none");
  // Neutral band (18ms) → hold, neither reduce nor raise.
  assert.equal(decideAdaptiveStep(base({ metrics: adaptiveMetrics(18) })).kind, "none");
  // Stable + long enough → increase; stable but too brief → hold.
  assert.equal(
    decideAdaptiveStep(base({ metrics: adaptiveMetrics(12), stableDurationSeconds: 45 })).kind,
    "increase",
  );
  assert.equal(
    decideAdaptiveStep(base({ metrics: adaptiveMetrics(12), stableDurationSeconds: 20 })).kind,
    "none",
  );
});

check("adaptive quality: reduction ladder is bottleneck-targeted and folds/reverses cleanly", () => {
  const ultra = QUALITY_PROFILES.ultra;
  // GPU picks the least-visible GPU rung first (GTAO); CPU prefers object-count knobs.
  assert.equal(selectReductionRung(ultra, "gpu")?.id, "gtao-off");
  assert.equal(selectReductionRung(ultra, "cpu")?.id, "particle-density-down");
  // Unknown → a general small step (first applicable rung of any family).
  assert.equal(selectReductionRung(ultra, "unknown")?.id, "gtao-off");

  // Folding applies rungs in order; a repeated shadow rung steps 2048→1024→512.
  const folded = effectiveQualitySettings(ultra, ["gtao-off", "shadow-map-down", "shadow-map-down"]);
  assert.equal(folded.aoAllowed, false);
  assert.equal(folded.shadowMapSize, 512);
  assert.equal(folded.dofAllowed, true); // untouched rungs stay at base
  // The base object is never mutated.
  assert.equal(ultra.aoAllowed, true);
  assert.equal(ultra.shadowMapSize, 2048);

  // Low with shadows off + AO/DoF/bloom off still has render scale / particles to shed.
  assert.equal(selectReductionRung(QUALITY_PROFILES.low, "gpu")?.id, "particle-density-down");
  // A fully-floored profile yields no rung.
  const floored = effectiveQualitySettings(QUALITY_PROFILES.low, [
    "particle-density-down",
    "particle-density-down",
    "foliage-cull-down",
    "render-scale-down",
    "render-scale-down",
    "shadow-distance-down",
    "pixel-ratio-down",
  ]);
  assert.equal(selectReductionRung(floored, "gpu"), null);
});
