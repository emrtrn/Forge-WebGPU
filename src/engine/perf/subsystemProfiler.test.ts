// Subsystem profiler: rolling averages, windows, timing through the registry.
// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each
// check is copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { test } from "vitest";
import { SubsystemProfiler } from "./subsystemProfiler.ts";

const check = test;

// ---------------------------------------------------------------------------
// P5 Performance Infrastructure: subsystem profiler, perf budget, asset report.
// ---------------------------------------------------------------------------

check("subsystem profiler: rolling average sorts worst-first with last + peak", () => {
  const profiler = new SubsystemProfiler(4); // small window for the test
  // physics is consistently the most expensive; behavior cheapest.
  profiler.record("physics", 2);
  profiler.record("behavior", 0.5);
  profiler.record("animation", 1);
  profiler.endFrame();
  profiler.record("physics", 4);
  profiler.record("behavior", 0.5);
  profiler.record("animation", 1);
  profiler.endFrame();

  const snapshot = profiler.snapshot();
  assert.equal(snapshot.frames, 2);
  assert.deepEqual(
    snapshot.subsystems.map((s) => s.id),
    ["physics", "animation", "behavior"],
  );
  const physics = snapshot.subsystems[0]!;
  assert.equal(physics.averageMs, 3); // (2 + 4) / 2
  assert.equal(physics.lastMs, 4);
  assert.equal(physics.maxMs, 4);
  assert.equal(physics.samples, 2);
  // totalAverageMs sums every subsystem's rolling average (3 + 1 + 0.5).
  assert.equal(snapshot.totalAverageMs, 4.5);
});

check("subsystem profiler: window drops old samples, clamps negatives, top(n) + clear", () => {
  const profiler = new SubsystemProfiler(2); // window of 2 frames
  profiler.record("a", 10);
  profiler.record("a", 20);
  profiler.record("a", 30); // evicts the 10 → window holds [20, 30]
  assert.equal(profiler.snapshot().subsystems[0]!.averageMs, 25);
  assert.equal(profiler.snapshot().subsystems[0]!.maxMs, 30);

  // Negative (clock skew) samples clamp to 0 rather than corrupting the mean.
  const skew = new SubsystemProfiler(2);
  skew.record("s", -5);
  skew.record("s", 5);
  assert.equal(skew.snapshot().subsystems[0]!.averageMs, 2.5);

  const many = new SubsystemProfiler();
  many.record("x", 1);
  many.record("y", 9);
  many.record("z", 5);
  assert.deepEqual(
    many.top(2).map((t) => t.id),
    ["y", "z"],
  );
  many.clear();
  // The frame denominator clears with the windows; region declarations do not,
  // because a level teardown does not change the shape of the frame.
  assert.deepEqual(many.snapshot(), {
    subsystems: [],
    totalAverageMs: 0,
    debugOnlyAverageMs: 0,
    frames: 0,
    frame: null,
  });
});
