import { describe, expect, test } from "vitest";
import { cascadeTexelSize, casterLayerMask, maxCasterCascade } from "./shadowCasters.ts";

describe("cascadeTexelSize", () => {
  test("divides the full world-space width by shadow map resolution", () => {
    expect(cascadeTexelSize(64, 1024)).toBe(.0625);
  });

  test.each([0, -1, NaN, Infinity])("returns zero for unusable dimensions (%s)", (invalid) => {
    expect(cascadeTexelSize(invalid, 1024)).toBe(0);
    expect(cascadeTexelSize(64, invalid)).toBe(0);
  });
});

describe("maxCasterCascade", () => {
  test("includes equality at every threshold", () => {
    const texels = [1 / 32, 1 / 16, 1 / 8];
    expect(maxCasterCascade(1 / 16 - Number.EPSILON, texels, 2)).toBe(0);
    expect(maxCasterCascade(1 / 16, texels, 2)).toBe(1);
    expect(maxCasterCascade(1 / 8 - Number.EPSILON, texels, 2)).toBe(1);
    expect(maxCasterCascade(1 / 8, texels, 2)).toBe(2);
    expect(maxCasterCascade(1 / 4, texels, 2)).toBe(3);
  });

  test.each([
    { profile: "high", mapSize: 1024, texelsCm: [3.8, 10.6, 34.5], binClass: 2 },
    { profile: "ultra", mapSize: 2048, texelsCm: [1.8, 4.1, 8.9, 23], binClass: 3 },
  ])("$profile matches the plan's reference estimates at two texels", ({ mapSize, texelsCm, binClass }) => {
    const texels = texelsCm.map(cm => cascadeTexelSize((cm / 100) * mapSize, mapSize));
    expect(maxCasterCascade(.3, texels, 2)).toBe(binClass);
    expect(maxCasterCascade(1.5, texels, 2)).toBe(texels.length);
  });

  test.each([0, -1, NaN, Infinity])("returns zero for unusable caster input (%s)", (invalid) => {
    expect(maxCasterCascade(invalid, [.1], 2)).toBe(0);
    expect(maxCasterCascade(1, [.1], invalid)).toBe(0);
    expect(maxCasterCascade(1, [.1, invalid], 2)).toBe(0);
  });

  test("handles empty lists and rejects non-increasing sizes even past the radius threshold", () => {
    expect(maxCasterCascade(1, [], 2)).toBe(0);
    expect(() => maxCasterCascade(.01, [.1, .3, .2], 2)).toThrow(RangeError);
    expect(() => maxCasterCascade(.01, [.1, .1], 2)).toThrow(RangeError);
  });
});

describe("casterLayerMask", () => {
  test("includes only classes that reach the requested cascade", () => {
    const layers = [16, 17, 18, 19];
    expect(casterLayerMask(1, layers)).toBe(0x000f0000);
    expect(casterLayerMask(2, layers)).toBe(0x000e0000);
    expect(casterLayerMask(3, layers)).toBe(0x000c0000);
    expect(casterLayerMask(4, layers)).toBe(0x00080000);
    expect(casterLayerMask(5, layers)).toBe(0);
  });

  test("uses signed 32-bit layer semantics and rejects out-of-range layer indices", () => {
    expect(casterLayerMask(1, [0, 31])).toBe((1 << 31) | 1);
    expect(casterLayerMask(1, [16, 32])).toBe(0);
    expect(casterLayerMask(1, [-1])).toBe(0);
    expect(casterLayerMask(1, [NaN])).toBe(0);
    expect(casterLayerMask(1, [16.5])).toBe(0);
    expect(casterLayerMask(1, [])).toBe(0);
  });

  test.each([0, -1, NaN, Infinity, 1.5])("returns an empty mask for an invalid cascade (%s)", (invalid) => {
    expect(casterLayerMask(invalid, [16, 17, 18, 19])).toBe(0);
  });
});
