// Ported from Forge WebGL tests/engine/heightFog.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 4 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { heightFogDensityAverage } from "./viewDistance.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;
export function registerHeightFogTests(check: Check): void {
  check("height fog: analytic integral matches numerical integration in both directions", () => {
    for (const [start, end] of [[0, 200], [200, 0], [20, 20], [20, 20.00001], [-50, 100]] as const) {
      const samples = 10000;
      let numerical = 0;
      for (let i = 0; i < samples; i++) numerical += Math.exp(-0.01 * (start + (end - start) * (i + 0.5) / samples));
      assert.ok(Math.abs(heightFogDensityAverage(0.01, 0, start, end) - numerical / samples) < 1e-7);
    }
    assert.equal(heightFogDensityAverage(0, 0, -100, 100), 1);
    assert.ok(Number.isFinite(heightFogDensityAverage(10, 0, -100000, 100000)));
  });

}

registerHeightFogTests(test as unknown as Parameters<typeof registerHeightFogTests>[0]);
