import { describe, expect, test } from "vitest";
import {
  cullInstanceCounts,
  fadeShown,
  frustumPlanesOf,
  lodStartsOfScreenSizes,
  maxAxisScale,
  measuredDistance,
  mirrorCullView,
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

  test("planes of a WebGL projection (clip depth -w..w, the WebGL2 twin)", () => {
    const f = 1 / Math.tan(Math.PI / 6);
    const [near, far] = [0.1, 1000];
    const gl = [f, 0, 0, 0, 0, f, 0, 0, 0, 0, -(far + near) / (far - near), -1, 0, 0, (-2 * far * near) / (far - near), 0];
    const planes = frustumPlanesOf(multiply(gl, view([0, 0, 0])), "minusOneToOne");
    const inside = (z: number): boolean => {
      for (let p = 0; p < 24; p += 4) if (planes[p + 2]! * z + planes[p + 3]! < 0) return false;
      return true;
    };
    expect([inside(-0.05), inside(-0.2), inside(-500), inside(-1500)]).toEqual([false, true, true, false]);
    // Read as 0..w, the same matrix would cut at its middle depth.
    const wrong = frustumPlanesOf(multiply(gl, view([0, 0, 0])));
    expect(wrong[18]! * -0.15 + wrong[19]!).toBeLessThan(0);
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

  test("measured distance and how much the fade band shows", () => {
    const list = matrices(translation(3, 4, 0, 2));
    expect(measuredDistance(list, 0, "origin", [0, 0, 0])).toBe(5);
    expect(measuredDistance(list, 0, "scaled", [0, 0, 0])).toBe(2.5);
    expect([fadeShown(10, 20, 40), fadeShown(30, 20, 40), fadeShown(40, 20, 40)]).toEqual([1, 0.5, 0]);
    expect([fadeShown(39, 40, 40), fadeShown(40, 40, 40)]).toEqual([1, 0]);
  });

  test("scale and LOD starts of screen sizes", () => {
    expect(maxAxisScale([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0)).toBe(3);
    const [start] = lodStartsOfScreenSizes(2, [0.25], 90);
    expect(start).toBeCloseTo(8, 10);
    expect(lodStartsOfScreenSizes(2, [0], 90)).toEqual([NO_CULL_DISTANCE]);
  });
});

describe("mirrorCullView (R9a step 1)", () => {
  const inside = (planes: ArrayLike<number>, p: readonly number[]): boolean => {
    for (let at = 0; at < 24; at += 4) if (planes[at]! * p[0]! + planes[at + 1]! * p[1]! + planes[at + 2]! * p[2]! + planes[at + 3]! < -1e-5) return false;
    return true;
  };
  // A box x, z in -1..1, y in 1..3; an infinite plane (0, 0, 0, 1) stays always inside.
  const box = { planes: Float32Array.from([1, 0, 0, 1, -1, 0, 0, 1, 0, 1, 0, -1, 0, -1, 0, 3, 0, 0, 1, 1, 0, 0, 0, 1]), origin: [0, 5, 10] as const };

  test("a horizontal mirror reflects the planes and the origin through the water level", () => {
    const mirrored = mirrorCullView(box, [0, 1, 0, 0]);
    expect(mirrored.origin).toEqual([0, -5, 10]);
    expect(inside(mirrored.planes, [0, -2, 0])).toBe(true);
    expect(inside(mirrored.planes, [0, 2, 0])).toBe(false);
    expect(Array.from(mirrored.planes).slice(20, 24)).toEqual([0, 0, 0, 1]);
  });

  test("any mirror: a point is in the mirrored view exactly when its reflection is in the view", () => {
    const length = Math.hypot(0.3, 0.9, -0.2);
    const m = [0.3 / length, 0.9 / length, -0.2 / length] as const, c = 0.7;
    const mirrored = mirrorCullView(box, [m[0], m[1], m[2], c]);
    let seed = 7;
    const random = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 * 8 - 4; };
    for (let i = 0; i < 500; i += 1) {
      const p = [random(), random(), random()];
      const side = m[0] * p[0]! + m[1] * p[1]! + m[2] * p[2]! + c;
      const reflected = p.map((value, axis) => value - 2 * side * m[axis]!);
      expect(inside(mirrored.planes, p)).toBe(inside(box.planes, reflected));
    }
  });
});
