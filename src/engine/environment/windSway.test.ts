// Ported from Forge WebGL tests/engine/windSway.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 15 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { resolveLevelWind, resolveWind } from "./wind.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;

export function registerWindSwayTests(check: Check): void {
  check("wind sway: the WES wind group only counts while the environment is active", () => {
    const layout = { worldEnvironment: { wind: { strength: 0.9 } }, worldSettings: { wind: { strength: 0.1 } } };
    assert.equal(resolveLevelWind(layout, null).strength, 0.1, "no active WES: World Settings");
    assert.equal(resolveLevelWind(layout, { season: "summer", weather: { preset: "clear", intensity: 1 } }).strength, 0.9);
    assert.equal(resolveLevelWind(null, null).strength, resolveWind(null, null, null).strength);
  });
}

registerWindSwayTests(test as unknown as Parameters<typeof registerWindSwayTests>[0]);
