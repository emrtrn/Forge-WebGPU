// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { LoadProgressTracker, formatLoadDetail } from "./loadProgress.ts";
import { test } from "vitest";

const check = test;

// P4 Boot / Loading UX: pure progress aggregator.
check("load progress: counts loaded/failed/pending and derives fraction + done", () => {
  const tracker = new LoadProgressTracker();
  // Empty is immediately complete (nothing to wait for).
  assert.deepEqual(tracker.snapshot(), {
    total: 0,
    loaded: 0,
    failed: 0,
    pending: 0,
    fraction: 1,
    done: true,
    failedIds: [],
  });

  tracker.expectAll(["model-a", "model-b", { id: "tex-c", label: "Texture C" }, "audio-d"]);
  let snap = tracker.snapshot();
  assert.equal(snap.total, 4);
  assert.equal(snap.pending, 4);
  assert.equal(snap.fraction, 0);
  assert.equal(snap.done, false);

  tracker.markLoaded("model-a");
  tracker.markLoaded("model-b");
  snap = tracker.snapshot();
  assert.equal(snap.loaded, 2);
  assert.equal(snap.fraction, 0.5);
  assert.equal(snap.done, false);

  tracker.markFailed("tex-c", "404 Not Found");
  snap = tracker.snapshot();
  assert.equal(snap.failed, 1);
  assert.deepEqual(snap.failedIds, ["tex-c"]);
  // Settled (loaded+failed) counts toward the bar even though one failed.
  assert.equal(snap.fraction, 0.75);
  assert.equal(snap.done, false);

  tracker.markLoaded("audio-d");
  snap = tracker.snapshot();
  assert.equal(snap.done, true);
  assert.equal(snap.fraction, 1);
  assert.equal(snap.pending, 0);

  // Label from expectAll survives; the failed item carries its reason.
  const failed = tracker.entries().find((item) => item.id === "tex-c");
  assert.equal(failed?.label, "Texture C");
  assert.equal(failed?.error, "404 Not Found");
});

check("load progress: transitions are idempotent and retry moves failed -> loaded", () => {
  const tracker = new LoadProgressTracker();
  tracker.expect("m1");

  // Auto-registration: reporting an undeclared id grows the total.
  tracker.markLoaded("m2");
  let snap = tracker.snapshot();
  assert.equal(snap.total, 2);
  assert.equal(snap.loaded, 1);

  // Re-reporting a loaded item does not double-count.
  tracker.markLoaded("m2");
  assert.equal(tracker.snapshot().loaded, 1);

  tracker.markFailed("m1", "network");
  snap = tracker.snapshot();
  assert.equal(snap.failed, 1);
  assert.equal(snap.loaded, 1);

  // resetFailed rewinds failed items to pending for a retry pass.
  tracker.resetFailed();
  snap = tracker.snapshot();
  assert.equal(snap.failed, 0);
  assert.equal(snap.pending, 1);
  assert.deepEqual(snap.failedIds, []);

  // Retry succeeds: the same id settles as loaded, completing the set.
  tracker.markLoaded("m1");
  snap = tracker.snapshot();
  assert.equal(snap.loaded, 2);
  assert.equal(snap.done, true);
});

check("load progress: formatLoadDetail renders settled/total with a failure suffix", () => {
  const tracker = new LoadProgressTracker();
  assert.equal(formatLoadDetail(tracker.snapshot()), "");
  tracker.expectAll(["a", "b", "c"]);
  assert.equal(formatLoadDetail(tracker.snapshot()), "0 / 3");
  tracker.markLoaded("a");
  assert.equal(formatLoadDetail(tracker.snapshot()), "1 / 3");
  tracker.markFailed("b", "boom");
  assert.equal(formatLoadDetail(tracker.snapshot()), "2 / 3 · 1 failed");
});

check("load progress: subscribe fires immediately and on each change, clear resets", () => {
  const tracker = new LoadProgressTracker();
  tracker.expect("only");
  const seen: number[] = [];
  const unsubscribe = tracker.subscribe((snap) => seen.push(snap.loaded));
  // Immediate fire with the current snapshot.
  assert.deepEqual(seen, [0]);
  tracker.markLoaded("only");
  assert.deepEqual(seen, [0, 1]);
  // No-op transition does not notify.
  tracker.markLoaded("only");
  assert.deepEqual(seen, [0, 1]);
  unsubscribe();
  tracker.clear();
  // After unsubscribe, no further notifications; tracker is empty again.
  assert.deepEqual(seen, [0, 1]);
  assert.deepEqual(tracker.snapshot(), {
    total: 0,
    loaded: 0,
    failed: 0,
    pending: 0,
    fraction: 1,
    done: true,
    failedIds: [],
  });
});
