import assert from "node:assert/strict";
import { test } from "vitest";
import { WORLD_ENVIRONMENT_DEFAULTS } from "./worldEnvironment.ts";
import { terrainSnowShare } from "./terrainSnow.ts";

const settings = WORLD_ENVIRONMENT_DEFAULTS.surface;
const ground = { position: [4, 0, 5] as const, normalY: 1, snowAccept: 1 };

test("terrain snow: displacement waits for full cover and the share respects terrain acceptance", () => {
  assert.equal(terrainSnowShare(0, settings, ground), 0);
  assert.equal(terrainSnowShare(.99, settings, ground), 0);
  assert.equal(terrainSnowShare(1, { ...settings, snowSpread: .99 }, ground), 0);
  assert.equal(terrainSnowShare(1, { ...settings, snowSpread: 0 }, ground), 0);
  assert.equal(terrainSnowShare(1, settings, ground), 1);
  assert.equal(terrainSnowShare(1, settings, { ...ground, snowAccept: 0.25 }), 0.25);
  assert.equal(terrainSnowShare(1, settings, { ...ground, normalY: 0.1 }), 0);
  assert.equal(terrainSnowShare(1, { ...settings, snowMinAltitude: 2 }, ground), 0);
});
