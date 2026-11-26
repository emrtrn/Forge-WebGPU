import { describe, expect, test } from "vitest";
import {
  COVER_CASCADES, coverAmount, coverAt, coverEdgeWeight, coverHeightFromDepth, coverNeedsRecentre,
  coverTexel, placeCover, type CoverCascadeSpec, type CoverMap,
} from "./precipitationCover.ts";

const near = COVER_CASCADES[0]!;
const far = COVER_CASCADES[1]!;

function makeMap(cascade: CoverCascadeSpec, reversed = false): CoverMap {
  const spec = { ...cascade, resolution: 64 };
  return {
    spec,
    placement: placeCover(spec, [0, 0, 0]),
    depth: new Float32Array(spec.resolution ** 2).fill(reversed ? 0 : 1),
    reversed,
  };
}

describe("precipitation cover", () => {
  test("places the slab at camera height and snaps the horizontal axes to the nearest texel", () => {
    expect(coverTexel(near)).toBe(0.0625);
    expect(placeCover(near, [10.03, 5, -7.01])).toEqual({ centerX: 10, centerZ: -7, top: 505, bottom: -295 });
    expect(placeCover(near, [10.04, 5, -7.04])).toMatchObject({ centerX: 10.0625, centerZ: -7.0625 });
  });

  test("recentres past the horizontal or vertical threshold and keeps a placement for a bad camera", () => {
    const placement = placeCover(near, [10, 5, -7]);
    expect(coverNeedsRecentre(near, null, [10, 5, -7])).toBe(true);
    expect(coverNeedsRecentre(near, placement, [17.9, 104.9, 0.9])).toBe(false);
    expect(coverNeedsRecentre(near, placement, [18, 105, 1])).toBe(false);
    expect(coverNeedsRecentre(near, placement, [18.01, 5, -7])).toBe(true);
    expect(coverNeedsRecentre(near, placement, [10, 5, -15.01])).toBe(true);
    expect(coverNeedsRecentre(near, placement, [10, -95.01, -7])).toBe(true);
    expect(coverNeedsRecentre(near, placement, [NaN, 300, -7])).toBe(false);
    expect(coverNeedsRecentre(near, null, [NaN, 300, -7])).toBe(true);
  });

  test.each([false, true])("decodes orthographic depths and detects clear texels (reversed: %s)", (reversed) => {
    const placement = placeCover(near, [0, 5, 0]);
    const depth = (t: number) => reversed ? 1 - t : t;
    expect(coverHeightFromDepth(placement, depth(0), reversed)).toBe(505);
    expect(coverHeightFromDepth(placement, depth(0.5), reversed)).toBe(105);
    expect(coverHeightFromDepth(placement, depth(0.999), reversed)).toBeCloseTo(-294.2);
    expect(coverHeightFromDepth(placement, depth(1), reversed)).toBeNull();
    expect(coverHeightFromDepth(placement, depth(0.9999995), reversed)).toBeNull();
    expect(coverHeightFromDepth(placement, Infinity, reversed)).toBeNull();
  });

  test("fades smoothly toward the square's border, including at corners", () => {
    const placement = placeCover(near, [10, 0, -7]);
    const weight = (r: number) => coverEdgeWeight(near, placement, 10 + r * 32, -7 - r * 32);
    expect(weight(0)).toBe(1);
    expect(weight(0.85)).toBe(1);
    expect(weight(0.8875)).toBeCloseTo(0.84375);
    expect(weight(0.925)).toBeCloseTo(0.5);
    expect(weight(0.9625)).toBeCloseTo(0.15625);
    expect(weight(1)).toBe(0);
    expect(weight(1.1)).toBe(0);
  });

  test("leaves the surface exposed and reaches full cover a quarter metre below it", () => {
    expect(coverAmount(null, 1)).toBe(0);
    expect(coverAmount(3, 3)).toBe(0);
    expect(coverAmount(3, 3.5)).toBe(0);
    expect(coverAmount(3, 2.9375)).toBe(0.15625);
    expect(coverAmount(3, 2.75)).toBe(1);
    expect(coverAmount(3, 1)).toBe(1);
  });

  test("samples the containing texel and uses far coverage beyond the near square", () => {
    const nearMap = makeMap(near);
    const farMap = makeMap(far, true);
    // The near roof occupies [-1, 1) on both axes, at y = 3.
    nearMap.depth.fill(497 / 800, 31 * 64 + 31, 31 * 64 + 33);
    nearMap.depth.fill(497 / 800, 32 * 64 + 31, 32 * 64 + 33);
    const maps = [nearMap, farMap];
    expect(coverAt(maps, 0.99, 1, -0.25)).toBe(1);
    expect(coverAt(maps, 0.99, 3.5, -0.25)).toBe(0);
    expect(coverAt(maps, 1, 1, -0.25)).toBe(0);
    expect(coverAt(maps, 130, 1, 0)).toBe(0);
    expect(coverAt(maps, 42, 1, -10)).toBe(0);

    farMap.depth[29 * 64 + 42] = 303 / 800;
    expect(coverAt(maps, 42, 1, -10)).toBe(1);
  });

  test("hands cover over to the far map across the near border band", () => {
    const nearMap = makeMap(near);
    const farMap = makeMap(far);
    const maps = [nearMap, farMap];
    nearMap.depth[23 * 64 + 61] = 497 / 800;

    // x = 29.6 is halfway through the 4.8 m near fade band.
    expect(coverAt(maps, 29.6, 1, -8.5)).toBeCloseTo(0.5);
    farMap.depth[29 * 64 + 39] = 497 / 800;
    expect(coverAt(maps, 29.6, 1, -8.5)).toBe(1);
    expect(coverAt(maps, 29.6, 1, -9.5)).toBeCloseTo(0.5);

    farMap.depth[32 * 64 + 32] = 497 / 800;
    expect(coverAt(maps, 0, 1, 0)).toBe(0);
  });
});
