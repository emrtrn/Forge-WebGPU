// The perf witness on the canvas (`data-forge-perf`, architecture §4.9): the
// Phase 0 harness fields from the ported `engine/perf/perfWitness`, sampled
// every half second, never per frame. Frame times are rAF intervals (raw,
// before the world clamps them); GPU time comes from timestamp queries,
// resolved one frame at a time, null where the device has none: every render
// of the frame (scene pass, screen-space passes, the pipeline's output).
// Host fields (the pipeline's passes and MRT, the MRT probe) ride in `extra`.

import { TimestampQuery, type WebGPURenderer } from "three/webgpu";
import { FrameMetricsMonitor } from "../../engine/perf/frameMetrics.ts";
import { buildPerfWitness, serializePerfWitness } from "../../engine/perf/perfWitness.ts";
import type { FrameMetrics } from "../../engine/perf/frameMetrics.ts";
import type { BackendProof } from "./backendProof.ts";

/** The quality fields of the witness. */
export interface PerfQuality {
  readonly level: string;
  readonly adaptive: boolean;
  readonly reductionDepth: number;
}

const PUBLISH_MS = 500;
const GPU_SAMPLES = 120;

export interface PerfSampler {
  /** After a frame was drawn; `now` in ms. */
  frame(now: number): void;
  /** Frames recorded so far. */
  readonly frames: number;
  /** Frame times over the default window (the quality driver reads it). */
  metrics(): FrameMetrics;
}

export function createPerfSampler(
  renderer: WebGPURenderer,
  proof: BackendProof,
  quality: () => PerfQuality,
  publish: (json: string) => void,
  extra: () => Readonly<Record<string, number | string | boolean | null>> = () => ({}),
): PerfSampler {
  const monitor = new FrameMetricsMonitor();
  const gpu: number[] = [];
  const started = performance.now();
  let last: number | null = null;
  let nextPublish = 0;
  let resolving = false;

  const sampleGpu = (): void => {
    if (!proof.timestampQuery || resolving) return;
    resolving = true;
    renderer
      .resolveTimestampsAsync(TimestampQuery.RENDER)
      .then((ms) => {
        if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) {
          gpu.push(ms);
          if (gpu.length > GPU_SAMPLES) gpu.shift();
        }
      })
      .catch(() => {
        // a lost device or a skipped query: no sample this frame
      })
      .finally(() => {
        resolving = false;
      });
  };

  return {
    frame(now) {
      if (last !== null) monitor.record(now - last);
      last = now;
      sampleGpu();
      if (now < nextPublish) return;
      nextPublish = now + PUBLISH_MS;
      const average = gpu.length > 0 ? gpu.reduce((sum, ms) => sum + ms, 0) / gpu.length : 0;
      const memory = renderer.info.memory as { geometries: number; textures: number; programs?: number };
      const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
      const witness = buildPerfWitness({
        metrics: monitor.metrics(),
        spikes: monitor.spikeCounts(),
        gpu: gpu.length > 0 ? { lastMs: gpu[gpu.length - 1]!, averageMs: average, maxMs: Math.max(...gpu), samples: gpu.length } : null,
        drawCalls: renderer.info.render.drawCalls,
        triangles: renderer.info.render.triangles,
        geometries: memory.geometries,
        textures: memory.textures,
        programs: memory.programs ?? 0,
        jsHeapBytes: heap,
        qualityLevel: quality().level,
        adaptiveEnabled: quality().adaptive,
        reductionDepth: quality().reductionDepth,
        timeScale: 1,
        paused: false,
        sceneSeconds: (now - started) / 1000,
        extra: { backend: proof.backend, isWebGPUBackend: proof.isWebGPUBackend, ...extra() },
      });
      publish(serializePerfWitness(witness));
    },
    get frames() {
      return monitor.frames;
    },
    metrics: () => monitor.metrics(),
  };
}
