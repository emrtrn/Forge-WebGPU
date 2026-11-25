import assert from "node:assert/strict";
import { test } from "vitest";
import { linearTint, resolvePlantAppearance, type PlantResponseProfile } from "./plantResponse.ts";

const PROFILE: PlantResponseProfile = {
  habit: "deciduous",
  spring: { foliage: 0.8, tint: "#9ccf6a" },
  summer: { foliage: 1, tint: "#ffffff" },
  autumn: { foliage: 0.7, tint: "#d98b3a" },
  winter: { foliage: 0, tint: "#ffffff" },
  windFlex: 1.2,
  snow: { wood: 0.6, leaf: 0.8 },
  wetness: 0.5,
};
const dry = { snowCoverage: 0, wetness: 0 };

test("no WES: the summer target, dry and snowless (the base look)", () => {
  assert.deepEqual(resolvePlantAppearance(PROFILE, null), { foliage: 1, tint: [1, 1, 1], snowWood: 0, snowLeaf: 0, wet: 0, windFlex: 1.2, translucency: 1, crownDepth: 1 });
});

test("a season change mixes the two targets by WES progress; reached, it is the target", () => {
  const half = resolvePlantAppearance(PROFILE, { season: "winter", seasonFrom: "autumn", seasonProgress: 0.5, surface: dry });
  assert.equal(half.foliage, 0.35);
  const autumn = linearTint("#d98b3a");
  half.tint.forEach((channel, i) => assert.ok(Math.abs(channel - (autumn[i]! + 1) / 2) < 1e-12));
  assert.equal(resolvePlantAppearance(PROFILE, { season: "winter", surface: dry }).foliage, 0);
  // The same state gives the same answer: nothing is drawn at random per frame.
  assert.deepEqual(
    resolvePlantAppearance(PROFILE, { season: "spring", seasonFrom: "winter", seasonProgress: 0.25, surface: dry }),
    resolvePlantAppearance(PROFILE, { season: "spring", seasonFrom: "winter", seasonProgress: 0.25, surface: dry }),
  );
});

test("evergreen keeps its leaves in winter; snow and wetness are independent of the season", () => {
  const evergreen = resolvePlantAppearance({ ...PROFILE, habit: "evergreen" }, { season: "winter", surface: { snowCoverage: 0.5, wetness: 1 } });
  assert.equal(evergreen.foliage, 1);
  assert.equal(evergreen.snowWood, 0.3);
  assert.equal(evergreen.snowLeaf, 0.4);
  assert.equal(evergreen.wet, 0.5);
  // A snowless winter and spring with snow left (PV-WES-04).
  assert.equal(resolvePlantAppearance(PROFILE, { season: "winter", surface: dry }).snowLeaf, 0);
  assert.ok(resolvePlantAppearance(PROFILE, { season: "spring", surface: { snowCoverage: 0.6, wetness: 0 } }).snowWood > 0);
});

test("linearTint decodes sRGB and refuses anything else", () => {
  assert.deepEqual(linearTint("#ffffff"), [1, 1, 1]);
  assert.deepEqual(linearTint("#000000"), [0, 0, 0]);
  assert.deepEqual(linearTint("red"), [1, 1, 1]);
});
