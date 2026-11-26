import { describe, expect, test } from "vitest";
import {
  RIPPLE_CLOCK_WRAP, RIPPLE_FADE, RIPPLE_JITTER, RIPPLE_RADIUS, RIPPLE_WIDTH, WATER_RIPPLE_DEFAULTS, rainRippleSlopeAt, rippleActiveShare,
  rippleClock, rippleDistanceFade, rippleFootprintFade, rippleStrengthNow, ringProfileSlope,
} from "./rainRipples.ts";
import { MATERIAL_WEATHER_DEFAULTS, surfaceWeatherAt, type SurfaceResponseSettings } from "./surfaceResponse.ts";

const slopeLength = (rain: number, x: number, z: number, seconds: number, settings = WATER_RIPPLE_DEFAULTS): number => {
  const [gx, gz] = rainRippleSlopeAt(x, z, rippleClock(seconds), rippleActiveShare(rain, settings), settings);
  return Math.hypot(gx, gz);
};
/** The largest ring slope over a patch of water at one moment. */
const peak = (rain: number, seconds: number, settings = WATER_RIPPLE_DEFAULTS): number => {
  let most = 0;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) most = Math.max(most, slopeLength(rain, i * 0.037, j * 0.041, seconds, settings));
  return most;
};

describe("rain rings (plan phase W6, HV-06: rings only in rain)", () => {
  test("no rain, no rings: the strength, the active share and the slope are 0 at any time", () => {
    expect(rippleStrengthNow(0)).toBe(0);
    expect(rippleActiveShare(0)).toBe(0);
    for (const seconds of [0, 0.3, 12.7, 600]) expect(peak(0, seconds)).toBe(0);
    expect(rippleStrengthNow(Number.NaN)).toBe(0);
  });

  test("the active share is the density × the live rain: light rain is sparse, a downpour dense", () => {
    expect(rippleActiveShare(1)).toBeCloseTo(WATER_RIPPLE_DEFAULTS.rippleDensity, 12);
    expect(rippleActiveShare(0.5)).toBeCloseTo(WATER_RIPPLE_DEFAULTS.rippleDensity * 0.5, 12);
    expect(rippleActiveShare(1, { rippleDensity: 0 })).toBe(0);
    expect(rippleStrengthNow(1, { rippleDensity: 0 })).toBe(0);
    expect(rippleStrengthNow(0.2, { rippleStrength: 1.5 })).toBe(1.5);
    // More rain lights more cells: the count of moving points grows with it.
    const moving = (rain: number) => {
      let count = 0;
      for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) if (slopeLength(rain, i * 0.05, j * 0.05, 3.1) > 0) count += 1;
      return count;
    };
    expect(moving(0.15)).toBeLessThan(moving(1));
    expect(moving(1)).toBeGreaterThan(0);
  });

  test("they fade with distance (gone at the far edge, scaled by the ring size) and where a pixel outgrows a ring", () => {
    expect(rippleDistanceFade(0)).toBe(1);
    expect(rippleDistanceFade(RIPPLE_FADE[0])).toBe(1);
    expect(rippleDistanceFade(RIPPLE_FADE[1])).toBe(0);
    let previous = 1;
    for (let d = 0; d <= 50; d += 0.5) {
      const fade = rippleDistanceFade(d);
      expect(fade).toBeLessThanOrEqual(previous + 1e-12);
      previous = fade;
    }
    expect(rippleDistanceFade(RIPPLE_FADE[1], 0.5)).toBeGreaterThan(0);
    expect(rippleDistanceFade(RIPPLE_FADE[1] * 2, 0.5)).toBe(0);
    const ring = WATER_RIPPLE_DEFAULTS.rippleSize * RIPPLE_WIDTH;
    expect(rippleFootprintFade(0.1 * ring)).toBe(1);
    expect(rippleFootprintFade(ring)).toBe(0);
  });

  test("a ring stays in its cell: no seam, the slope is continuous across cell borders", () => {
    expect(RIPPLE_JITTER / 2 + RIPPLE_RADIUS + RIPPLE_WIDTH).toBeLessThan(0.5);
    expect(ringProfileSlope(0)).toBeCloseTo(1, 12);
    expect(ringProfileSlope(1)).toBe(0);
    expect(ringProfileSlope(-1)).toBe(0);
    const share = rippleActiveShare(1);
    const clock = rippleClock(7.3);
    let jump = 0;
    let moving = 0;
    for (let i = 0; i < 20000; i++) {
      const x = i * 0.0013 - 3.7;
      const z = x * 0.37 + 1.1;
      const [ax, az] = rainRippleSlopeAt(x, z, clock, share);
      const [bx, bz] = rainRippleSlopeAt(x + 1e-4, z, clock, share);
      jump = Math.max(jump, Math.hypot(bx - ax, bz - az));
      if (ax !== 0 || az !== 0) moving += 1;
    }
    expect(moving).toBeGreaterThan(1000);
    expect(jump).toBeLessThan(0.05);
  });

  test("simulation time drives them: the same second is the same water, the clock wraps on a whole period", () => {
    expect(slopeLength(1, 1.23, 4.56, 9.7)).toBe(slopeLength(1, 1.23, 4.56, 9.7));
    const at = (seconds: number) => rainRippleSlopeAt(1.23, 4.56, rippleClock(seconds), rippleActiveShare(1));
    const before = at(9.7);
    const after = at(9.7 + RIPPLE_CLOCK_WRAP);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
    expect(peak(1, 2)).not.toBe(peak(1, 2.3));
  });
});

describe("a material's puddleAccept (plan phase W6)", () => {
  const settings: SurfaceResponseSettings = {
    verticalWetting: 0.35, windwardWetting: 0.5, snowSlopeStartDeg: 30, snowSlopeEndDeg: 55, snowMinAltitude: null, snowAltitudeBlend: 20,
  };
  const point = { position: [0, 0, 0] as const, normal: [0, 1, 0] as const, covered: 0 };
  test("scales the wet patch and the puddle (and so their ripples); the even darkening stays", () => {
    const amount = { wetness: 0.4, snowCoverage: 0, patches: 1, puddles: 1 };
    const full = surfaceWeatherAt(amount, point, null, settings, MATERIAL_WEATHER_DEFAULTS);
    const half = surfaceWeatherAt(amount, point, null, settings, { ...MATERIAL_WEATHER_DEFAULTS, puddleAccept: 0.5 });
    const none = surfaceWeatherAt(amount, point, null, settings, { ...MATERIAL_WEATHER_DEFAULTS, puddleAccept: 0 });
    expect(full.pool).toBe(1);
    expect(half.pool).toBeCloseTo(0.5, 12);
    expect(half.patch).toBeCloseTo(0.5, 12);
    expect(none.pool).toBe(0);
    expect(none.patch).toBe(0);
    expect(none.wet).toBeCloseTo(0.4, 12);
    expect(full.wet).toBe(1);
  });
});
