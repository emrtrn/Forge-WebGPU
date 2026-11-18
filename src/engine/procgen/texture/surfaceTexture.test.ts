import assert from "node:assert/strict";
import { test } from "vitest";
import { periodicCellular2, periodicFbm2, periodicNoise2 } from "./tileNoise.ts";
import { bakeSurfaceTexture, normalizeSurfaceTextureParams } from "./surfaceTexture.ts";

test("noise functions repeat exactly across both axes and stay in range", () => {
  let state = 12345;
  const coordinate = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32 * Math.PI * 32 - 50;
  };
  for (const period of [1, 7, 64]) {
    const samples = [
      { sample: (x: number, y: number) => periodicNoise2(x, y, period, 23), min: -1 },
      { sample: (x: number, y: number) => periodicCellular2(x, y, period, 23), min: 0 },
      { sample: (x: number, y: number) => periodicFbm2(x, y, period, 4, 3, 0.6, 23), min: -1 },
    ];
    for (const { sample, min } of samples) {
      const values = new Set<number>();
      for (let i = 0; i < 150; i++) {
        const x = coordinate(), y = coordinate();
        const value = sample(x, y);
        assert.equal(sample(x + period, y), value);
        assert.equal(sample(x, y + period), value);
        assert.equal(sample(x - period, y - period), value);
        assert.ok(value >= min && value <= 1);
        values.add(value);
      }
      assert.ok(values.size > 100);
    }
  }
  const args = [1.125, -4.5, 7] as const;
  assert.equal(periodicFbm2(...args, -2, 2, 0.5, 23), periodicNoise2(...args, 23));
  assert.equal(periodicFbm2(...args, 8, 2, 0, 23), periodicNoise2(...args, 23));
  assert.equal(periodicFbm2(...args, 12, 2, 0.5, 23), periodicFbm2(...args, 10, 2, 0.5, 23));
});

test("normalization fills defaults and clamps valid entries", () => {
  const defaults = normalizeSurfaceTextureParams({});
  assert.deepEqual(defaults.layers.map(layer => layer.kind), ["gradient", "cellular"]);
  assert.equal(defaults.colorRamp.length, 3);
  assert.deepEqual(normalizeSurfaceTextureParams({ layers: [null, { kind: "invalid" }], colorRamp: [{}] }), defaults);

  const normalized = normalizeSurfaceTextureParams({
    seed: -3.8, size: 140, normalStrength: 25, roughness: [-1, 4], aoStrength: 1.5, metalness: -1,
    layers: [null, { kind: "bad" }, {
      kind: "ridged", scale: 100, octaves: 0, gain: 5, weight: -1, blend: "bad", threshold: 1.5, softness: -2,
    }, { kind: "cellular", scale: 1.6, octaves: 3.8, weight: 3 }],
    colorRamp: [{ at: 2, color: [-1, 0.2, 3] }, { at: -1, color: [0, 0, 0] },
      { at: 0.5, color: [0, 0, NaN] }, { at: NaN, color: [0, 0, 0] }],
  });
  assert.equal(normalized.seed, 4294967293);
  assert.equal(normalized.size, 128);
  assert.deepEqual(normalized.layers, [
    { kind: "ridged", scale: 64, octaves: 1, gain: 1, weight: 0, blend: "add", threshold: 1, softness: 0 },
    { kind: "cellular", scale: 2, octaves: 4, gain: 0.5, weight: 2, blend: "add", threshold: 0.5, softness: 1 },
  ]);
  assert.deepEqual(normalized.colorRamp, [{ at: 0, color: [0, 0, 0] }, { at: 1, color: [0, 0.2, 1] }]);
  assert.deepEqual([normalized.normalStrength, ...normalized.roughness, normalized.aoStrength, normalized.metalness], [16, 0, 1, 1, 0]);
  assert.deepEqual(normalizeSurfaceTextureParams({ ...normalized }), normalized);
  assert.equal(normalizeSurfaceTextureParams({ size: 92 }).size, 64);
  assert.equal(normalizeSurfaceTextureParams({ size: 96 }).size, 128);
  assert.equal(normalizeSurfaceTextureParams({ size: -5 }).size, 64);
  assert.equal(normalizeSurfaceTextureParams({ size: 4000 }).size, 2048);
  assert.equal(normalizeSurfaceTextureParams({ layers: Array(12).fill(defaults.layers[0]) }).layers.length, 8);
  assert.equal(normalizeSurfaceTextureParams({ colorRamp: Array(12).fill(defaults.colorRamp[0]) }).colorRamp.length, 8);
});

