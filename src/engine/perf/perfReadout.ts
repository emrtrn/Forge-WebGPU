// Ported from Forge WebGL src/scene/debugStats.ts (the pure formatters) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The `?debug` readout lines (plan phase 3 step 8): pure, DOM-free; the panel
// (render/viewer/debug) gathers the inputs and writes the text. The memory
// shapes come from Forge's RuntimeSceneApp / render-three/renderer.
import { formatAdaptiveChange } from "./adaptiveQuality.ts";
import type { WorldEnvironmentState } from "../environment/environmentResolve.ts";
import type { FrameMetrics, FrameSpikeCounts } from "./frameMetrics.ts";
import type { GpuFrameStats } from "./gpuFrameStats.ts";
import { formatByteSize, isOverBudget, type BudgetMetric } from "./perfBudget.ts";
import type { DrawingBufferSnapshot, SceneCostSnapshot } from "./sceneCost.ts";

/** GPU resource counts from `renderer.info` (for the `?debug` memory readout). */
export interface RenderMemoryStats {
  /** Live geometries retained on the GPU. */
  geometries: number;
  /** Live textures retained on the GPU. */
  textures: number;
  /** Compiled shader programs. */
  programs: number;
}

/**
 * Memory readout for the `?debug` overlay: GPU resource counts (always present)
 * plus the JS heap when the browser exposes `performance.memory` (Chrome-only).
 */
export interface PerfMemorySnapshot {
  render: RenderMemoryStats;
  /** `performance.memory.usedJSHeapSize` in bytes, or null off Chrome. */
  jsHeapBytes: number | null;
  /** `performance.memory.jsHeapSizeLimit` in bytes, or null off Chrome. */
  jsHeapLimitBytes: number | null;
}

/**
 * Formats {@link FrameMetrics} into an overlay line (pure, DOM-free for unit
 * tests): windowed average frame time, P95 and the spike count over the window.
 * Average + P95 together read "smooth on average, but does it hitch?" — the
 * reason frame time (not FPS) drives the adaptive quality controller.
 */
export function formatFrameMetrics(metrics: FrameMetrics): string[] {
  return [
    `frame ${metrics.averageFrameTimeMs.toFixed(1)}ms ` +
      `p95 ${metrics.p95FrameTimeMs.toFixed(1)} spikes ${metrics.spikeCount}`,
  ];
}

/**
 * Formats {@link FrameSpikeCounts} into an overlay line (pure, DOM-free for unit
 * tests). Read under the averaged `frame` line, which is exactly what it exists
 * to contradict: an average of 14 ms and four frames over 100 ms in the same
 * window is a smooth reading of a game that visibly hitches, and only this line
 * says so. The three thresholds are separate rather than summed because they are
 * different findings — a 35 ms frame is a dropped one, a 100 ms frame is a stall
 * the player feels.
 */
export function formatFrameSpikes(counts: FrameSpikeCounts): string[] {
  return [
    `stalls >33ms ${counts.over33ms} >50ms ${counts.over50ms} >100ms ${counts.over100ms}`,
  ];
}

/**
 * Formats the drawing buffer being shaded — CSS size times the effective pixel
 * ratio, which the quality profile caps and scales (pure, DOM-free).
 *
 * Here because it is the one input to per-pixel cost that no other line reports.
 * A frame whose cost survives deleting half the scene’s geometry is asking about
 * pixels, not content, and without this line "is this fill rate?" can only be
 * guessed at.
 */
export function formatDrawingBuffer(buffer: DrawingBufferSnapshot): string[] {
  const width = Math.round(buffer.width * buffer.pixelRatio);
  const height = Math.round(buffer.height * buffer.pixelRatio);
  return [
    `buffer ${groupThousands(width)}x${groupThousands(height)} ` +
      `ratio ${buffer.pixelRatio.toFixed(2)} ${compactCount(width * height)} px`,
  ];
}

/**
 * Formats a {@link SceneCostSnapshot} into overlay lines (pure, DOM-free).
 *
 * The graph line belongs next to the draw-call count because the pair is the
 * finding: a small draw count beside a large node count means the frame is being
 * *walked*, not submitted, and no amount of further batching would touch it.
 *
 * The shadow buckets follow because a shadowing light walks that same graph a
 * second time, and the bucket labels say which content is paying for it. Labels
 * come from the scene (see `sceneSourceOf`), never from a table in the engine —
 * the template has no content taxonomy of its own.
 */
