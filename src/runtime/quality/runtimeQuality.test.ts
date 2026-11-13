import { describe, expect, test } from "vitest";
import type { FrameMetrics } from "../../engine/perf/frameMetrics.ts";
import { defaultGraphicsPreferences, resolveQualitySettings, type GraphicsPreferences } from "../../engine/perf/qualityProfiles.ts";
import { createMemoryStorageAdapter } from "../../engine/persistence/saveGameStore.ts";
import { UserSettingsStore } from "../../engine/persistence/userSettingsStore.ts";
import { createRuntimeQuality, STARTUP_CALIBRATION_SECONDS, type FrameSignals, type QualityState } from "./runtimeQuality.ts";

const metrics = (averageFrameTimeMs: number): FrameMetrics => ({
  frameTimeMs: averageFrameTimeMs,
  averageFrameTimeMs,
  p95FrameTimeMs: averageFrameTimeMs,
  spikeCount: 0,
  sampleWindowSeconds: 5,
  sampleCount: 300,
  estimatedRefreshIntervalMs: 16.7,
});

/** A desktop with a discrete GPU: Forge's hint lands above Medium. */
const STRONG = { hardwareConcurrency: 16, deviceMemoryGb: 8, screenWidth: 2560, screenHeight: 1440, devicePixelRatio: 1, isTouch: false, webglRenderer: "NVIDIA GeForce RTX 3070" };

function harness(graphics: Partial<GraphicsPreferences> = {}, frameMs = 10) {
  const store = new UserSettingsStore({ storage: createMemoryStorageAdapter() });
  store.setGraphics({ ...defaultGraphicsPreferences(), ...graphics });
  const applied: QualityState[] = [];
  const frame = { ms: frameMs };
  const signals = (): FrameSignals => ({ metrics: metrics(frame.ms), drawCalls: 10, triangles: 1000, textures: 2 });
  const quality = createRuntimeQuality({ store, apply: (state) => applied.push(state), signals });
  const run = (seconds: number): void => {
    for (let t = 0; t < seconds; t += 0.1) quality.tick(0.1);
  };
  return { store, applied, frame, quality, run };
}

describe("runtime quality driver", () => {
  test("a fresh player starts on the hardware hint, then one measurement is remembered", () => {
    const { store, applied, quality, run } = harness();
    quality.start(STRONG);
    expect(applied).toHaveLength(1);
    const hinted = applied[0]!.level;
    expect(hinted).not.toBe("medium");
    expect(store.read().graphics.selectedQualityLevel).toBe(hinted);
    expect(store.read().graphics.startupCalibrated).toBe(false);
    run(STARTUP_CALIBRATION_SECONDS + 0.5);
    expect(store.read().graphics.startupCalibrated).toBe(true);
    expect(store.read().graphics.manuallySelected).toBe(false);
  });

  test("a manual pick is kept: no hint, no calibration", () => {
    const { store, applied, quality, run } = harness({ selectedQualityLevel: "low", manuallySelected: true, allowAdaptiveFineTuning: false });
    quality.start(STRONG);
    run(STARTUP_CALIBRATION_SECONDS + 1);
    expect(applied.map((state) => state.level)).toEqual(["low"]);
    expect(applied[0]!.settings).toEqual(resolveQualitySettings("low"));
    expect(store.read().graphics.startupCalibrated).toBe(false);
  });

  test("sustained load lowers below the base without touching the stored profile", () => {
    const { store, applied, quality, run } = harness({ selectedQualityLevel: "high", manuallySelected: true }, 40);
    quality.start(STRONG);
    run(1);
    expect(applied.length).toBeGreaterThan(1);
    const reduced = applied.at(-1)!;
    expect(reduced.reductionDepth).toBe(1);
    expect(reduced.level).toBe("high");
    expect(reduced.settings).not.toEqual(resolveQualitySettings("high"));
    expect(store.read().graphics.selectedQualityLevel).toBe("high");
  });

  test("adaptive off holds the profile under load", () => {
    const { applied, quality, run } = harness({ selectedQualityLevel: "high", manuallySelected: true, adaptiveOptimizationEnabled: false }, 40);
    quality.start(STRONG);
    run(30);
    expect(applied.map((state) => state.reductionDepth)).toEqual([0]);
  });

  test("a manual pick from another tab applies live", () => {
    const { store, applied, quality } = harness({ selectedQualityLevel: "high", manuallySelected: true });
    quality.start(STRONG);
    store.setGraphics({ ...store.read().graphics, selectedQualityLevel: "medium", manuallySelected: true });
    quality.storageChanged();
    expect(applied.at(-1)!.level).toBe("medium");
    expect(applied.at(-1)!.settings).toEqual(resolveQualitySettings("medium"));
    quality.storageChanged();
    expect(applied).toHaveLength(2);
  });
});
