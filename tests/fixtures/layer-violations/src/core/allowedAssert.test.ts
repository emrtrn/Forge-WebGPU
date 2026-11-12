// Control: a test under src/ may import node:assert (tests ported from Forge
// WebGL keep their assertions) and node:zlib (an independent reference codec).
// Must not be reported.
import assert from "node:assert/strict";
import { strictEqual } from "node:assert";
import { inflateSync } from "node:zlib";

export const inflate = (bytes: Uint8Array): Uint8Array => inflateSync(bytes);

export const check = (value: number): void => {
  assert.equal(value, 1);
  strictEqual(value, 1);
};
