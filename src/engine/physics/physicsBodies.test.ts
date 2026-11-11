// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { isOutsideDynamicActiveArea } from "./physicsBodies.ts";
import { test } from "vitest";

const check = test;

check("dynamic physics active area classifies bodies outside its finite radius", () => {
  assert.equal(isOutsideDynamicActiveArea([10, 0, 0], [0, 0, 0], 10), false);
  assert.equal(isOutsideDynamicActiveArea([10.01, 0, 0], [0, 0, 0], 10), true);
  assert.equal(isOutsideDynamicActiveArea([0, 0, 11], [0, 0, 0], 10), true);
  assert.equal(isOutsideDynamicActiveArea([0, 0, 0], [0, 0, 0], 0), false);
  assert.equal(isOutsideDynamicActiveArea([Number.NaN, 0, 0], [0, 0, 0], 10), false);
});
