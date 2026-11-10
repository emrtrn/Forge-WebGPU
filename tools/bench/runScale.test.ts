import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { formatScaleReport, runScaleBench } from "./runScale.ts";

// The runner end to end on a tiny level, so it does not rot between measurements.
test("runs every scenario and reports against the thresholds", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "forge-bench-"));
  try {
    const report = await runScaleBench({ outDir, actors: 300, worldSize: 256, meshes: 10, classes: 3, runs: 1 });
    expect(report.level).toMatchObject({ actors: 300, cells: 4 });
    expect(report.s3EditSave.partsWritten).toBe(2);
    expect(report.s4FullSave.files).toBe(6);
    expect(Object.keys(report.pass)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]);
    expect(report.s7.diskMb).toBeGreaterThan(0);
    const lines = formatScaleReport(report);
    expect(lines).toHaveLength(9);
    expect(lines[2]).toMatch(/^S1 whole level load/);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}, 60_000);
