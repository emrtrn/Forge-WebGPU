import { describe, expect, test } from "vitest";
import {
  cavityFromDivergence, coverReadPoint, dryingLateness, hash12, materialTakesNoWeather, MATERIAL_WEATHER_DEFAULTS, PATCH_SIZE_RANGE, patchSizeOf,
  patchySnow, patchyWetness, snowShare, SURFACE_PATTERN_DEFAULTS, surfaceAmountAt, surfaceWeatherAt, valueNoise, weatheredLook, wetShare, type SurfaceResponseSettings, type Vec3,
} from "./surfaceResponse.ts";

const settings: SurfaceResponseSettings = {
  verticalWetting: 0.35, windwardWetting: 0.5, snowSlopeStartDeg: 30, snowSlopeEndDeg: 55, snowMinAltitude: null, snowAltitudeBlend: 20,
};
const unit = (x: number, y: number, z: number): Vec3 => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
const UP: Vec3 = [0, 1, 0];
const WALL: Vec3 = [1, 0, 0];
const DOWN: Vec3 = [0, -1, 0];
const at = (normal: Vec3, covered = 0) => surfaceWeatherAt({ wetness: 0.8, snowCoverage: 0 }, { position: [0, 0, 0], normal, covered }, null, settings).wet;

describe("surface response (plan phase W4, HV-04)", () => {
  test("at the same wetness: horizontal > vertical > facing down, whatever the surface", () => {
    for (const material of [MATERIAL_WEATHER_DEFAULTS, { ...MATERIAL_WEATHER_DEFAULTS, porosity: 0 }, { ...MATERIAL_WEATHER_DEFAULTS, wetting: 0.5 }]) {
      const wet = (normal: Vec3) => surfaceWeatherAt({ wetness: 0.8, snowCoverage: 0 }, { position: [0, 0, 0], normal, covered: 0 }, null, settings, material).wet;
      expect(wet(UP)).toBeGreaterThan(wet(WALL));
      expect(wet(WALL)).toBeGreaterThan(wet(DOWN));
      expect(wet(DOWN)).toBe(0);
    }
    expect(at(UP)).toBeCloseTo(0.8, 12);
    expect(at(WALL)).toBeCloseTo(0.8 * 0.35, 12);
  });

  test("the share falls steadily from up to down; a 45° roof is as wet as flat ground", () => {
    let previous = Infinity;
    for (let deg = 0; deg <= 180; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const share = wetShare([Math.sin(a), Math.cos(a), 0], null, settings);
      expect(share).toBeLessThanOrEqual(previous + 1e-12);
      previous = share;
    }
    expect(wetShare(unit(1, 1, 0), null, settings)).toBeCloseTo(1, 12);
    expect(wetShare(unit(1, -1, 0), null, settings)).toBe(0);
  });

  test("the side the wind comes from takes more; the lee side and no wind the standing share", () => {
    const wind = { direction: [1, 0] as const, strength: 1 };
    // Wind blows toward +x: the face looking toward -x takes it.
    const windward = wetShare([-1, 0, 0], wind, settings);
    const lee = wetShare([1, 0, 0], wind, settings);
    expect(windward).toBeCloseTo(0.85, 12);
    expect(lee).toBeCloseTo(0.35, 12);
    expect(wetShare([-1, 0, 0], { direction: [1, 0], strength: 0 }, settings)).toBeCloseTo(0.35, 12);
    expect(wetShare([-1, 0, 0], { direction: [1, 0], strength: 0.5 }, settings)).toBeCloseTo(0.6, 12);
    // Never past a flat face; never below on the face looking down.
    expect(wetShare([-1, 0, 0], wind, { ...settings, verticalWetting: 0.9 })).toBe(1);
    expect(wetShare(DOWN, wind, settings)).toBe(0);
  });

  test("under the cover: dry and snowless", () => {
    const point = { position: [0, 0, 0] as Vec3, normal: UP, covered: 1 };
    expect(surfaceWeatherAt({ wetness: 1, snowCoverage: 1 }, point, null, settings)).toEqual({ wet: 0, snow: 0 });
    expect(at(UP, 0.5)).toBeCloseTo(0.4, 12);
  });

  test("the cover is read above the point and out along the face's horizontal normal", () => {
    expect(coverReadPoint([10, 2, -3], UP)).toEqual([10, 2.2, -3]);
    expect(coverReadPoint([10, 2, -3], WALL)).toEqual([10.4, 2.2, -3]);
  });

  test("snow: the slope window and the altitude floor, times the material's acceptance", () => {
    expect(snowShare(1, 0, settings)).toBe(1);
    expect(snowShare(Math.cos((60 * Math.PI) / 180), 0, settings)).toBe(0);
    expect(snowShare(0, 0, settings)).toBe(0);
    expect(snowShare(-1, 0, settings)).toBe(0);
    const high = { ...settings, snowMinAltitude: 100, snowAltitudeBlend: 20 };
    expect(snowShare(1, 90, high)).toBe(0);
    expect(snowShare(1, 130, high)).toBe(1);
    const point = { position: [0, 0, 0] as Vec3, normal: UP, covered: 0 };
    expect(surfaceWeatherAt({ wetness: 0, snowCoverage: 0.6 }, point, null, settings).snow).toBeCloseTo(0.6, 12);
    expect(surfaceWeatherAt({ wetness: 0, snowCoverage: 0.6 }, point, null, settings, { ...MATERIAL_WEATHER_DEFAULTS, snowAccept: 0.5 }).snow).toBeCloseTo(0.3, 12);
  });

  test("a material that takes neither is left alone", () => {
    expect(materialTakesNoWeather(MATERIAL_WEATHER_DEFAULTS)).toBe(false);
    expect(materialTakesNoWeather({ ...MATERIAL_WEATHER_DEFAULTS, wetting: 0, snowAccept: 0 })).toBe(true);
    expect(materialTakesNoWeather({ ...MATERIAL_WEATHER_DEFAULTS, wetting: 0 })).toBe(false);
  });

  test("wet: porous darkens, hard turns glossy; dry is untouched; snow is white, rough and not metal", () => {
    const look = { color: [0.5, 0.4, 0.3] as const, roughness: 0.8, metalness: 0.5 };
    const snowColor = [0.9, 0.92, 0.95] as const;
    expect(weatheredLook(look, { wet: 0, snow: 0 }, 0.5, snowColor)).toEqual({ color: [0.5, 0.4, 0.3], roughness: 0.8, metalness: 0.5 });
    const porous = weatheredLook(look, { wet: 1, snow: 0 }, 1, snowColor);
    const hard = weatheredLook(look, { wet: 1, snow: 0 }, 0, snowColor);
    expect(porous.color[0]).toBeLessThan(hard.color[0]);
    expect(hard.roughness).toBeLessThan(porous.roughness);
    expect(hard.roughness).toBeCloseTo(0.04, 12);
    // Terrain's 5a look at the default porosity: 30 % darker, roughness at most 0.12.
    const middle = weatheredLook(look, { wet: 1, snow: 0 }, 0.5, snowColor);
    expect(middle.color[0]).toBeCloseTo(0.35, 12);
    expect(middle.roughness).toBeCloseTo(0.12, 12);
    expect(weatheredLook(look, { wet: 1, snow: 1 }, 0.5, snowColor)).toEqual({ color: snowColor, roughness: 0.9, metalness: 0 });
  });
});

