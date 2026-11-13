// The runtime quality driver (plan phase 3, step 2): Forge WebGL's quality
// wiring from src/scene/RuntimeSceneApp.ts, out of the god class and over the
// ported pure modules (engine/perf/{qualityProfiles,hardwareHints,
// adaptiveQuality}, engine/persistence/userSettingsStore). Same rules:
//
// - The player's stored graphics preferences pick the base profile.
// - A fresh player (no manual pick, never calibrated) starts on a hardware
//   hinted profile, and after STARTUP_CALIBRATION_SECONDS of play one
//   measurement step nudges it at most one rung; the result is remembered.
// - The adaptive controller ticks every ADAPTIVE_TICK_INTERVAL_SECONDS once
//   calibration is done, when the player allows it; it only lowers below the
//   base and restores up to it, and never writes the stored profile.
// - Another tab changing the stored profile (the editor's quality menu) applies
//   live when it is a manual pick.
//
// Differences from Forge: there is no input mode yet, so every second counts as
// gameplay (the level viewer); the GPU string for the hardware hint is the
// WebGPU adapter's (vendor / architecture / description), coarser than WebGL's
// unmasked renderer string. Quality applies the pixel ratio for now; shadows
// (step 3) and post process (step 6) read the same settings when they come.

import { classifyBottleneck, type BottleneckResult } from "../../engine/perf/bottleneckClassifier.ts";
import type { FrameMetrics } from "../../engine/perf/frameMetrics.ts";
import { calibrateFromMeasurement, suggestStartingQualityLevel, type ConcreteQualityLevel, type HardwareHintInputs } from "../../engine/perf/hardwareHints.ts";
import { AdaptiveQualityController } from "../../engine/perf/adaptiveQuality.ts";
import { evaluatePerfBudget } from "../../engine/perf/perfBudget.ts";
import { resolveQualitySettings, type GraphicsPreferences, type QualityLevel, type QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { defaultUserSettings, type UserSettings, type UserSettingsStore } from "../../engine/persistence/userSettingsStore.ts";

/** Forge's warm-up before the one-time measurement (RuntimeSceneApp). */
export const STARTUP_CALIBRATION_SECONDS = 12;
/** Forge's adaptive cadence: trends, not frames. */
export const ADAPTIVE_TICK_INTERVAL_SECONDS = 0.5;

/** What the driver hands the renderer, and the perf witness reads. */
export interface QualityState {
  readonly settings: QualitySettings;
  /** The player's (or calibrated) profile; adaptive reductions do not change it. */
  readonly level: QualityLevel;
  readonly adaptive: boolean;
  /** Adaptive rungs currently layered below the base. */
  readonly reductionDepth: number;
}

export interface FrameSignals {
  readonly metrics: FrameMetrics;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly textures: number;
}

export interface RuntimeQualityOptions {
  /** Null when the page has no storage: defaults, nothing persisted. */
  readonly store: UserSettingsStore | null;
  /** Called with every change of the effective settings, the first time from `start`. */
  readonly apply: (state: QualityState) => void;
  /** Recent frame signals (the host's perf sampler). */
  readonly signals: () => FrameSignals;
  readonly log?: (message: string) => void;
}

export interface RuntimeQuality {
  /** Resolves the stored profile, runs the hardware hint for a fresh player and applies. */
  start(hints: HardwareHintInputs): void;
  /** Once per frame, seconds since the last. */
  tick(deltaSeconds: number): void;
  /** The stored settings changed elsewhere (a `storage` event on the settings key). */
  storageChanged(): void;
  readonly state: QualityState;
  readonly preferences: GraphicsPreferences;
}

const isConcrete = (level: QualityLevel): level is ConcreteQualityLevel => level !== "custom";

export function createRuntimeQuality(options: RuntimeQualityOptions): RuntimeQuality {
  const { store } = options;
  let user: UserSettings = store?.read() ?? defaultUserSettings();
  let settings = resolveQualitySettings(user.graphics.selectedQualityLevel, user.graphics.customSettings);
  const controller = new AdaptiveQualityController(settings);
  let calibrationElapsed: number | null = null;
  let adaptiveAccumulator = 0;

  const state = (): QualityState => ({
    settings,
    level: user.graphics.selectedQualityLevel,
    adaptive: user.graphics.adaptiveOptimizationEnabled,
    reductionDepth: controller.reductionDepth,
  });
  const push = (): void => options.apply(state());
  const setGraphics = (graphics: GraphicsPreferences): void => {
    user = { ...user, graphics };
    store?.setGraphics(graphics);
  };
  const applyProfile = (base: QualitySettings): void => {
    settings = base;
    controller.setBase(base);
    push();
  };

  const classify = (): BottleneckResult => {
    const signals = options.signals();
    if (signals.metrics.sampleCount === 0) return { type: "unknown", confidence: 0.2, evidence: ["no signal"] };
    return classifyBottleneck({
      metrics: signals.metrics,
      subsystems: null,
      budget: evaluatePerfBudget({ drawCalls: signals.drawCalls, triangles: signals.triangles, textures: signals.textures }),
      targetFrameTimeMs: user.graphics.targetFrameRate === 30 ? 33.3 : 16.7,
    });
  };

  const measure = (): void => {
    const g = user.graphics;
    const current: ConcreteQualityLevel = isConcrete(g.selectedQualityLevel) ? g.selectedQualityLevel : "medium";
    const result = calibrateFromMeasurement({ currentLevel: current, metrics: options.signals().metrics, targetFrameRate: g.targetFrameRate });
    // Concrete measured level: any stale customSettings is dropped.
    setGraphics({
      adaptiveOptimizationEnabled: g.adaptiveOptimizationEnabled,
      targetFrameRate: g.targetFrameRate,
      selectedQualityLevel: result.level,
      allowAdaptiveFineTuning: g.allowAdaptiveFineTuning,
      manuallySelected: g.manuallySelected,
      startupCalibrated: true,
    });
    if (result.changed) {
      applyProfile(resolveQualitySettings(result.level));
      options.log?.(`Auto quality ${result.direction === "up" ? "raised" : "lowered"} to ${result.level}.`);
    }
  };

  return {
    start(hints) {
      const g = user.graphics;
      if (!g.manuallySelected && !g.startupCalibrated) {
        const hint = suggestStartingQualityLevel(hints);
        if (hint.level !== g.selectedQualityLevel) {
          setGraphics({
            adaptiveOptimizationEnabled: g.adaptiveOptimizationEnabled,
            targetFrameRate: g.targetFrameRate,
            selectedQualityLevel: hint.level,
            allowAdaptiveFineTuning: g.allowAdaptiveFineTuning,
            manuallySelected: g.manuallySelected,
            startupCalibrated: g.startupCalibrated,
          });
          settings = resolveQualitySettings(hint.level);
          controller.setBase(settings);
        }
        calibrationElapsed = 0;
      }
      push();
    },
    tick(deltaSeconds) {
      if (calibrationElapsed !== null) {
        const g = user.graphics;
        if (g.manuallySelected || g.startupCalibrated) {
          calibrationElapsed = null;
        } else {
          calibrationElapsed += deltaSeconds;
          if (calibrationElapsed >= STARTUP_CALIBRATION_SECONDS) {
            calibrationElapsed = null;
            measure();
          }
          return;
        }
      }
      adaptiveAccumulator += deltaSeconds;
      if (adaptiveAccumulator < ADAPTIVE_TICK_INTERVAL_SECONDS) return;
      const dt = adaptiveAccumulator;
      adaptiveAccumulator = 0;
      const g = user.graphics;
      const update = controller.update({
        metrics: options.signals().metrics,
        preferences: g,
        deltaSeconds: dt,
        active: g.adaptiveOptimizationEnabled && (!g.manuallySelected || g.allowAdaptiveFineTuning),
        classify,
      });
      if (update.kind === "none" || !update.settings) return;
      settings = update.settings;
      push();
      if (update.change) options.log?.(update.change.message);
    },
    storageChanged() {
      const next = store?.read().graphics;
      if (!next) return;
      const previous = user.graphics;
      if (
        next.selectedQualityLevel === previous.selectedQualityLevel &&
        next.manuallySelected === previous.manuallySelected &&
        JSON.stringify(next.customSettings) === JSON.stringify(previous.customSettings)
      ) {
        return;
      }
      user = { ...user, graphics: next };
      if (next.manuallySelected) {
        calibrationElapsed = null;
        applyProfile(resolveQualitySettings(next.selectedQualityLevel, next.customSettings));
      }
    },
    get state() {
      return state();
    },
    get preferences() {
      return user.graphics;
    },
  };
}
