// Control: a test under src/ may import node:assert (tests ported from Forge
// WebGL keep their assertions). Must not be reported.
import assert from "node:assert/strict";
import { strictEqual } from "node:assert";

export const check = (value: number): void => {
  assert.equal(value, 1);
  strictEqual(value, 1);
};
