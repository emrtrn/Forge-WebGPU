import { describe, expect, test } from "vitest";
import {
  advanceOffset, CAMERA_CUT_DISTANCE, gustFactor, leanVelocity, particleCount, precipitationVelocity, volumePhase, type Vec3Tuple,
} from "./precipitationMotion.ts";
import { resolveWind } from "./wind.ts";

const size: Vec3Tuple = [16, 12, 16];
/** Where the shader draws a particle of this seed. */
const particle = (seed: Vec3Tuple, offset: Vec3Tuple, camera: Vec3Tuple): Vec3Tuple => {
  const phase = volumePhase(offset, camera, size, [0, 0, 0]);
  return [0, 1, 2].map((a) => camera[a]! + (((seed[a]! + phase[a]!) % 1) - 0.5) * size[a]!) as Vec3Tuple;
};

describe("precipitation motion", () => {
  test("a moving camera leaves the particles where they are in the world, far from the origin too", () => {
    for (const base of [[0, 0, 0], [8123.4, 350.2, -7999.9]] as Vec3Tuple[]) {
      const offset: Vec3Tuple = [3.2, 7.1, 1.4];
      const seed: Vec3Tuple = [0.3, 0.6, 0.45];
      const before = particle(seed, offset, base);
      const after = particle(seed, offset, [base[0] + 0.7, base[1] - 0.2, base[2] + 0.4]);
      // The same place, or wrapped by whole volumes.
      for (let a = 0; a < 3; a += 1) {
        const apart = (after[a]! - before[a]!) / size[a]!;
        expect(Math.abs(apart - Math.round(apart))).toBeLessThan(1e-9);
      }
    }
  });

  test("particles move with the velocity; a pause and bad steps hold them; hours of rain stay in the volume", () => {
    const offset: Vec3Tuple = [0, 0, 0];
    const seed: Vec3Tuple = [0.5, 0.5, 0.5];
    const start = particle(seed, offset, [0, 0, 0]);
    advanceOffset(offset, [1, -9, 0.5], size, 0.1);
    const moved = particle(seed, offset, [0, 0, 0]);
    expect(moved[0] - start[0]).toBeCloseTo(0.1, 9);
    expect(moved[1] - start[1]).toBeCloseTo(-0.9, 9);
    expect(moved[2] - start[2]).toBeCloseTo(0.05, 9);
    const held = [...offset];
    for (const bad of [0, -1, NaN, Infinity]) advanceOffset(offset, [1, -9, 0.5], size, bad);
    expect(offset).toEqual(held);
    for (let i = 0; i < 100_000; i += 1) advanceOffset(offset, [3, -9, 2], size, 1 / 30);
    for (let a = 0; a < 3; a += 1) {
      expect(offset[a]).toBeGreaterThanOrEqual(0);
      expect(offset[a]).toBeLessThanOrEqual(size[a]!);
    }
    const phase = volumePhase(offset, [1e5, -1e5, 12.345], size, [0, 0, 0]);
    for (const value of phase) { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThan(1); }
  });

  test("the wind carries rain and snow along its direction; calm air falls straight; gusts average out", () => {
    const wind = resolveWind({ directionDeg: 90, strength: 0.5, gust: 0 }, undefined, null);
    const rain = precipitationVelocity("rain", 9, 1, wind, 3);
    expect(rain[0]).toBeCloseTo(4, 9);
    expect(rain[1]).toBe(-9);
    expect(rain[2]).toBeCloseTo(0, 9);
    expect(precipitationVelocity("rain", 9, 0, wind, 3)[0]).toBe(0);
    expect(precipitationVelocity("snow", 1.4, 2, wind, 3)[0]).toBeCloseTo(4, 9);
    const gusty = resolveWind({ directionDeg: 0, strength: 0.5, gust: 1 }, undefined, null);
    let sum = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const speed = precipitationVelocity("rain", 9, 1, gusty, i * 0.05)[2];
      expect(speed).toBeGreaterThanOrEqual(0);
      sum += speed;
    }
    expect(sum / 20_000).toBeCloseTo(4, 1);
    expect(gustFactor(0, 12.3)).toBe(1);
  });

  test("streaks lean into a moving camera, not into a cut or a pause", () => {
    const smoothed: Vec3Tuple = [0, 0, 0];
    let at: Vec3Tuple = [0, 0, 0];
    for (let i = 0; i < 120; i += 1) {
      const next: Vec3Tuple = [at[0] + 10 / 60, 0, 0];
      leanVelocity(at, next, 1 / 60, smoothed);
      at = next;
    }
    expect(smoothed[0]).toBeCloseTo(10, 2);
    expect(leanVelocity(at, [at[0] + CAMERA_CUT_DISTANCE + 1, 0, 0], 1 / 60, [...smoothed])).toEqual([0, 0, 0]);
    expect(leanVelocity(at, at, 0, [...smoothed])).toEqual([0, 0, 0]);
    expect(leanVelocity(null, at, 1 / 60, [...smoothed])).toEqual([0, 0, 0]);
  });

  test("counts scale with strength, amount and density and are capped", () => {
    expect(particleCount(1000, 1, 1, 1)).toBe(1000);
    expect(particleCount(1000, 0.5, 1, 0.8)).toBe(400);
    expect(particleCount(1000, 0, 3, 1)).toBe(0);
    expect(particleCount(1000, 1, 9, 1)).toBe(3000);
    expect(particleCount(1000, -1, 1, 1)).toBe(0);
    expect(particleCount(1000, NaN, 1, 1)).toBe(0);
  });
});
