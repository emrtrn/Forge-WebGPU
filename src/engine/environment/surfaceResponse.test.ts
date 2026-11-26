import { describe, expect, test } from "vitest";
import {
  cavityFromDivergence, coverReadPoint, dryingLateness, hash12, materialTakesNoWeather, MATERIAL_WEATHER_DEFAULTS, PATCH_SIZE_RANGE, patchSizeOf,
  patchySnow, patchyWater, snowShare, SURFACE_PATTERN_DEFAULTS, surfaceAmountAt, surfaceWeatherAt, valueNoise, weatheredLook, wetShare, type SurfaceResponseSettings, type Vec3,
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
    expect(surfaceWeatherAt({ wetness: 1, snowCoverage: 1 }, point, null, settings)).toMatchObject({ wet: 0, snow: 0 });
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
    // Layer 1 (user decision 2026-11-26): the wetness only darkens, 30 % at the default porosity; no gloss.
    expect(porous.roughness).toBe(0.8);
    expect(hard.roughness).toBe(0.8);
    expect(weatheredLook(look, { wet: 1, snow: 0 }, 0.5, snowColor).color[0]).toBeCloseTo(0.35, 12);
    // Layer 2: a wet patch takes wetGloss (roughness 1 - gloss at porosity 0.5), hard glossier than porous.
    const patch = (porosity: number, gloss?: number) => weatheredLook(look, { wet: 1, snow: 0, patch: 1 }, porosity, snowColor, gloss).roughness;
    expect(patch(0.5)).toBeCloseTo(0.3, 12);
    expect(patch(0.5, 0.9)).toBeCloseTo(0.1, 12);
    expect(patch(0)).toBeLessThan(patch(1));
    // Layer 3: a puddle is a mirror on any surface.
    expect(weatheredLook(look, { wet: 1, snow: 0, patch: 1, pool: 1 }, 1, snowColor).roughness).toBeCloseTo(0.03, 12);
    expect(weatheredLook(look, { wet: 1, snow: 1 }, 0.5, snowColor)).toEqual({ color: snowColor, roughness: 0.9, metalness: 0 });
  });

  test("standing water only on flat ground: a slope steeper than puddleMaxSlopeDeg, or a wall, takes the wet film (user decision 2026-11-26)", () => {
    const look = { color: [0.5, 0.4, 0.3] as const, roughness: 0.8, metalness: 0 };
    const snowColor = [1, 1, 1] as const;
    const slope = (deg: number): Vec3 => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180), 0];
    const wetAt = (normal: Vec3, maxSlope?: number, patches = 1, puddles = 1) => {
      const weather = surfaceWeatherAt({ wetness: 1, patches, puddles, snowCoverage: 0 }, { position: [0, 0, 0], normal, covered: 0 }, null, { ...settings, puddleMaxSlopeDeg: maxSlope });
      return { weather, look: weatheredLook(look, weather, 0.5, snowColor) };
    };
    const flat = wetAt(UP);
    const hill = wetAt(slope(20));
    expect(flat.weather).toMatchObject({ patch: 1, pool: 1 });
    expect(flat.look.roughness).toBeCloseTo(0.03, 12);
    // The 20 degree hill is as wet (dark) as the flat ground, without gloss.
    expect(hill.weather).toMatchObject({ wet: 1, patch: 0, pool: 0 });
    expect(hill.look.color[0]).toBeCloseTo(flat.look.color[0], 12);
    expect(hill.look.roughness).toBe(0.8);
    expect(wetAt(WALL).weather).toMatchObject({ patch: 0, pool: 0 });
    // The limit is the World Environment's: at 30 degrees the same hill holds water.
    expect(wetAt(slope(20), 30).weather.pool).toBe(1);
    // Flat ground: outside the patches dark only, in a patch outside its puddle the wet gloss.
    expect(wetAt(UP, undefined, 0, 0).look.roughness).toBe(0.8);
    expect(wetAt(UP, undefined, 1, 0).look.roughness).toBeCloseTo(0.3, 12);
    // A wet patch darkens its point even with the wetness dry.
    expect(surfaceWeatherAt({ wetness: 0, patches: 1, puddles: 0, snowCoverage: 0 }, { position: [0, 0, 0], normal: UP, covered: 0 }, null, settings)).toMatchObject({ wet: 1, patch: 1, pool: 0 });
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

  test("the wetness is an even film: every point the same, wetting and drying (user decision 2026-11-26)", () => {
    for (const wetness of [0, 0.3, 0.7, 1]) {
      const seen = [[0, 0], [12.5, -3], [-40, 77]].map(([x, z]) => surfaceAmountAt({ wetness, puddleFill: 0.5, snowCoverage: 0 }, [x!, 0, z!], 0.7).wetness);
      expect(new Set(seen).size).toBe(1);
      expect(seen[0]).toBe(wetness);
    }
  });

  test("standing water fills the late places (hollows, noise) first and drains them last; the puddle is the patch's inner part", () => {
    for (const late of [0, 0.3, 0.7, 1]) {
      expect(patchyWater(1, late).patch).toBe(1);
      expect(patchyWater(0, late)).toEqual({ patch: 0, puddle: 0 });
      expect(patchyWater(1, late, 1, 1).puddle).toBe(1);
    }
    for (const fill of [0.2, 0.5, 0.8]) expect(patchyWater(fill, 0.9).patch).toBeGreaterThan(patchyWater(fill, 0.1).patch);
    let previous = 1;
    for (let fill = 1; fill >= 0; fill -= 0.05) {
      const value = patchyWater(fill, 0.5).patch;
      expect(value).toBeLessThanOrEqual(previous + 1e-12);
      previous = value;
    }
    // Nested: wherever there is a puddle there is a patch at least as full; core 0 has none.
    for (const late of [0.1, 0.4, 0.7, 0.95]) {
      for (const fill of [0.3, 0.6, 1]) {
        const water = patchyWater(fill, late, 1, 0.5);
        expect(water.patch).toBeGreaterThanOrEqual(water.puddle);
        expect(patchyWater(fill, late, 1, 0).puddle).toBe(0);
      }
    }
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

  test("a point's amount is the even wetness, its puddles and its patchy snow, in one pattern", () => {
    const position: Vec3 = [4, 0, -9];
    const late = dryingLateness(4, -9, 0.4);
    const amount = surfaceAmountAt({ wetness: 0.5, puddleFill: 0.2, snowCoverage: 0.3 }, position, 0.4);
    expect(amount.snowCoverage).toBe(patchySnow(0.3, late));
    expect(amount.patches).toBe(patchyWater(0.2, late).patch);
    expect(amount.puddles).toBe(patchyWater(0.2, late).puddle);
    expect(amount.wetness).toBe(0.5);
    expect(surfaceAmountAt({ wetness: 1, snowCoverage: 1 }, position)).toEqual({ wetness: 1, patches: 0, puddles: 0, snowCoverage: 1 });
  });
});

