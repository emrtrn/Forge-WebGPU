// Control: a test under src/ may import node:assert (tests ported from Forge
// WebGL keep their assertions), node:zlib (an independent reference codec) and
// node:fs (reading a shared test fixture). Must not be reported.
import assert from "node:assert/strict";
import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

export const inflate = (bytes: Uint8Array): Uint8Array => inflateSync(bytes);

export const readFixture = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

export const check = (value: number): void => {
  assert.equal(value, 1);
  strictEqual(value, 1);
};