test("identical parameters yield identical arrays with a full normalized height range", () => {
  const params = normalizeSurfaceTextureParams({ size: 64, seed: 42 });
  const first = bakeSurfaceTexture(params);
  assert.equal(first.size, 64);
  assert.ok(first.height instanceof Float32Array);
  assert.equal(first.height.length, 64 * 64);
  for (const map of [first.baseColor, first.normal, first.orm]) {
    assert.ok(map instanceof Uint8Array);
    assert.equal(map.length, first.height.length * 4);
    for (let offset = 3; offset < map.length; offset += 4) assert.equal(map[offset], 255);
  }
  assert.equal(Math.min(...first.height), 0);
  assert.equal(Math.max(...first.height), 1);
  assert.deepEqual(bakeSurfaceTexture(params), first);
  assert.notDeepEqual(bakeSurfaceTexture({ ...params, seed: 43 }).height, first.height);
});

test("appending a layer preserves earlier streams and cellular octaves affect the result", () => {
  const params = normalizeSurfaceTextureParams({ size: 64 });
  const first = params.layers[0]!;
  const second = params.layers[1]!;
  const baseline = bakeSurfaceTexture({ ...params, layers: [first] });
  const same = bakeSurfaceTexture({
    ...params, layers: [{ ...first, blend: "min" }, { ...second, blend: "multiply", threshold: 0, softness: 0, weight: 0.5 }],
  });
  assert.deepEqual(same, baseline);
  const multiOctave = bakeSurfaceTexture(params).height;
  const singleOctave = bakeSurfaceTexture({ ...params, layers: [first, { ...second, octaves: 1 }] }).height;
  assert.notDeepEqual(multiOctave, baseline.height);
  assert.notDeepEqual(multiOctave, singleOctave);
});

test("min and max blends clip the height field and smooth thresholds retain a transition", () => {
  const layer = { kind: "gradient" } as const;
  const constant = { kind: "cellular", threshold: 0, softness: 0, weight: 0.5 } as const;
  const upper = bakeSurfaceTexture({ size: 64, layers: [layer, { ...constant, blend: "min" }] }).height;
  const lower = bakeSurfaceTexture({ size: 64, layers: [layer, { ...constant, blend: "max" }] }).height;
  assert.ok(upper.filter(value => value === 1).length > 1);
  assert.ok(lower.filter(value => value === 0).length > 1);
  assert.ok(upper.some(value => value > 0 && value < 1));
  assert.ok(lower.some(value => value > 0 && value < 1));

  const remap = { ...layer, threshold: 0.5, softness: 0.2 };
  const smooth = bakeSurfaceTexture({ size: 64, layers: [remap] }).height;
  const hard = bakeSurfaceTexture({ size: 64, layers: [{ ...remap, softness: 0 }] }).height;
  assert.ok(smooth.some(value => value > 0 && value < 1));
  assert.deepEqual([...new Set(hard)].sort(), [0, 1]);
});

test("the default stone recipe's wrapped edge differences are comparable to interior differences", () => {
  const { height, size } = bakeSurfaceTexture({});
  let maxAcrossX = 0, maxAcrossY = 0, sumInsideX = 0, sumInsideY = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, h = height[i]!;
      if (x === 0) maxAcrossX = Math.max(maxAcrossX, Math.abs(h - height[i + size - 1]!));
      else sumInsideX += Math.abs(h - height[i - 1]!);
      if (y === 0) maxAcrossY = Math.max(maxAcrossY, Math.abs(h - height[i + (size - 1) * size]!));
      else sumInsideY += Math.abs(h - height[i - size]!);
    }
  }
  const edges = size * (size - 1);
  assert.ok(maxAcrossX <= 3 * sumInsideX / edges + 1e-6);
  assert.ok(maxAcrossY <= 3 * sumInsideY / edges + 1e-6);
});

