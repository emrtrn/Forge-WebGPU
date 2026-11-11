// Ported from Forge WebGL tests/engine/lakeScheduling.test.ts @ forge-webgl-final (04b5fb23):
// its one check that exercises CooperativeWork alone, unchanged; the lake checks
// come with water (Faz 7). docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { test } from "vitest";
import { CooperativeWork, type WorkSlice } from "./cooperativeWork.ts";

const check = test;

check("Lake scheduling: bounded batches start separate tasks and cancellation closes unfinished work", async () => {
  let clock = 0, tasks = 0, closed = false;
  const slices: WorkSlice[] = [], abort = new AbortController();
  const work = new CooperativeWork({ now: () => clock, yieldTask: async () => { tasks++; }, budgetMs: 2,
    signal: abort.signal, onSlice: s => slices.push(s) });
  function* steps() { for (let i = 0; i < 9; i++) { clock += .75; yield; } return 42; }
  assert.equal(await work.run("test", steps()), 42);
  assert.ok(tasks >= 4); assert.ok(slices.every(s => s.milliseconds <= 2.25));
  const cancel = new CooperativeWork({ now: () => clock, yieldTask: async () => {}, signal: abort.signal,
    onSlice: () => abort.abort(), budgetMs: 1 });
  function* unfinished() { try { for (;;) { clock++; yield; } } finally { closed = true; } }
  await assert.rejects(cancel.run("cancel", unfinished()), { name: "AbortError" }); assert.ok(closed);
});
