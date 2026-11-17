import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizeRockParams } from "./rockParams.ts";
import { generateRock } from "./rockGenerator.ts";

test("rock params have finite bounded defaults and normalize hostile inputs without mutation", () => {
  const input = { size: [NaN, -3, Infinity], cuts: 1e9, flattenBottom: 3, lods: [1, 3, 2, 3], seed: -1 };
  const copy = structuredClone(input);
  const p = normalizeRockParams(input);
  assert.deepEqual(input, copy);
  assert.deepEqual(p.lods, [3, 2, 1]);
  assert.deepEqual(p.size, [2, 0.01, 2]);
  assert.equal(p.cuts, 64); assert.equal(p.flattenBottom, 1); assert.equal(p.seed, 4294967295);
  assert.deepEqual(normalizeRockParams({ lods: [] }).lods, [3, 2, 1]);
  assert.deepEqual(normalizeRockParams({ lods: [NaN, "x"] }).lods, [3, 2, 1]);
  assert.equal(normalizeRockParams({ shape: "invalid", noiseAmplitude: Infinity }).shape, "rounded");
  assert.equal(normalizeRockParams({ noiseOctaves: 1e8 }).noiseOctaves, 8);
  assert.ok(generateRock(normalizeRockParams({})).ok);
});