describe("patch spread and size (W5 refinement)", () => {
  const grid = Array.from({ length: 400 }, (_, i) => [(i % 20) * 1.3, Math.floor(i / 20) * 1.3] as const);

  test("at the defaults the ends are W4's: none and full snow, none and full wetness, everywhere", () => {
    for (const late of [0, 0.3, 0.7, 1]) {
      expect(patchySnow(0, late)).toBe(0);
      expect(patchySnow(1, late)).toBe(1);
      expect(patchyWater(1, late, 1).patch).toBe(1);
      expect(patchyWater(0, late, 1).patch).toBe(0);
    }
    for (const [x, z] of grid) {
      expect(surfaceAmountAt({ wetness: 1, puddleFill: 1, snowCoverage: 1 }, [x, 0, z], 0, SURFACE_PATTERN_DEFAULTS)).toMatchObject({ wetness: 1, patches: 1, snowCoverage: 1 });
      expect(surfaceAmountAt({ wetness: 0, puddleFill: 0, snowCoverage: 0 }, [x, 0, z])).toEqual({ wetness: 0, patches: 0, puddles: 0, snowCoverage: 0 });
    }
  });

  test("snow settles in the late places (hollows) first and melts open patch by patch", () => {
    for (const coverage of [0.2, 0.5, 0.8]) expect(patchySnow(coverage, 0.9)).toBeGreaterThan(patchySnow(coverage, 0.1));
    expect(patchySnow(0.35, 1)).toBe(1);
    expect(patchySnow(0.35, 0)).toBe(0);
  });

  test("the spread caps the wet patches and the snow even with the live state at 1; the darkening stays everywhere (user decision 2026-11-26)", () => {
    const pattern = { wetSpread: 0.4, snowSpread: 0.4, patchSize: 1 };
    const seen = grid.map(([x, z]) => surfaceAmountAt({ wetness: 1, puddleFill: 1, snowCoverage: 1 }, [x, 0, z], 0, pattern));
    for (const key of ["patches", "snowCoverage"] as const) {
      const values = seen.map((amount) => amount[key] ?? 0);
      expect(Math.min(...values), `${key}: ground without remains`).toBe(0);
      expect(Math.max(...values), `${key}: the late places are full`).toBe(1);
    }
    expect(seen.every((amount) => amount.wetness === 1), "the darkening is not cut by the wet spread").toBe(true);
    expect(seen.every((amount) => (amount.puddles ?? 0) <= (amount.patches ?? 0)), "puddles lie inside the patches").toBe(true);
    expect(seen.some((amount) => (amount.patches ?? 0) - (amount.puddles ?? 0) > 0.3), "a patch has a rim without water").toBe(true);
    // At spread 0 nothing shows; the spread is the share, like the amount below 1.
    expect(patchyWater(1, 1, 0).patch).toBe(0);
    expect(patchySnow(1, 1, 0)).toBe(0);
    expect(patchySnow(1, 0.6, 0.5)).toBe(patchySnow(0.5, 0.6));
    // The spread only grows the patches.
    for (const late of [0.2, 0.6, 0.9]) expect(patchyWater(1, late, 0.7).patch).toBeGreaterThanOrEqual(patchyWater(1, late, 0.5).patch);
  });

  test("patch size scales both noise layers", () => {
    for (const [x, z] of grid.slice(0, 40)) {
      expect(dryingLateness(x * 2, z * 2, 0, 2)).toBeCloseTo(dryingLateness(x, z, 0, 1), 12);
      expect(surfaceAmountAt({ wetness: 0.5, puddleFill: 0.5, snowCoverage: 0.5 }, [x * 3, 0, z * 3], 0, { patchSize: 3 }).patches)
        .toBeCloseTo(surfaceAmountAt({ wetness: 0.5, puddleFill: 0.5, snowCoverage: 0.5 }, [x, 0, z]).patches!, 12);
    }
    expect(patchSizeOf({ patchSize: 100 })).toBe(PATCH_SIZE_RANGE[1]);
    expect(patchSizeOf({ patchSize: 0 })).toBe(PATCH_SIZE_RANGE[0]);
  });
});
