// Frame metrics: windowed average, P95, spikes, refresh estimate.
// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each
// check is copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { test } from "vitest";
import { FrameMetricsMonitor } from "./frameMetrics.ts";

const check = test;

check("frame metrics: windowed average and spike counts over raw deltas", () => {
  const monitor = new FrameMetricsMonitor({ windowSeconds: 5, spikeThresholdMs: 33.3 });
  // 100 steady 16 ms frames = 1.6 s < 5 s window → all in-window.
  for (let i = 0; i < 100; i += 1) monitor.record(16);
  const steady = monitor.metrics();
  assert.equal(steady.sampleCount, 100);
  assert.ok(Math.abs(steady.averageFrameTimeMs - 16) < 1e-9);
  assert.equal(steady.p95FrameTimeMs, 16);
  assert.equal(steady.spikeCount, 0);
  assert.ok(Math.abs(steady.sampleWindowSeconds - 1.6) < 1e-9);
  assert.equal(steady.frameTimeMs, 16);

  // Inject spikes at the three thresholds. spikeCount catches all three, but the
  // average stays fine and — key point — P95 does NOT move: 3 hitches in 103
  // frames sit above the 95th percentile, which is exactly why spikeCount is a
  // separate signal from P95 (plan §3.1 / §7.1).
  monitor.record(40); // > 33.3
  monitor.record(60); // > 50
  monitor.record(120); // > 100 major hitch
  const spiked = monitor.metrics();
  assert.equal(spiked.spikeCount, 3);
  assert.equal(spiked.p95FrameTimeMs, 16); // rare spikes stay above the P95 tail
  assert.ok(spiked.averageFrameTimeMs < 20); // 3 spikes buried in 100 good frames
  assert.deepEqual(monitor.spikeCounts(), { over33ms: 3, over50ms: 2, over100ms: 1 });
});

check("frame metrics: P95 uses nearest-rank over the window", () => {
  const monitor = new FrameMetricsMonitor({ windowSeconds: 5 });
  // Frame times 1..20 ms. Nearest-rank P95: ceil(0.95 * 20) = 19 → 19th value.
  for (let ms = 1; ms <= 20; ms += 1) monitor.record(ms);
  const m = monitor.metrics();
  assert.equal(m.sampleCount, 20);
  assert.equal(m.averageFrameTimeMs, 10.5); // mean of 1..20
  assert.equal(m.p95FrameTimeMs, 19);
  assert.equal(m.spikeCount, 0); // none exceed the 33.3 ms default threshold
});

check("frame metrics: window is time-bounded and estimates refresh from the low percentile", () => {
  const monitor = new FrameMetricsMonitor({ windowSeconds: 1 });
  // 200 frames of 16 ms = 3.2 s of history, but the 1 s window keeps only the
  // most recent ~63 (walk stops once cumulative time crosses 1000 ms).
  for (let i = 0; i < 200; i += 1) monitor.record(16);
  const m = monitor.metrics();
  assert.ok(m.sampleWindowSeconds >= 1 && m.sampleWindowSeconds < 1.05);
  assert.ok(m.sampleCount <= 64 && m.sampleCount >= 62);
  // A 60 Hz cadence estimates a ~16 ms refresh interval.
  assert.equal(m.estimatedRefreshIntervalMs, 16);
  assert.equal(monitor.frames, 200);

  // A lone hitch after a reset is still reported (newest sample always kept).
  monitor.reset();
  const empty = monitor.metrics();
  assert.equal(empty.sampleCount, 0);
  assert.equal(empty.averageFrameTimeMs, 0);
  monitor.record(250);
  const hitch = monitor.metrics();
  assert.equal(hitch.sampleCount, 1);
  assert.equal(hitch.p95FrameTimeMs, 250);
  assert.equal(monitor.frames, 201); // lifetime counter survives reset
});

check("frame metrics: clamps skew and drops non-finite deltas", () => {
  const monitor = new FrameMetricsMonitor({ windowSeconds: 5 });
  monitor.record(Number.NaN); // dropped
  monitor.record(Number.POSITIVE_INFINITY); // dropped
  monitor.record(-5); // clamps to 0
  monitor.record(20);
  const m = monitor.metrics();
  assert.equal(m.sampleCount, 2);
  assert.equal(m.averageFrameTimeMs, 10); // (0 + 20) / 2
  assert.equal(monitor.frames, 2); // only the two finite deltas counted
});
