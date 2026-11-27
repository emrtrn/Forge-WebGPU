import assert from "node:assert/strict";
import { test } from "vitest";
import { WORLD_ENVIRONMENT_DEFAULTS } from "./worldEnvironment.ts";
import { terrainSnowCoverAt, terrainSnowShare } from "./terrainSnow.ts";

const settings = WORLD_ENVIRONMENT_DEFAULTS.surface;
const ground = { position: [4, 0, 5] as const, normalY: 1, cavity: 0, snowAccept: 1, covered: 0 };

test("terrain snow: scant coverage stays patchy and the share never exceeds what the ground accepts", () => {
  assert.equal(terrainSnowShare(0, settings, ground), 0);
  assert.equal(terrainSnowShare(1, { ...settings, snowSpread: 0 }, ground), 0);
  assert.equal(terrainSnowShare(1, settings, ground), 1);
  assert.equal(terrainSnowShare(1, settings, { ...ground, snowAccept: 0.25 }), 0.25);
  assert.equal(terrainSnowShare(1, settings, { ...ground, normalY: 0.1 }), 0);
  assert.equal(terrainSnowShare(1, { ...settings, snowMinAltitude: 2 }, ground), 0);
});

test("terrain snow: upward queries block the footprint around a vertex, including a low road", () => {
  const cover = terrainSnowCoverAt(ground.position, 2, (x, _y, z) => x === 6 && z === 7 ? 0.01 : null);
  assert.equal(cover, 1);
  assert.equal(terrainSnowShare(1, settings, { ...ground, covered: cover }), 0);
  assert.equal(terrainSnowCoverAt(ground.position, 1, () => -1), 0);
  assert.equal(terrainSnowCoverAt(ground.position, 1, () => 0.001), 0.5);
  assert.equal(terrainSnowCoverAt(ground.position, 1, (x, _y, z) => x === 6 && z === 5 ? 0.1 : null), 0.65);
});
