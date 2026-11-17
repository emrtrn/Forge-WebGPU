import assert from "node:assert/strict";
import { test } from "vitest";
import { makeFoliageRng, passesFoliageFilters, rollFoliageInstance, surfaceSlopeDegrees } from "./foliageRoll.ts";
import { normalizeFoliageTypeParams } from "./foliageTypeParams.ts";

test("foliage params: defaults expose only generation inputs and ranges preserve Forge ordering", () => {
  assert.deepEqual(normalizeFoliageTypeParams({}), {
    scaleMin: [1, 1, 1], scaleMax: [1, 1, 1], randomYaw: true, alignToNormal: true,
    zOffsetMin: 0, zOffsetMax: 0, slopeMin: 0, slopeMax: 90,
  });
  assert.deepEqual(normalizeFoliageTypeParams({
    scaleMin: [2, 8, 9], scaleMax: [1, 5, 6], slopeMin: 200, slopeMax: -5,
    zOffsetMin: 4, zOffsetMax: -2, heightMin: 8, heightMax: -3,
    randomYaw: false, alignToNormal: false, farTint: 3, sway: { enabled: true },
  }), {
    scaleMin: [2, 2, 2], scaleMax: [2, 2, 2], randomYaw: false, alignToNormal: false,
    zOffsetMin: -2, zOffsetMax: 4, slopeMin: 0, slopeMax: 90,
    heightMin: 8, heightMax: -3, farTint: 1,
  });
  const invalid = normalizeFoliageTypeParams({
    scaleMin: [-3, 2, 4], scaleMax: [NaN, 2, 4], slopeMin: Infinity, slopeMax: "30",
    zOffsetMin: NaN, zOffsetMax: Infinity, heightMin: NaN, heightMax: "10",
    randomYaw: 0, alignToNormal: null, farTint: -1,
  });
  assert.deepEqual(invalid, { ...normalizeFoliageTypeParams({}), scaleMin: [0.001, 0.001, 0.001] });
  assert.deepEqual(normalizeFoliageTypeParams({ scaleMin: [2, 3] }).scaleMin, [1, 1, 1]);
});

test("foliage roll: stable draw slots, uniform scale, independent hit copies and optional yaw", () => {
  const type = normalizeFoliageTypeParams({ scaleMin: [1, 1, 1], scaleMax: [3, 3, 3], zOffsetMin: -1, zOffsetMax: 1 });
  const hit = { position: [2, 3, 4] as [number, number, number], normal: [0, 1, 0] as [number, number, number] };
  const values = [0.25, 0.6, 0.7, 0.5, 0.75, 0.1];
  let draws = 0;
  const roll = rollFoliageInstance(type, hit, () => values[draws++]!);
  assert.equal(draws, 6);
  assert.deepEqual(roll, { position: [2, 3, 4], normal: [0, 1, 0], yawDeg: 180,
    scale: [1.5, 1.5, 1.5], zOffset: 0.5, seed: 429496729 });
  roll.position[0] = 99;
  roll.normal[1] = 0;
  assert.deepEqual(hit, { position: [2, 3, 4], normal: [0, 1, 0] });
  draws = 0;
  const noYaw = rollFoliageInstance({ ...type, randomYaw: false }, hit, () => values[draws++]!);
  assert.equal(draws, 5);
  assert.equal(noYaw.yawDeg, 0);
  assert.equal(noYaw.zOffset, 0);
  assert.equal(noYaw.seed, 3221225471);
  const a = makeFoliageRng(-1), b = makeFoliageRng(0xffffffff);
  assert.deepEqual(Array.from({ length: 16 }, a), Array.from({ length: 16 }, b));
});

test("foliage filters: slope degrees, inclusive tolerance and open height limits", () => {
  assert.equal(surfaceSlopeDegrees([0, 1.01, 0]), 0);
  assert.equal(surfaceSlopeDegrees([1, 0, 0]), 90);
  const type = normalizeFoliageTypeParams({ heightMin: 2, heightMax: 4, slopeMin: 0, slopeMax: 0 });
  assert.equal(passesFoliageFilters(type, { position: [0, 2 - 0.5e-4, 0], normal: [0, 1, 0] }), true);
  assert.equal(passesFoliageFilters(type, { position: [0, 4 + 2e-4, 0], normal: [0, 1, 0] }), false);
  assert.equal(passesFoliageFilters(type, { position: [0, 3, 0], normal: [Math.SQRT1_2, Math.SQRT1_2, 0] }), false);
  assert.equal(passesFoliageFilters(normalizeFoliageTypeParams({}), { position: [0, -1e8, 0], normal: [0, 1, 0] }), true);
});