export function formatSceneCost(snapshot: SceneCostSnapshot): string[] {
  const lines = [
    `graph ${groupThousands(snapshot.graph.objects)} nodes ` +
      `${groupThousands(snapshot.graph.meshes)} meshes (walked per pass)`,
  ];
  if (snapshot.shadows.length === 0) return lines;
  lines.push("shadow casters");
  const width = Math.max(...snapshot.shadows.map((bucket) => bucket.source.length));
  for (const bucket of snapshot.shadows) {
    lines.push(
      `  ${bucket.source.padEnd(width)} ${groupThousands(bucket.meshes)} mesh ` +
        `${compactCount(bucket.triangles)} tris`,
    );
  }
  return lines;
}

/** `1.24M` / `540K` / `812` — triangle and pixel counts are unreadable ungrouped. */
export function compactCount(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}K`;
  return groupThousands(value);
}

/**
 * Formats {@link GpuFrameStats} into an overlay line (pure, DOM-free for unit
 * tests). Read next to the `frame` line above it, this is the whole point of the
 * timer: CPU high + GPU low means the frame is bound by what we are issuing, the
 * reverse means it is bound by what we are asking the GPU to draw.
 *
 * The two numbers do NOT add up to the frame time and must not be presented as
 * though they did — they overlap, and vsync sits outside both. Browsers also
 * quantise the returned nanoseconds as a side-channel mitigation, so one decimal
 * is all the precision there is.
 */
export function formatGpuFrameStats(stats: GpuFrameStats): string[] {
  return [
    `gpu ${stats.lastMs.toFixed(1)}ms ` +
      `avg ${stats.averageMs.toFixed(1)} max ${stats.maxMs.toFixed(1)}`,
  ];
}

/**
 * Formats the adaptive quality state into overlay lines (pure, DOM-free for unit
 * tests): a `quality:` line with the player's profile, the adaptive on/off state
 * and the live reduction depth, plus a `last:` line describing the most recent
 * automatic change and its age (plan §13).
 */
export function formatAdaptiveQuality(snapshot: {
  qualityLevel: string;
  adaptiveEnabled: boolean;
  reductionDepth: number;
  lastChange: { record: Parameters<typeof formatAdaptiveChange>[0]; ageSeconds: number } | null;
}): string[] {
  const mode = snapshot.adaptiveEnabled ? "adaptive on" : "adaptive off";
  const depth = snapshot.reductionDepth > 0 ? ` -${snapshot.reductionDepth}` : "";
  const lines = [`quality: ${snapshot.qualityLevel} (${mode})${depth}`];
  if (snapshot.lastChange) {
    lines.push(formatAdaptiveChange(snapshot.lastChange.record, snapshot.lastChange.ageSeconds));
  }
  return lines;
}

/**
 * Formats a {@link PerfMemorySnapshot} into overlay lines (pure, DOM-free): GPU
 * geometry/texture/program counts, and the JS heap when the browser reports it
 * (Chrome-only); the heap line is omitted entirely off Chrome.
 */
export function formatMemory(snapshot: PerfMemorySnapshot): string[] {
  const { geometries, textures, programs } = snapshot.render;
  const lines = ["memory", `  geo ${geometries} tex ${textures} prog ${programs}`];
  if (snapshot.jsHeapBytes !== null) {
    const used = formatByteSize(snapshot.jsHeapBytes);
    const limit = snapshot.jsHeapLimitBytes !== null ? ` / ${formatByteSize(snapshot.jsHeapLimitBytes)}` : "";
    lines.push(`  heap ${used}${limit}`);
  }
  return lines;
}

/**
 * Formats budget rows into overlay lines (pure, DOM-free). Over-budget rows are
 * prefixed with `!` (the overlay is single-color plain text, so a marker is the
 * only affordance); the header gains an `(OVER)` tag when anything is over.
 */
export function formatPerfBudget(metrics: BudgetMetric[]): string[] {
  const lines = [isOverBudget(metrics) ? "budget (OVER)" : "budget"];
  for (const metric of metrics) {
    const marker = metric.over ? "!" : " ";
    lines.push(`${marker} ${metric.label} ${groupThousands(metric.value)}/${groupThousands(metric.budget)}`);
  }
  return lines;
}

/** Inserts thousands separators (deterministic, locale-independent for tests). */
export function groupThousands(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const negative = value < 0;
  const digits = Math.trunc(Math.abs(value)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

export function formatWorldEnvironment(state: WorldEnvironmentState): string {
  const minutes = Math.floor(state.hour * 60) % (24 * 60);
  const clock = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `world env: ${clock} ${state.season} ${state.weather.preset} ${state.weather.intensity.toFixed(2)}`;
}