test("normals use wrapped central differences and encode green towards +V", () => {
  const normalStrength = 8;
  const { size, height, normal } = bakeSurfaceTexture({ size: 64, normalStrength });
  // The strength is per 256 px tile: a 64 px texture's texel slope is a quarter of it.
  const slope = normalStrength * size / 256;
  for (const [x, y] of [[0, 0], [0, 17], [13, 0], [63, 63]] as const) {
    const at = (u: number, v: number) => height[((v + size) % size) * size + (u + size) % size]!;
    const nx = slope * (at(x - 1, y) - at(x + 1, y));
    const ny = slope * (at(x, y + 1) - at(x, y - 1));
    const length = Math.hypot(nx, ny, 1);
    const offset = (y * size + x) * 4;
    assert.deepEqual([...normal.subarray(offset, offset + 4)], [
      ...[nx, ny, 1].map(component => Math.round(127.5 + 127.5 * component / length)), 255,
    ]);
  }
});

test("flat height produces flat normals, no cavities, and a linear-space ramp midpoint", () => {
  const { height, baseColor, normal, orm } = bakeSurfaceTexture({
    size: 64, layers: [{ kind: "gradient", weight: 0 }], normalStrength: 16,
    colorRamp: [{ at: 0, color: [0, 0, 0] }, { at: 1, color: [1, 1, 1] }],
  });
  assert.ok(height.every(value => value === 0.5));
  for (let offset = 0; offset < normal.length; offset += 4) {
    assert.deepEqual([...normal.subarray(offset, offset + 4)], [128, 128, 255, 255]);
    assert.deepEqual([...baseColor.subarray(offset, offset + 4)], [188, 188, 188, 255]);
    assert.equal(orm[offset], 255);
  }
});

test("ORM follows height and wrapped cavity blur, and the ramp preserves authored endpoints", () => {
  const colorRamp = [{ at: 0, color: [0.11, 0.41, 0.67] }, { at: 1, color: [0.93, 0.81, 0.72] }] as const;
  const { size, height, baseColor, orm } = bakeSurfaceTexture({
    size: 128, roughness: [0.2, 0.8], metalness: 0.4, aoStrength: 0.8, colorRamp,
  });
  let hasCavity = false;
  const radius = size / 64;
  for (let i = 0; i < height.length; i++) {
    const h = height[i]!, offset = i * 4;
    const x = i % size, y = Math.floor(i / size);
    let total = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        total += height[((y + dy + size) % size) * size + (x + dx + size) % size]!;
      }
    }
    const cavity = Math.max(0, Math.min(1, (total / (2 * radius + 1) ** 2 - h) * 4));
    assert.equal(orm[offset], Math.round((1 - 0.8 * cavity) * 255));
    assert.equal(orm[offset + 1], Math.round((0.2 + 0.6 * h) * 255));
    assert.equal(orm[offset + 2], 102);
    assert.equal(orm[offset + 3], 255);
    hasCavity ||= orm[offset]! < 255;
    if (h === 0 || h === 1) {
      for (const [channel, authored] of colorRamp[h].color.entries()) {
        assert.ok(Math.abs(baseColor[offset + channel]! / 255 - authored) <= 1 / 255);
      }
    }
  }
  assert.ok(hasCavity);
});

test("a three-layer 512x512 bake completes within the sanity budget", () => {
  const { layers } = normalizeSurfaceTextureParams({});
  const start = performance.now();
  const result = bakeSurfaceTexture({
    size: 512,
    layers: [{ ...layers[0], octaves: 4 }, { ...layers[1], octaves: 4 },
      { ...layers[0], kind: "ridged", scale: 64, octaves: 4, weight: 0.6 }],
  });
  assert.equal(result.height.length, 512 * 512);
  assert.ok(performance.now() - start < 10_000);
}, 12_000);
