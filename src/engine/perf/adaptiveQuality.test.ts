// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { AdaptiveQualityController, classifyFrameLoad, formatAdaptiveChange } from "./adaptiveQuality.ts";
import { type FrameMetrics } from "./frameMetrics.ts";
import { QUALITY_PROFILES, defaultGraphicsPreferences } from "./qualityProfiles.ts";
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

check("adaptive quality: classifyFrameLoad splits degraded / stable / neutral around the target", () => {
  // Target 16.7ms: degraded above ×1.25 (20.9), stable below ×0.9 (15.0), else neutral.
  assert.equal(classifyFrameLoad(30, 16.7), "degraded");
  assert.equal(classifyFrameLoad(14, 16.7), "stable");
  assert.equal(classifyFrameLoad(18, 16.7), "neutral");
});

check("adaptive quality: controller steps down under load, respects cooldown, raises when stable", () => {
  const controller = new AdaptiveQualityController(QUALITY_PROFILES.ultra, {
    reduceCooldownSeconds: 15,
    increaseCooldownSeconds: 20,
    minSamples: 30,
  });
  const prefs = defaultGraphicsPreferences();
  const degraded = () => ({
    metrics: adaptiveMetrics(30),
    preferences: prefs,
    deltaSeconds: 1,
    active: true,
    classify: () => ({ type: "gpu" as const, confidence: 0.6, evidence: ["gpu"] }),
  });

  // First degraded tick → one reduction (GTAO off), depth 1.
  const first = controller.update(degraded());
  assert.equal(first.kind, "reduce");
  assert.equal(first.change?.rungId, "gtao-off");
  assert.equal(first.settings?.aoAllowed, false);
  assert.equal(controller.reductionDepth, 1);

  // Next degraded tick within cooldown → no change.
  assert.equal(controller.update(degraded()).kind, "none");
  assert.equal(controller.reductionDepth, 1);

  // Advance past the reduce cooldown while still degraded → next rung (DoF off).
  const second = controller.update({ ...degraded(), deltaSeconds: 15 });
  assert.equal(second.kind, "reduce");
  assert.equal(second.change?.rungId, "dof-off");
  assert.equal(controller.reductionDepth, 2);

  // Insufficient samples → declines to act (and doesn't accumulate stability).
  assert.equal(
    controller.update({ ...degraded(), metrics: adaptiveMetrics(30, { sampleCount: 5 }) }).kind,
    "none",
  );

  // Feed stable frames: clears the reduce cooldown, then a 45s stable stretch raises.
  const stable = () => ({
    metrics: adaptiveMetrics(12),
    preferences: prefs,
    deltaSeconds: 15,
    active: true,
    classify: () => ({ type: "unknown" as const, confidence: 0.2, evidence: [] }),
  });
  assert.equal(controller.update(stable()).kind, "none"); // cooldown clears, stable 15s
  assert.equal(controller.update(stable()).kind, "none"); // stable 30s
  const raised = controller.update(stable()); // stable 45s → raise
  assert.equal(raised.kind, "increase");
  assert.equal(controller.reductionDepth, 1); // popped one rung (LIFO: DoF restored)
  assert.equal(raised.settings?.dofAllowed, true);

  // Inactive (adaptive gated off) resets the stable timer and idles.
  assert.equal(controller.update({ ...stable(), active: false }).kind, "none");
});

check("adaptive quality: controller never rises above the base ceiling and setBase drops reductions", () => {
  const controller = new AdaptiveQualityController(QUALITY_PROFILES.high, {
    reduceCooldownSeconds: 0,
    increaseCooldownSeconds: 0,
  });
  const prefs = defaultGraphicsPreferences();
  const stable = {
    metrics: adaptiveMetrics(10),
    preferences: prefs,
    deltaSeconds: 60,
    active: true,
    classify: () => ({ type: "unknown" as const, confidence: 0.2, evidence: [] }),
  };
  // At the ceiling with nothing reduced, a stable stretch cannot raise past base.
  assert.equal(controller.update(stable).kind, "none");
  assert.equal(controller.reductionDepth, 0);

  // Reduce once, then setBase (player changed profile) wipes the transient rung.
  controller.update({
    metrics: adaptiveMetrics(40),
    preferences: prefs,
    deltaSeconds: 1,
    active: true,
    classify: () => ({ type: "gpu" as const, confidence: 0.6, evidence: [] }),
  });
  assert.equal(controller.reductionDepth, 1);
  controller.setBase(QUALITY_PROFILES.low);
  assert.equal(controller.reductionDepth, 0);
  assert.equal(controller.currentSettings().renderScale, QUALITY_PROFILES.low.renderScale);

  // revertLastChange undoes the most recent reduction on demand.
  controller.setBase(QUALITY_PROFILES.ultra);
  controller.update({
    metrics: adaptiveMetrics(40),
    preferences: prefs,
    deltaSeconds: 1,
    active: true,
    classify: () => ({ type: "gpu" as const, confidence: 0.6, evidence: [] }),
  });
  assert.equal(controller.reductionDepth, 1);
  const reverted = controller.revertLastChange();
  assert.equal(reverted?.kind, "increase");
  assert.equal(controller.reductionDepth, 0);
  assert.equal(controller.revertLastChange(), null); // nothing left to undo
});

check("adaptive quality: formatAdaptiveChange summarises reduce (with bottleneck) and raise", () => {
  assert.equal(
    formatAdaptiveChange(
      {
        kind: "reduce",
        rungId: "gtao-off",
        message: "Ambient occlusion off for performance.",
        bottleneck: { type: "gpu", confidence: 0.78, evidence: [] },
      },
      42,
    ),
    "last: gtao-off (gpu, conf 0.78, 42s)",
  );
  assert.equal(
    formatAdaptiveChange({ kind: "increase", rungId: "dof-off", message: "raised" }, 8),
    "last: dof-off (increase, 8s)",
  );
});
