import { describe, expect, test } from "vitest";
import {
  coverReadPoint, materialTakesNoWeather, MATERIAL_WEATHER_DEFAULTS, snowShare, surfaceWeatherAt, weatheredLook, wetShare,
  type SurfaceResponseSettings, type Vec3,
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
