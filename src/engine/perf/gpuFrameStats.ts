// Ported from Forge WebGL engine/perf/gpuTimer.ts (GpuFrameSample, GpuFrameStats) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The WebGL timer-query class (GpuFrameTimer) is not ported: the WebGPU renderer
// times frames with timestamp queries (Faz 3). Only its stats types are used here.

export interface GpuFrameSample {
  /** Whatever the caller passed to {@link GpuFrameTimer.begin} for that frame. */
  readonly tag: number;
  readonly ms: number;
}

export interface GpuFrameStats {
  readonly lastMs: number;
  readonly averageMs: number;
  readonly maxMs: number;
  readonly samples: number;
}
