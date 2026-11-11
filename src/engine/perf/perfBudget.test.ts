// Perf budget: over-budget flags, byte sizes.
// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each
// check is copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { test } from "vitest";
import { DEFAULT_PERF_BUDGET, evaluatePerfBudget, formatByteSize, isOverBudget } from "./perfBudget.ts";

const check = test;

check("perf budget: flags over-budget metrics and keeps a stable row order", () => {
  const metrics = evaluatePerfBudget(
    { drawCalls: 120, triangles: 2_000_000, textures: 200 },
    DEFAULT_PERF_BUDGET,
  );
  assert.deepEqual(
    metrics.map((m) => m.key),
    ["drawCalls", "triangles", "textures"],
  );
  assert.deepEqual(
    metrics.map((m) => m.over),
    [false, true, true],
  );
  assert.equal(isOverBudget(metrics), true);

  const withinBudget = evaluatePerfBudget({ drawCalls: 10, triangles: 100, textures: 4 });
  assert.equal(isOverBudget(withinBudget), false);
});

check("perf budget: formatByteSize renders decimal units with a placeholder for bad input", () => {
  assert.equal(formatByteSize(512), "512 B");
  assert.equal(formatByteSize(1500), "1.5 kB");
  assert.equal(formatByteSize(2_000_000), "2.0 MB");
  assert.equal(formatByteSize(3_500_000_000), "3.5 GB");
  assert.equal(formatByteSize(-1), "—");
  assert.equal(formatByteSize(Number.NaN), "—");
});
