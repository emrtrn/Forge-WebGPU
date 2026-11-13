// Ported from Forge WebGL engine/perf/hardwareHints.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Pure startup calibration: hardware hints + first-gameplay measurement step
 * (Adaptive Performance & Graphics Quality, Faz 4).
 *
 * Side-effect free: no DOM, no navigator, no three.js. The browser signals are
 * **injected** ({@link HardwareHintInputs}) by a thin `src/scene` adapter that
 * reads `navigator` / `screen` / the WebGL debug-renderer string; this module
 * only reasons over already-collected numbers, so it is deterministic and
 * unit-tested without a browser.
 *
 * Two one-time decisions live here (plan §4, §9):
 *
 * 1. {@link suggestStartingQualityLevel} — turn coarse hardware hints into a
 *    sensible **starting** profile. Hardware data is unreliable (plan §2), so the
 *    result is a low-confidence hint, never a final verdict; with no signals at
 *    all it defaults to Medium.
 * 2. {@link calibrateFromMeasurement} — after the first few seconds of real
 *    gameplay (warm-up spikes already excluded by the adapter's sampling window),
 *    nudge the profile **one step** up or down from the measured frame time. This
 *    is the "measurement beats hardware" principle: the real frame time decides.
 *
 * The player's manual profile choice always overrides both — that gate lives in
 * the adapter (it never calls these once the player has chosen), not here.
 */

import type { FrameMetrics } from "./frameMetrics.ts";
import { QUALITY_LEVELS, type QualityLevel } from "./qualityProfiles.ts";

/** A concrete (non-custom) profile — the only thing calibration selects. */
/** A rung of the ladder: neither `custom` nor Cinematic (off the ladder, the player's pick only). */
export type ConcreteQualityLevel = Exclude<QualityLevel, "custom" | "cinematic">;

/**
 * Coarse browser signals for the starting-profile hint. Every field is optional:
 * browsers reduce, round or omit these for privacy (plan §2), and the hint must
 * work with any subset — including none.
 */
export interface HardwareHintInputs {
  /** `navigator.hardwareConcurrency` (logical CPU cores). */
  hardwareConcurrency?: number | null;
  /** `navigator.deviceMemory` (approx GB, Chrome-only, capped at 8). */
  deviceMemoryGb?: number | null;
  /** Screen width in CSS pixels. */
  screenWidth?: number | null;
  /** Screen height in CSS pixels. */
  screenHeight?: number | null;
  /** `window.devicePixelRatio`. */
  devicePixelRatio?: number | null;
  /** Touch / mobile device hint (coarse pointer or UA data). */
  isTouch?: boolean | null;
  /** `WEBGL_debug_renderer_info` UNMASKED_RENDERER string, if exposed. */
  webglRenderer?: string | null;
}

/** A hardware-derived starting hint with its confidence and human-readable why. */
export interface HardwareHintResult {
  /** Suggested starting profile. */
  readonly level: ConcreteQualityLevel;
  /** 0–1 confidence; capped low because hardware data is unreliable (plan §2). */
  readonly confidence: number;
  /** Short signals that fed the decision (for the debug overlay / log). */
  readonly evidence: readonly string[];
}

/** Direction the profile ladder is stepped (`up` = better, `down` = cheaper). */
export type QualityStepDirection = "up" | "down" | "none";

/** Inputs to the one-time first-gameplay measurement adjustment. */
export interface MeasurementCalibrationInput {
  /** The profile currently applied (the hint's result, or a restored profile). */
  readonly currentLevel: ConcreteQualityLevel;
  /** Frame metrics over a warm-up-excluded window (the adapter guarantees this). */
  readonly metrics: FrameMetrics;
  /** The player's frame-time target (60 = smooth, 30 = weak-device floor). */
  readonly targetFrameRate: 30 | 60;
}

/** Result of {@link calibrateFromMeasurement}: the (possibly unchanged) profile. */
export interface MeasurementCalibrationResult {
  readonly level: ConcreteQualityLevel;
  readonly direction: QualityStepDirection;
  /** True only when `level` differs from the input `currentLevel`. */
  readonly changed: boolean;
  /** Short reason (for the debug overlay / status message). */
  readonly reason: string;
}

/** Frame-time budgets per target (ms), matching the adaptive controller (§9). */
const TARGET_FRAME_TIME_MS: Record<30 | 60, number> = { 30: 33.3, 60: 16.7 };

/** Below this many in-window samples, measurement calibration declines to act. */
const MIN_CALIBRATION_SAMPLES = 30;

/**
 * Steps a concrete profile one rung along the {@link QUALITY_LEVELS} ladder
 * (`ultra → high → medium → low`). `up` moves toward higher quality, `down`
 * toward cheaper; both clamp at the ends (Ultra can't step up, Low can't step
 * down). `none` returns the input unchanged.
 */
export function stepQualityLevel(
  level: ConcreteQualityLevel,
  direction: QualityStepDirection,
): ConcreteQualityLevel {
  if (direction === "none") return level;
  const index = QUALITY_LEVELS.indexOf(level);
  if (index < 0) return level;
  const next = direction === "up" ? index - 1 : index + 1;
  const clamped = Math.min(QUALITY_LEVELS.length - 1, Math.max(0, next));
  return QUALITY_LEVELS[clamped]!;
}

/**
 * Coarse hardware → starting profile hint. Each signal casts a small vote; the
 * summed score maps to a profile. A software renderer (SwiftShader / llvmpipe)
 * is treated as decisive (it dominates the score). With no signals at all the
 * score is zero → Medium, the plan's neutral starting point (§4).
 *
 * These votes are intentionally conservative: the hint only needs to keep a
 * fresh player off the extremes; {@link calibrateFromMeasurement} refines it
 * from real frame time a few seconds later.
 */
export function suggestStartingQualityLevel(inputs: HardwareHintInputs): HardwareHintResult {
  let score = 0;
  let signals = 0;
  const evidence: string[] = [];

  const cores = finiteOrNull(inputs.hardwareConcurrency);
  if (cores !== null) {
    signals += 1;
    if (cores <= 2) {
      score -= 2;
      evidence.push(`cpu ${cores} cores`);
    } else if (cores <= 4) {
      score -= 1;
      evidence.push(`cpu ${cores} cores`);
    } else if (cores >= 16) {
      score += 2;
      evidence.push(`cpu ${cores} cores`);
    } else if (cores >= 8) {
      score += 1;
      evidence.push(`cpu ${cores} cores`);
    }
  }

  const memory = finiteOrNull(inputs.deviceMemoryGb);
  if (memory !== null) {
    signals += 1;
    if (memory <= 2) {
      score -= 2;
      evidence.push(`ram ~${memory}GB`);
    } else if (memory <= 4) {
      score -= 1;
      evidence.push(`ram ~${memory}GB`);
    } else if (memory >= 8) {
      score += 1;
      evidence.push(`ram ~${memory}GB`);
    }
  }

  if (inputs.isTouch === true) {
    signals += 1;
    score -= 2;
    evidence.push("touch/mobile");
  }

  // Very high pixel budget (4K / retina) means more pixels to push; a mild
  // downward nudge, never dominant (a capable GPU usually ships with it).
  const width = finiteOrNull(inputs.screenWidth);
  const height = finiteOrNull(inputs.screenHeight);
  const dpr = finiteOrNull(inputs.devicePixelRatio);
  if (width !== null && height !== null) {
    signals += 1;
    const pixels = width * height * (dpr && dpr > 0 ? dpr * dpr : 1);
    if (pixels >= 3840 * 2160) {
      score -= 1;
      evidence.push("high pixel budget");
    }
  }

  const gpu = classifyRenderer(inputs.webglRenderer);
  if (gpu.tier !== "unknown") {
    signals += 1;
    score += gpu.delta;
    evidence.push(gpu.label);
  }

  const level = scoreToLevel(score);
  // Hardware confidence stays low (plan §2); a software renderer is the one
  // near-certain signal, so it earns a higher floor.
  const confidence = gpu.tier === "software"
    ? 0.75
    : Math.min(0.6, 0.1 * signals + (gpu.tier === "discrete" ? 0.15 : 0));
  return { level, confidence, evidence };
}

/**
 * One-time first-gameplay adjustment: compares the measured average frame time
 * to the target and steps the profile at most one rung. Steps **down** when the
 * frame is well over budget (avg > target × 1.25); steps **up** only with real
 * headroom (avg < target × 0.75 *and* P95 within target × 1.1, so a smooth
 * average isn't undone by hitches). Otherwise holds. Declines (holds) with too
 * few samples — the caller should only invoke it on a settled window.
 */
export function calibrateFromMeasurement(
  input: MeasurementCalibrationInput,
): MeasurementCalibrationResult {
  const { currentLevel, metrics, targetFrameRate } = input;
  const targetMs = TARGET_FRAME_TIME_MS[targetFrameRate];
  const hold = (reason: string): MeasurementCalibrationResult => ({
    level: currentLevel,
    direction: "none",
    changed: false,
    reason,
  });

  if (metrics.sampleCount < MIN_CALIBRATION_SAMPLES) {
    return hold("insufficient samples");
  }

  const avg = metrics.averageFrameTimeMs;
  const p95 = metrics.p95FrameTimeMs;

  let direction: QualityStepDirection = "none";
  let reason = `avg ${avg.toFixed(1)}ms at ${targetFrameRate} FPS target`;
  if (avg > targetMs * 1.25) {
    direction = "down";
    reason = `avg ${avg.toFixed(1)}ms over budget → lower`;
  } else if (avg < targetMs * 0.75 && p95 < targetMs * 1.1) {
    direction = "up";
    reason = `avg ${avg.toFixed(1)}ms headroom → raise`;
  }

  const level = stepQualityLevel(currentLevel, direction);
  const changed = level !== currentLevel;
  return {
    level,
    // A step that clamps at the ladder end is a no-op; report it as held.
    direction: changed ? direction : "none",
    changed,
    reason: changed ? reason : `${reason} (held)`,
  };
}

type RendererTier = "software" | "integrated" | "mobile" | "discrete" | "unknown";

/** Classifies a WEBGL_debug_renderer_info string into a coarse GPU tier + vote. */
function classifyRenderer(renderer: string | null | undefined): {
  tier: RendererTier;
  delta: number;
  label: string;
} {
  if (typeof renderer !== "string" || renderer.trim().length === 0) {
    return { tier: "unknown", delta: 0, label: "" };
  }
  const r = renderer.toLowerCase();
  if (r.includes("swiftshader") || r.includes("llvmpipe") || r.includes("software")) {
    return { tier: "software", delta: -4, label: "software renderer" };
  }
  // Discrete markers first — an Intel Arc is discrete despite the vendor name.
  if (
    r.includes("rtx") ||
    r.includes("geforce") ||
    r.includes("radeon rx") ||
    r.includes("quadro") ||
    r.includes("intel arc") ||
    r.includes("(tm) arc")
  ) {
    return { tier: "discrete", delta: 2, label: "discrete gpu" };
  }
  if (r.includes("mali") || r.includes("adreno") || r.includes("powervr")) {
    return { tier: "mobile", delta: -1, label: "mobile gpu" };
  }
  if (
    r.includes("intel") ||
    r.includes("uhd graphics") ||
    r.includes("hd graphics") ||
    r.includes("iris")
  ) {
    return { tier: "integrated", delta: -1, label: "integrated gpu" };
  }
  return { tier: "unknown", delta: 0, label: "" };
}

/** Maps the summed hint score to a starting profile (thresholds per §4). */
function scoreToLevel(score: number): ConcreteQualityLevel {
  if (score >= 3) return "ultra";
  if (score >= 1) return "high";
  if (score >= -1) return "medium";
  return "low";
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
