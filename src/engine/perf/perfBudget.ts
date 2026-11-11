// Ported from Forge WebGL engine/perf/perfBudget.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Pure performance-budget evaluation (Performance Infrastructure, P5.3).
 *
 * Side-effect free: no DOM, no three.js. The `?debug` overlay collects live
 * render/memory counters, calls {@link evaluatePerfBudget}, and highlights any
 * metric that exceeds its threshold. Budgets are plain template defaults kept in
 * code (the simple option from the P5 plan) — a fork tunes {@link DEFAULT_PERF_BUDGET}
 * or passes its own {@link PerfBudget} rather than the engine reading a manifest.
 *
 * The thresholds are informational, not enforced: nothing throws or fails a
 * build when a scene runs over budget; the overlay just flags which counter is
 * the likely cost so "it got slow — but where?" is answerable from `?debug`.
 */

export interface PerfBudget {
  /** Draw calls per frame before the overlay flags rendering as a suspect. */
  readonly drawCalls: number;
  /** Triangles per frame before the overlay flags geometry density. */
  readonly triangles: number;
  /** Live GPU textures before the overlay flags texture memory. */
  readonly textures: number;
}

/**
 * Template defaults, sized for the small single-scene games this platform ships.
 * Deliberately generous so they flag a genuine blow-out, not routine content;
 * forks with heavier scenes raise them.
 */
export const DEFAULT_PERF_BUDGET: PerfBudget = {
  drawCalls: 500,
  triangles: 1_000_000,
  textures: 128,
};

/** Live counters measured this frame, compared against a {@link PerfBudget}. */
export interface PerfMetrics {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly textures: number;
}

export interface BudgetMetric {
  readonly key: keyof PerfBudget;
  /** Short overlay label ("draw calls", "tris", "textures"). */
  readonly label: string;
  readonly value: number;
  readonly budget: number;
  /** True when `value > budget` — the overlay marks the line. */
  readonly over: boolean;
}

const METRIC_LABELS: Record<keyof PerfBudget, string> = {
  drawCalls: "draw calls",
  triangles: "tris",
  textures: "textures",
};

/**
 * Compares each metric against its budget, in a fixed order (draw calls, tris,
 * textures). Pure and total — every budget key produces a row so the overlay can
 * render a stable block whether or not anything is over.
 */
export function evaluatePerfBudget(
  metrics: PerfMetrics,
  budget: PerfBudget = DEFAULT_PERF_BUDGET,
): BudgetMetric[] {
  const keys: Array<keyof PerfBudget> = ["drawCalls", "triangles", "textures"];
  return keys.map((key) => {
    const value = metrics[key];
    const limit = budget[key];
    return { key, label: METRIC_LABELS[key], value, budget: limit, over: value > limit };
  });
}

/** True when any metric is over budget (drives an overlay header marker). */
export function isOverBudget(metrics: BudgetMetric[]): boolean {
  return metrics.some((metric) => metric.over);
}

/**
 * Formats a byte count as a compact human-readable size (e.g. "1.4 MB").
 * Pure, unit-tested; used for the JS-heap readout when `performance.memory` is
 * available (Chrome-only). Uses decimal (1000) units to match DevTools.
 */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
