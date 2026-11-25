import { describe, expect, test } from "vitest";
import {
  advanceSurfaceCondition, SURFACE_CONDITION_RATES, type Precipitation, type SurfaceCondition,
} from "./surfaceCondition.ts";

const rates = SURFACE_CONDITION_RATES;
const empty = Object.freeze({ wetness: 0, puddleFill: 0, snowCoverage: 0, snowDepth: 0 });
const clear = { rain: 0, snow: 0 };
const rain = { rain: 1, snow: 0 };
const snow = { rain: 0, snow: 1 };

function expectSurface(actual: SurfaceCondition, wetness: number, puddleFill: number, snowCoverage: number, snowDepth: number) {
  expect(actual.wetness).toBeCloseTo(wetness, 9);
  expect(actual.puddleFill).toBeCloseTo(puddleFill, 9);
  expect(actual.snowCoverage).toBeCloseTo(snowCoverage, 9);
  expect(actual.snowDepth).toBeCloseTo(snowDepth, 9);
}

describe("surface condition", () => {
  test("rain fills puddles only after wetness reaches one", () => {
    expectSurface(advanceSurfaceCondition(empty, rain, rates, 5), .5, 0, 0, 0);
    expect(advanceSurfaceCondition(empty, rain, rates, 10)).toEqual({ ...empty, wetness: 1 });
    expectSurface(advanceSurfaceCondition(empty, rain, rates, 30), 1, .1, 0, 0);
    expect(advanceSurfaceCondition(empty, rain, rates, 300)).toEqual({ ...empty, wetness: 1, puddleFill: 1 });
  });

  test("wetness dries in 100 seconds, then full puddles take another 400 seconds", () => {
    const soaked = { ...empty, wetness: 1, puddleFill: 1 };
    expectSurface(advanceSurfaceCondition(soaked, clear, rates, 50), .5, 1, 0, 0);
    expect(advanceSurfaceCondition(soaked, clear, rates, 100)).toEqual({ ...empty, puddleFill: 1 });
    expectSurface(advanceSurfaceCondition(soaked, clear, rates, 200), 0, .75, 0, 0);
    expectSurface(advanceSurfaceCondition(soaked, clear, rates, 499), 0, .0025, 0, 0);
    expect(advanceSurfaceCondition(soaked, clear, rates, 500)).toEqual(empty);
  });

  test("snow depth grows quadratically up to full coverage, then linearly up to its cap", () => {
    expectSurface(advanceSurfaceCondition(empty, snow, rates, 50), 0, 0, .5, .0125);
    expectSurface(advanceSurfaceCondition(empty, snow, rates, 100), 0, 0, 1, .05);
    expectSurface(advanceSurfaceCondition(empty, snow, rates, 200), 0, 0, 1, .15);
    expect(advanceSurfaceCondition(empty, snow, rates, 600)).toEqual({ ...empty, snowCoverage: 1, snowDepth: .4 });

    const shallow = { ...rates, snowMaxDepth: .0125 };
    const cappedDuringRamp = advanceSurfaceCondition(empty, snow, shallow, 75);
    expect(cappedDuringRamp.snowDepth).toBe(.0125);
    expectSurface(cappedDuringRamp, 0, 0, .75, .0125);
    const damp = { ...empty, wetness: .4, puddleFill: .3 };
    expectSurface(advanceSurfaceCondition(damp, snow, rates, 50), .4, .3, .5, .0125);
  });

  test("clear weather melts depth before coverage and then dries the meltwater in order", () => {
    const snowpack = { ...empty, snowDepth: .1, snowCoverage: .5 };
    expectSurface(advanceSurfaceCondition(snowpack, clear, rates, 10), .5, 0, .5, .095);
    expectSurface(advanceSurfaceCondition(snowpack, clear, rates, 100), 1, .2, .5, .05);
    const depthGone = advanceSurfaceCondition(snowpack, clear, rates, 200);
    expect(depthGone.snowDepth).toBe(0);
    expectSurface(depthGone, 1, .45, .5, 0);
    expectSurface(advanceSurfaceCondition(snowpack, clear, rates, 250), 1, .575, .25, 0);
    expect(advanceSurfaceCondition(snowpack, clear, rates, 300).snowCoverage).toBe(0);
    expectSurface(advanceSurfaceCondition(snowpack, clear, rates, 350), .5, .7, 0, 0);
    expectSurface(advanceSurfaceCondition(snowpack, clear, rates, 400), 0, .7, 0, 0);
    expectSurface(advanceSurfaceCondition(snowpack, clear, rates, 500), 0, .45, 0, 0);
    expect(advanceSurfaceCondition(snowpack, clear, rates, 680)).toEqual(empty);
  });

  test("full rain triples clear-weather melt and equal rain and snow hold the snow", () => {
    const snowpack = { ...empty, snowDepth: .2, snowCoverage: .7 };
    expectSurface(advanceSurfaceCondition(snowpack, clear, rates, 100), 1, .2, .7, .15);
    expectSurface(advanceSurfaceCondition(snowpack, rain, rates, 100), 1, .45, .7, .05);
    expectSurface(advanceSurfaceCondition(snowpack, { rain: 1, snow: 1 }, rates, 5), .5, 0, .7, .2);
  });

  test("rain still wets the surface when mixed precipitation adds snow", () => {
    expectSurface(advanceSurfaceCondition(empty, { rain: .25, snow: .75 }, rates, 50), 1, .0125, .25, .003125);
  });

  test("zero water rates hold their directions and prevent the following stage when applicable", () => {
    const damp = { ...empty, wetness: .5, puddleFill: .5 };
    const wet = { ...damp, wetness: 1 };
    const puddles = { ...damp, wetness: 0 };
    expect(advanceSurfaceCondition(damp, rain, { ...rates, wettingRate: 0 }, 600)).toBe(damp);
    expect(advanceSurfaceCondition(wet, rain, { ...rates, puddleFillRate: 0 }, 600)).toBe(wet);
    expect(advanceSurfaceCondition(damp, clear, { ...rates, dryingRate: 0 }, 600)).toBe(damp);
    expect(advanceSurfaceCondition(puddles, clear, { ...rates, puddleDrainRate: 0 }, 600)).toBe(puddles);
  });

  test("zero snow rates hold their directions, and frozen depth blocks coverage melt", () => {
    const snowpack = { ...empty, snowDepth: .05, snowCoverage: .5 };
    expect(advanceSurfaceCondition(empty, snow, { ...rates, snowAccumulationRate: 0 }, 600)).toBe(empty);
    expectSurface(advanceSurfaceCondition(snowpack, snow, { ...rates, snowAccumulationRate: 0 }, 100), 0, 0, .5, .1);
    expectSurface(advanceSurfaceCondition(empty, snow, { ...rates, snowDepthRate: 0 }, 600), 0, 0, 1, 0);
    expect(advanceSurfaceCondition(snowpack, clear, { ...rates, snowDepthMeltRate: 0 }, 600)).toBe(snowpack);
    expectSurface(advanceSurfaceCondition(snowpack, clear, { ...rates, snowMeltRate: 0 }, 210), 0, .175, .5, 0);
  });

  test.each([30, 60, 144])("%i Hz agrees with a single step for each phase of the weather script", hz => {
    const phases: ReadonlyArray<readonly [Precipitation, number]> = [
      [clear, 80], [snow, 400], [{ rain: .6, snow: .4 }, 120], [rain, 100], [clear, 1500],
    ];
    let single: SurfaceCondition = { ...empty, wetness: .6, puddleFill: .7 };
    let framed = single;
    for (const [precipitation, seconds] of phases) {
      single = advanceSurfaceCondition(single, precipitation, rates, seconds);
      for (let frame = 0; frame < seconds * hz; frame++) {
        framed = advanceSurfaceCondition(framed, precipitation, rates, 1 / hz);
      }
      expectSurface(framed, single.wetness, single.puddleFill, single.snowCoverage, single.snowDepth);
    }
    expect(single).toEqual(empty);
    expect(framed).toEqual(empty);

    const lightSnow = { rain: 0, snow: .5 };
    single = advanceSurfaceCondition(empty, lightSnow, rates, 600);
    framed = empty;
    for (let frame = 0; frame < 600 * hz; frame++) {
      framed = advanceSurfaceCondition(framed, lightSnow, rates, 1 / hz);
    }
    expectSurface(single, 0, 0, 1, .25);
    expectSurface(framed, 0, 0, 1, .25);
  });

  test("invalid inputs are sanitized and frozen state is reused only when unchanged", () => {
    const damp = Object.freeze({ ...empty, wetness: .25 });
    for (const seconds of [NaN, -1, 0, Infinity]) {
      expect(advanceSurfaceCondition(damp, rain, rates, seconds)).toBe(damp);
    }
    expect(advanceSurfaceCondition(empty, { rain: NaN, snow: Infinity }, rates, 60)).toBe(empty);
    expectSurface(advanceSurfaceCondition(damp, { rain: NaN, snow: -1 }, rates, 10), .15, 0, 0, 0);
    expect(advanceSurfaceCondition(damp, rain, { ...rates, wettingRate: -1 }, 60)).toBe(damp);
    expect(advanceSurfaceCondition(damp, clear, { ...rates, dryingRate: Infinity }, 60)).toBe(damp);
    const changed = advanceSurfaceCondition(damp, { rain: 2, snow: NaN }, rates, 2);
    expect(changed).not.toBe(damp);
    expectSurface(changed, .45, 0, 0, 0);
    expect(damp).toEqual({ ...empty, wetness: .25 });
  });

  test("lowering the depth cap holds excess depth until it melts", () => {
    const snowpack = { ...empty, snowDepth: .3, snowCoverage: .5 };
    const lower = { ...rates, snowMaxDepth: .1 };
    expectSurface(advanceSurfaceCondition(snowpack, snow, lower, 100), 0, 0, 1, .3);
    const partlyMelted = advanceSurfaceCondition(snowpack, clear, lower, 100);
    expectSurface(partlyMelted, 1, .2, .5, .25);
    const belowCap = advanceSurfaceCondition(partlyMelted, clear, lower, 350);
    expectSurface(belowCap, 1, 1, .5, .075);
    expect(advanceSurfaceCondition(belowCap, snow, lower, 100).snowDepth).toBe(.1);
  });
});
