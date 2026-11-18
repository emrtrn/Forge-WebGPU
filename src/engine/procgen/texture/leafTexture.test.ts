import assert from "node:assert/strict";
import { test } from "vitest";
import { bakeLeafTexture, normalizeLeafTextureParams } from "./leafTexture.ts";

const coverage = (rgba: Uint8Array): number => {
  let covered = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! > 127) covered += 1;
  return covered / (rgba.length / 4);
};

test("broad and needle cards: deterministic, cut out with a soft edge, the twig across the middle", () => {
  for (const kind of ["broad", "needle"] as const) {
    const a = bakeLeafTexture({ kind, size: 128, seed: 3 }), b = bakeLeafTexture({ kind, size: 128, seed: 3 });
    assert.deepEqual(a.rgba, b.rgba);
    const share = coverage(a.rgba);
    assert.ok(share > 0.08 && share < 0.8, `${kind} covers ${share}`);
    // The twig: the card's middle row is drawn near both ends (it tapers toward its tip).
    const middle = 64 * 128 * 4;
    assert.ok(a.rgba[middle + 8 * 4 + 3]! > 200 && a.rgba[middle + 112 * 4 + 3]! > 100);
    // A corner is empty.
    assert.equal(a.rgba[3], 0);
    // Antialiased: some partial alpha exists.
    assert.ok(a.rgba.some((value, i) => i % 4 === 3 && value > 20 && value < 235));
    assert.notDeepEqual(bakeLeafTexture({ kind, size: 128, seed: 4 }).rgba, a.rgba);
  }
});

test("params are clamped and default per kind", () => {
  const needle = normalizeLeafTextureParams({ kind: "needle", size: 3000, count: -1 });
  assert.equal(needle.size, 1024);
  assert.equal(needle.count, 1);
  assert.equal(normalizeLeafTextureParams({}).kind, "broad");
  assert.equal(normalizeLeafTextureParams({ size: 200 }).size, 256);
});
