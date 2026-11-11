// Ported from Forge WebGL engine/perf/frameMetrics.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Pure frame-time aggregator (Adaptive Performance & Graphics Quality, Faz 1).
 *
 * Side-effect free: no DOM, no three.js, no clock of its own. The runtime frame
 * loop measures each frame's **raw rAF delta — before the simulation clamp** —
 * and feeds the elapsed milliseconds here via {@link FrameMetricsMonitor.record};
 * this class keeps a time-bounded ring of samples and derives windowed
 * averages, P95 and spike counts on demand. Because it only takes
 * already-measured numbers (the {@link SubsystemProfiler} contract), it is fully
 * deterministic and unit-tested without a real clock.
 *
 * Unlike {@link SubsystemProfiler}, this monitor stays **on in production** — the
 * adaptive quality controller depends on it. The cost per frame is one ring
 * write plus a running counter, so the hot path stays cheap; the O(n) work
 * (percentile sort) only happens in {@link FrameMetricsMonitor.metrics}, which
 * the overlay (500 ms) and the adaptive controller (seconds) read rarely.
 *
 * Browser gotchas the frame loop must honour (see the plan §3.1), not this pure
 * core: feed the **pre-clamp** delta, and call {@link FrameMetricsMonitor.reset}
 * on `visibilitychange` so a backgrounded tab's giant catch-up delta is not
 * mistaken for a spike.
 */

/** The §7.1 frame-metrics shape the adaptive controller and overlay both read. */
export interface FrameMetrics {
  /** Last recorded raw frame delta (ms). */
  readonly frameTimeMs: number;
  /** Mean frame time across the queried window (ms). */
  readonly averageFrameTimeMs: number;
  /** 95th-percentile frame time across the window (nearest-rank, ms). */
  readonly p95FrameTimeMs: number;
  /** Frames over the spike threshold within the window. */
  readonly spikeCount: number;
  /** Actual span the window covers (ramps up to the requested seconds). */
  readonly sampleWindowSeconds: number;
  /** Samples that fell inside the window. */
  readonly sampleCount: number;
  /**
   * Estimated monitor refresh interval (ms) — a low percentile of recent frame
   * times, i.e. the "best case" cadence. Lets a caller read a 16.7 ms target on
   * a 120 Hz panel as "one frame per two vsyncs", not a failure (plan §3.1).
   */
  readonly estimatedRefreshIntervalMs: number;
}

/** Spike tallies at the three plan thresholds (§7.1), over the queried window. */
export interface FrameSpikeCounts {
  /** Frames slower than 33.3 ms (below 30 FPS). */
  readonly over33ms: number;
  /** Frames slower than 50 ms (below 20 FPS). */
  readonly over50ms: number;
  /** Frames slower than 100 ms (major hitch). */
  readonly over100ms: number;
}

export interface FrameMetricsOptions {
  /** Default query window (seconds) — the adaptive decision window. */
  readonly windowSeconds?: number;
  /** Longest span retained; older samples are dropped. */
  readonly maxWindowSeconds?: number;
  /** Frame time (ms) counted as a spike in {@link FrameMetrics.spikeCount}. */
  readonly spikeThresholdMs?: number;
  /** Percentile (0–1) used to estimate the refresh interval. */
  readonly refreshPercentile?: number;
}

/** 30 FPS frame budget — the default spike threshold. */
export const DEFAULT_SPIKE_THRESHOLD_MS = 33.3;
const DEFAULT_WINDOW_SECONDS = 5;
const DEFAULT_MAX_WINDOW_SECONDS = 30;
const DEFAULT_REFRESH_PERCENTILE = 0.05;

/**
 * Time-bounded ring of frame-time samples. Retains up to `maxWindowSeconds` of
 * frames (sized for the highest plausible refresh so nothing in-window is lost),
 * overwriting the oldest once full. Reads walk newest→oldest until the requested
 * window is covered, so `record` stays O(1) and only the rare `metrics` call
 * pays for the walk + percentile sort.
 */
export class FrameMetricsMonitor {
  private readonly windowSeconds: number;
  private readonly spikeThresholdMs: number;
  private readonly refreshPercentile: number;
  private readonly capacity: number;

  private readonly buf: Float64Array;
  private head = 0;
  private filled = 0;
  private lastFrameTimeMs = 0;
  private totalFrames = 0;

