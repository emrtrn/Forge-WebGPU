// Subsystem profiler: rolling averages, windows, timing through the registry.
// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each
// check is copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { test } from "vitest";
import { type Subsystem } from "../subsystem.ts";
import { EngineApp } from "../testing/EngineApp.ts";
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

check("subsystem profiler: registry times each subsystem with an injected clock", () => {
  const app = new EngineApp();
  const ticks: string[] = [];
  const makeSubsystem = (id: string): Subsystem => ({
    id,
    update: () => {
      ticks.push(id);
    },
  });
  app.registerSubsystem(makeSubsystem("first"));
  app.registerSubsystem(makeSubsystem("second"));

  // Deterministic clock: each now() call advances 1ms, so every subsystem's
  // measured (end - start) is exactly 1ms.
  let clock = 0;
  const profiler = app.enableProfiling(() => (clock += 1));
  assert.equal(profiler instanceof SubsystemProfiler, true);
  // Idempotent: a second enable returns the same profiler.
  assert.equal(app.enableProfiling(), profiler);

  app.update(0.016);
  assert.deepEqual(ticks, ["first", "second"]);
  // The subsystem block no longer closes the profiler's frame: it is one
  // region of the frame, and everything the shell runs after it would fall
  // outside a frame that ended here (F1, plan §1.1).
  assert.equal(app.getProfileSnapshot()!.frames, 0);
  app.recordFrame(8);
  app.endProfileFrame();
  const snapshot = app.getProfileSnapshot();
  assert.ok(snapshot);
  assert.equal(snapshot!.frames, 1);
  // The whole frame is the denominator and is kept out of the region list.
  assert.equal(snapshot!.frame?.averageMs, 8);
  assert.equal(snapshot!.subsystems.some((timing) => timing.id === "frame"), false);
  // The block as a whole is a region too, with the subsystems as its children:
  // its 5 ms (five clock reads at 1 ms apiece) minus their 2 ms is the
  // registry's own overhead, which nothing else would ever report.
  assert.deepEqual(
    snapshot!.subsystems.map((s) => [s.id, s.lastMs, s.parent]),
    [
      ["engine", 5, null],
      ["first", 1, "engine"],
      ["second", 1, "engine"],
    ],
  );
  // Roots only: counting the group and its children would double 2 of the 5 ms
  // and hand the bottleneck classifier a CPU share it could never justify.
  assert.equal(snapshot!.totalAverageMs, 5);
});
