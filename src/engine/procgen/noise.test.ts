import assert from "node:assert/strict";
import { test } from "vitest";
import { noise3, fbm3 } from "./noise.ts";

test("3D noise replays, depends on seed, and is continuous across positive and negative lattice boundaries", () => {
  const samples: number[] = [], other: number[] = [];
  for (let i = -120; i < 120; i++) {
    const x = i / 13, y = i * 0.197, z = i * -0.371;
    const value = noise3(x, y, z, 12);
    assert.equal(value, noise3(x, y, z, 12));
    assert.ok(value >= -1.1 && value <= 1.1);
    assert.ok(Math.abs(value - noise3(x + 1e-5, y - 1e-5, z + 1e-5, 12)) < 1e-3);
    samples.push(value); other.push(noise3(x, y, z, 13));
  }
  assert.notDeepEqual(samples, other);
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.5);
  for (const boundary of [-3, -1, 0, 1, 4]) for (let axis = 0; axis < 3; axis++) {
    const a = [0.31, -0.72, 1.23], b = [...a];
    a[axis] = boundary - 1e-6; b[axis] = boundary + 1e-6;
    assert.ok(Math.abs(noise3(a[0]!, a[1]!, a[2]!, 7) - noise3(b[0]!, b[1]!, b[2]!, 7)) < 1e-4);
  }
});

test("fBm is normalized, seeded and bounded even with hostile octave settings", () => {
  const options = { seed: 1, octaves: 4, lacunarity: 2, gain: 0.5 };
  const value = fbm3(1.31, -0.9, 0.55, options);
  assert.equal(value, fbm3(1.31, -0.9, 0.55, options));
  assert.notEqual(value, fbm3(1.31, -0.9, 0.55, { ...options, seed: 2 }));
  assert.equal(fbm3(1, 2, 3, { ...options, octaves: 0 }), 0);
  assert.ok(Number.isFinite(fbm3(0.1, 0.2, 0.3, { seed: 1, octaves: 1e12, lacunarity: Infinity, gain: NaN })));
});