  constructor(options: FrameMetricsOptions = {}) {
    this.windowSeconds = Math.max(0.001, options.windowSeconds ?? DEFAULT_WINDOW_SECONDS);
    const maxWindow = Math.max(this.windowSeconds, options.maxWindowSeconds ?? DEFAULT_MAX_WINDOW_SECONDS);
    this.spikeThresholdMs = options.spikeThresholdMs ?? DEFAULT_SPIKE_THRESHOLD_MS;
    this.refreshPercentile = clamp01(options.refreshPercentile ?? DEFAULT_REFRESH_PERCENTILE);
    // Cover the full retained span even on a 240 Hz panel (≈4.17 ms frames),
    // with headroom, so no in-window sample is overwritten before it ages out.
    this.capacity = Math.max(64, Math.ceil((maxWindow * 1000) / 4) + 64);
    this.buf = new Float64Array(this.capacity);
  }

  /**
   * Records one frame's **raw** delta in milliseconds (pre-clamp, per §3.1).
   * Negative deltas (clock skew) clamp to zero; non-finite deltas are dropped so
   * a single bad sample cannot poison the windows.
   */
  record(rawDeltaMs: number): void {
    if (!Number.isFinite(rawDeltaMs)) return;
    const sample = rawDeltaMs > 0 ? rawDeltaMs : 0;
    this.buf[this.head] = sample;
    this.head = (this.head + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled += 1;
    this.lastFrameTimeMs = sample;
    this.totalFrames += 1;
  }

  /** Clears every sample and counters (call on `visibilitychange`, §3.1). */
  reset(): void {
    this.head = 0;
    this.filled = 0;
    this.lastFrameTimeMs = 0;
    // totalFrames is a lifetime counter for diagnostics; keep it monotonic.
  }

  /** Total frames recorded since construction (survives {@link reset}). */
  get frames(): number {
    return this.totalFrames;
  }

  /** Last recorded raw frame delta (ms). */
  get lastFrameMs(): number {
    return this.lastFrameTimeMs;
  }

  /**
   * Windowed {@link FrameMetrics} over the most recent `seconds` of frames
   * (defaults to the configured decision window). `spikeThresholdMs` overrides
   * the frame time counted as a spike. Returns zeros when no samples exist yet.
   */
  metrics(seconds: number = this.windowSeconds, spikeThresholdMs: number = this.spikeThresholdMs): FrameMetrics {
    const window = this.collectWindow(seconds);
    if (window.length === 0) {
      return {
        frameTimeMs: this.lastFrameTimeMs,
        averageFrameTimeMs: 0,
        p95FrameTimeMs: 0,
        spikeCount: 0,
        sampleWindowSeconds: 0,
        sampleCount: 0,
        estimatedRefreshIntervalMs: 0,
      };
    }
    let sum = 0;
    let spikes = 0;
    for (const dt of window) {
      sum += dt;
      if (dt > spikeThresholdMs) spikes += 1;
    }
    const sorted = Float64Array.from(window).sort();
    return {
      frameTimeMs: this.lastFrameTimeMs,
      averageFrameTimeMs: sum / window.length,
      p95FrameTimeMs: percentile(sorted, 0.95),
      spikeCount: spikes,
      sampleWindowSeconds: sum / 1000,
      sampleCount: window.length,
      estimatedRefreshIntervalMs: percentile(sorted, this.refreshPercentile),
    };
  }

  /** Spike tallies at 33.3 / 50 / 100 ms over the most recent `seconds`. */
  spikeCounts(seconds: number = this.windowSeconds): FrameSpikeCounts {
    const window = this.collectWindow(seconds);
    let over33 = 0;
    let over50 = 0;
    let over100 = 0;
    for (const dt of window) {
      if (dt > 33.3) over33 += 1;
      if (dt > 50) over50 += 1;
      if (dt > 100) over100 += 1;
    }
    return { over33ms: over33, over50ms: over50, over100ms: over100 };
  }

  /**
   * Collects the most recent samples whose cumulative time is within `seconds`,
   * newest→oldest, then returned oldest→newest. The newest sample is always
   * included even if it alone exceeds the window (so a lone 200 ms hitch still
   * reports).
   */
  private collectWindow(seconds: number): number[] {
    const budgetMs = Math.max(0, seconds) * 1000;
    const out: number[] = [];
    let coveredMs = 0;
    for (let k = 0; k < this.filled; k += 1) {
      const index = (this.head - 1 - k + this.capacity) % this.capacity;
      const dt = this.buf[index]!;
      out.push(dt);
      coveredMs += dt;
      if (coveredMs >= budgetMs) break;
    }
    out.reverse();
    return out;
  }
}

/** Nearest-rank percentile of an ascending-sorted array (0–1 fraction). */
function percentile(sortedAscending: ArrayLike<number>, fraction: number): number {
  const n = sortedAscending.length;
  if (n === 0) return 0;
  const rank = Math.ceil(clamp01(fraction) * n);
  const index = Math.min(n - 1, Math.max(0, rank - 1));
  return sortedAscending[index]!;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
