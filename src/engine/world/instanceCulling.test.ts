import { describe, expect, test } from "vitest";
import {
  cullInstanceCounts,
  frustumPlanesOf,
  lodStartsOfScreenSizes,
  maxAxisScale,
  NO_CULL_DISTANCE,
  type InstanceCullBatch,
} from "./instanceCulling.ts";

/** Column-major product a × b. */
function multiply(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) for (let k = 0; k < 4; k += 1) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

/** WebGPU perspective (clip depth 0..w), reversed (near → 1, far → 0) with an infinite far plane when `far` is Infinity. */
function perspective(fovDeg: number, aspect: number, near: number, far: number, reversed: boolean): number[] {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const m = new Array<number>(16).fill(0);
  m[0] = f / aspect;
  m[5] = f;
  m[11] = -1;
  if (reversed && far === Infinity) { m[10] = 0; m[14] = near; }
  else if (reversed) { m[10] = near / (far - near); m[14] = (far * near) / (far - near); }
  else { m[10] = far / (near - far); m[14] = (near * far) / (near - far); }
  return m;
}

/** A camera at `eye` looking down -Z (no rotation): view = translate(-eye). */
const view = (eye: readonly [number, number, number]): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -eye[0], -eye[1], -eye[2], 1];
const translation = (x: number, y: number, z: number, s = 1): number[] => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, x, y, z, 1];
const matrices = (...list: number[][]): Float32Array => Float32Array.from(list.flat());
const BATCH: InstanceCullBatch = { center: [0, 1, 0], radius: 1, distanceMode: "origin", cullEnd: NO_CULL_DISTANCE, lodStarts: [] };

describe("instance culling reference", () => {
  test("planes of a reversed, infinite-far projection: inside, outside, and no far plane", () => {
    for (const projection of [perspective(60, 1, 0.1, 1000, false), perspective(60, 1, 0.1, 1000, true), perspective(60, 1, 0.1, Infinity, true)]) {
      const planes = frustumPlanesOf(multiply(projection, view([0, 0, 0])));
      const inside = (x: number, y: number, z: number): boolean => {
        for (let p = 0; p < 24; p += 4) if (planes[p]! * x + planes[p + 1]! * y + planes[p + 2]! * z + planes[p + 3]! < 0) return false;
        return true;
      };
      expect(inside(0, 0, -10)).toBe(true);
      expect(inside(0, 0, 10)).toBe(false);
      expect(inside(0, 0, -0.05)).toBe(false);
      expect(inside(20, 0, -10)).toBe(false);
      expect(inside(0, -20, -10)).toBe(false);
      for (let p = 0; p < 24; p += 4) expect(Math.hypot(planes[p]!, planes[p + 1]!, planes[p + 2]!) || planes[p + 3]).toBeCloseTo(1, 5);
    }
    expect(Array.from(frustumPlanesOf(multiply(perspective(60, 1, 0.1, Infinity, true), view([0, 0, 0]))).slice(16, 20))).toEqual([0, 0, 0, 1]);
  });

  test("an instance is drawn when its sphere touches the view and it is nearer than the cull end", () => {
    const planes = frustumPlanesOf(multiply(perspective(60, 1, 0.1, 1000, true), view([0, 0, 0])));
    const list = matrices(
      translation(0, -1, -10), // ahead
      translation(0, -1, 10), // behind
      translation(6.4, -1, -10), // outside on the right, its 1 m sphere still touches (tan 30° × 10 ≈ 5.77)
      translation(8, -1, -10), // outside, the sphere misses
      translation(0, -1, -500), // ahead, far
      translation(0, -2, -10, 3), // ahead, scale 3
    );
    const near = cullInstanceCounts(list, 6, { ...BATCH, cullEnd: 100 }, { planes, origin: [0, 0, 0] });
    expect(near.visible).toEqual([[0, 2, 5]]);
    expect(near.counts).toEqual([3]);
    expect(near.certain).toEqual([3]);
    expect(near.possible).toEqual([3]);
    // Scaled: the scale-3 copy measures 10.2 / 3 and stays; past the end 100 · 3 a copy would still cull.
    const scaled = cullInstanceCounts(list, 6, { ...BATCH, cullEnd: 4, distanceMode: "scaled" }, { planes, origin: [0, 0, 0] });
    expect(scaled.visible).toEqual([[5]]);
    // Never culled by distance: the far one comes back.
    expect(cullInstanceCounts(list, 6, BATCH, { planes, origin: [0, 0, 0] }).visible).toEqual([[0, 2, 4, 5]]);
  });

  test("LODs by measured distance, and the f32 margin at a boundary", () => {
    const planes = frustumPlanesOf(multiply(perspective(60, 1, 0.1, Infinity, true), view([0, 0, 0])));
    const list = matrices(translation(0, 0, -5), translation(0, 0, -50), translation(0, 0, -150), translation(0, 0, -100));
    const result = cullInstanceCounts(list, 4, { ...BATCH, center: [0, 0, 0], lodStarts: [20, 100] }, { planes, origin: [0, 0, 0] });
    expect(result.visible).toEqual([[0], [1], [2, 3]]);
    // The copy at exactly 100 m could land in LOD 1 or 2 in f32.
    expect(result.certain).toEqual([1, 1, 1]);
    expect(result.possible).toEqual([1, 2, 2]);
    expect(() => cullInstanceCounts(list, 4, { ...BATCH, lodStarts: [1, 2, 3, 4] }, { planes, origin: [0, 0, 0] })).toThrow(/at most 4/);
  });

  test("scale and LOD starts of screen sizes", () => {
    expect(maxAxisScale([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0)).toBe(3);
    const [start] = lodStartsOfScreenSizes(2, [0.25], 90);
    expect(start).toBeCloseTo(8, 10);
    expect(lodStartsOfScreenSizes(2, [0], 90)).toEqual([NO_CULL_DISTANCE]);
  });
});
