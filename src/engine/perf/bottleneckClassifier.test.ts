// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { classifyBottleneck, describeBottleneck, type BottleneckInput } from "./bottleneckClassifier.ts";
import { type FrameMetrics } from "./frameMetrics.ts";
import { evaluatePerfBudget } from "./perfBudget.ts";
import { type SubsystemProfileSnapshot } from "./subsystemProfiler.ts";
import { test } from "vitest";

const check = test;

check("bottleneck classifier: passive signals separate spike / cpu / gpu / draw-call / unknown", () => {
  const frame = (avg: number, p95: number, sampleCount = 300): FrameMetrics => ({
    frameTimeMs: avg,
    averageFrameTimeMs: avg,
    p95FrameTimeMs: p95,
    spikeCount: 0,
    sampleWindowSeconds: 5,
    sampleCount,
    estimatedRefreshIntervalMs: 8.3,
  });
  const subs = (total: number, topId: string): SubsystemProfileSnapshot => ({
    subsystems: [{ id: topId, lastMs: total, averageMs: total, maxMs: total, samples: 60 }],
    totalAverageMs: total,
    frames: 60,
  });
  const base = { budget: null, targetFrameTimeMs: 16.7 } satisfies Partial<BottleneckInput>;

  // Smooth average, hitchy P95 → transient spike (don't touch steady quality).
  const spike = classifyBottleneck({ ...base, metrics: frame(15, 40), subsystems: null });
  assert.equal(spike.type, "transient-spike");
  // The same spike during a load → asset-loading (higher confidence).
  const load = classifyBottleneck({
    ...base,
    metrics: frame(15, 40),
    subsystems: null,
    recentAssetActivity: true,
  });
  assert.equal(load.type, "asset-loading");
  assert.ok(load.confidence > spike.confidence);
  // The same spike under heap pressure → memory-pressure.
  const mem = classifyBottleneck({
    ...base,
    metrics: frame(15, 40),
    subsystems: null,
    memoryPressure: true,
  });
  assert.equal(mem.type, "memory-pressure");

  // Sustained over-budget frame + subsystems explain most of it → CPU bound,
  // naming the worst subsystem to target first.
  const cpu = classifyBottleneck({ ...base, metrics: frame(30, 34), subsystems: subs(22, "ai") });
  assert.equal(cpu.type, "cpu");
  assert.equal(cpu.suspectSubsystemId, "ai");

  // Over budget but subsystems explain little → GPU; a positive probe confirms it.
  const gpu = classifyBottleneck({
    ...base,
    metrics: frame(30, 34),
    subsystems: subs(6, "physics"),
    gpuProbe: { improvedFraction: 0.2 },
  });
  assert.equal(gpu.type, "gpu");
  assert.ok(gpu.confidence >= 0.8); // probe-confirmed
  // Without a profile the GPU verdict still stands (frame high, cpu unknown).
  const gpuNoProfile = classifyBottleneck({ ...base, metrics: frame(30, 34), subsystems: null });
  assert.equal(gpuNoProfile.type, "gpu");

  // Over budget with draw calls over budget and a mid CPU share → draw-call.
  const drawBudget = evaluatePerfBudget({ drawCalls: 800, triangles: 100, textures: 4 });
  const draw = classifyBottleneck({
    metrics: frame(30, 34),
    subsystems: subs(12, "vfx"),
    budget: drawBudget,
    targetFrameTimeMs: 16.7,
  });
  assert.equal(draw.type, "draw-call");

  // Within budget, no hitch → unknown ("within budget"); a controller does nothing.
  const fine = classifyBottleneck({ ...base, metrics: frame(15, 18), subsystems: subs(5, "ai") });
  assert.equal(fine.type, "unknown");

  // Over budget but ambiguous CPU share, no probe → unknown (safe small step).
  const ambiguous = classifyBottleneck({ ...base, metrics: frame(30, 34), subsystems: subs(15, "ai") });
  assert.equal(ambiguous.type, "unknown");

  // describeBottleneck is a compact one-liner.
  assert.equal(describeBottleneck(cpu), `cpu (conf ${cpu.confidence.toFixed(2)})`);
});