describe("patchy drying (plan phase W5, HV-05)", () => {
  test("the hash and noise stay in 0..1 and agree with themselves", () => {
    for (let i = -50; i < 50; i++) {
      const h = hash12(i * 7.3, i * -2.1);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      const n = valueNoise(i * 0.37, i * 0.91);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
    // Lattice points are the hash itself.
    expect(valueNoise(3, -4)).toBe(hash12(3, -4));
  });

  test("full wetness wets every point, none dries every point: W4's look at both ends", () => {
    for (const late of [0, 0.3, 0.7, 1]) {
      expect(patchyWetness(1, 0, late)).toBe(1);
      expect(patchyWetness(0, 0, late)).toBe(0);
    }
  });

  test("while it dries, a late point stays wet longer; standing water keeps the late ones damp", () => {
    for (const wetness of [0.2, 0.5, 0.8]) {
      expect(patchyWetness(wetness, 0, 0.9)).toBeGreaterThan(patchyWetness(wetness, 0, 0.1));
    }
    let previous = 1;
    for (let w = 1; w >= 0; w -= 0.05) {
      const value = patchyWetness(w, 0, 0.5);
      expect(value).toBeLessThanOrEqual(previous + 1e-12);
      previous = value;
    }
    // The film is dry; the hollows hold the water, an early point does not.
    expect(patchyWetness(0, 1, 1)).toBe(1);
    expect(patchyWetness(0, 1, 0.6)).toBeCloseTo(0.6, 12);
    expect(patchyWetness(0, 1, 0)).toBe(0);
    expect(patchyWetness(0, 0.3, 1)).toBeGreaterThan(patchyWetness(0, 0.3, 0.6));
  });

  test("hollows dry last; the noise breaks the ground into patches", () => {
    for (const [x, z] of [[0, 0], [12.5, -3], [-40, 77]] as const) {
      expect(dryingLateness(x, z, 1)).toBe(1);
      expect(dryingLateness(x, z, 0.5)).toBeGreaterThanOrEqual(dryingLateness(x, z, 0));
    }
    const samples = Array.from({ length: 400 }, (_, i) => dryingLateness((i % 20) * 1.3, Math.floor(i / 20) * 1.3));
    expect(Math.min(...samples)).toBeLessThan(0.2);
    expect(Math.max(...samples)).toBeGreaterThan(0.8);
    expect(cavityFromDivergence(0.1)).toBe(0);
    expect(cavityFromDivergence(-0.1)).toBeCloseTo(0.3, 12);
    expect(cavityFromDivergence(-1)).toBe(1);
  });

  test("a point's amount is its patchy wetness and patchy snow, in one pattern", () => {
    const position: Vec3 = [4, 0, -9];
    const late = dryingLateness(4, -9, 0.4);
    const amount = surfaceAmountAt({ wetness: 0.5, puddleFill: 0.2, snowCoverage: 0.3 }, position, 0.4);
    expect(amount.snowCoverage).toBe(patchySnow(0.3, late));
    expect(amount.wetness).toBe(patchyWetness(0.5, 0.2, late));
    expect(surfaceAmountAt({ wetness: 1, snowCoverage: 1 }, position)).toEqual({ wetness: 1, snowCoverage: 1 });
  });
});

describe("patch spread and size (W5 refinement)", () => {
  const grid = Array.from({ length: 400 }, (_, i) => [(i % 20) * 1.3, Math.floor(i / 20) * 1.3] as const);

  test("at the defaults the ends are W4's: none and full snow, none and full wetness, everywhere", () => {
    for (const late of [0, 0.3, 0.7, 1]) {
      expect(patchySnow(0, late)).toBe(0);
      expect(patchySnow(1, late)).toBe(1);
      expect(patchyWetness(1, 1, late, 1)).toBe(1);
      expect(patchyWetness(0, 0, late, 1)).toBe(0);
    }
    for (const [x, z] of grid) {
      expect(surfaceAmountAt({ wetness: 1, puddleFill: 1, snowCoverage: 1 }, [x, 0, z], 0, SURFACE_PATTERN_DEFAULTS)).toEqual({ wetness: 1, snowCoverage: 1 });
      expect(surfaceAmountAt({ wetness: 0, puddleFill: 0, snowCoverage: 0 }, [x, 0, z])).toEqual({ wetness: 0, snowCoverage: 0 });
    }
  });

  test("snow settles in the late places (hollows) first and melts open patch by patch", () => {
    for (const coverage of [0.2, 0.5, 0.8]) expect(patchySnow(coverage, 0.9)).toBeGreaterThan(patchySnow(coverage, 0.1));
    expect(patchySnow(0.35, 1)).toBe(1);
    expect(patchySnow(0.35, 0)).toBe(0);
  });

  test("the spread caps the look even with the live state at 1: some ground stays dry, standing water too", () => {
    const pattern = { wetSpread: 0.4, snowSpread: 0.4, patchSize: 1 };
    const seen = grid.map(([x, z]) => surfaceAmountAt({ wetness: 1, puddleFill: 1, snowCoverage: 1 }, [x, 0, z], 0, pattern));
    for (const key of ["wetness", "snowCoverage"] as const) {
      const values = seen.map((amount) => amount[key]);
      expect(Math.min(...values), `${key}: dry ground remains`).toBe(0);
      expect(Math.max(...values), `${key}: the late places are full`).toBe(1);
    }
    // At spread 0 nothing shows; the spread is the share, like the amount below 1.
    expect(patchyWetness(1, 1, 1, 0)).toBe(0);
    expect(patchySnow(1, 1, 0)).toBe(0);
    expect(patchySnow(1, 0.6, 0.5)).toBe(patchySnow(0.5, 0.6));
    // The spread only grows the patches.
    for (const late of [0.2, 0.6, 0.9]) expect(patchyWetness(1, 1, late, 0.7)).toBeGreaterThanOrEqual(patchyWetness(1, 1, late, 0.5));
  });

  test("patch size scales both noise layers", () => {
    for (const [x, z] of grid.slice(0, 40)) {
      expect(dryingLateness(x * 2, z * 2, 0, 2)).toBeCloseTo(dryingLateness(x, z, 0, 1), 12);
      expect(surfaceAmountAt({ wetness: 0.5, snowCoverage: 0.5 }, [x * 3, 0, z * 3], 0, { patchSize: 3 }).wetness)
        .toBeCloseTo(surfaceAmountAt({ wetness: 0.5, snowCoverage: 0.5 }, [x, 0, z]).wetness, 12);
    }
    expect(patchSizeOf({ patchSize: 100 })).toBe(PATCH_SIZE_RANGE[1]);
    expect(patchSizeOf({ patchSize: 0 })).toBe(PATCH_SIZE_RANGE[0]);
  });
});
