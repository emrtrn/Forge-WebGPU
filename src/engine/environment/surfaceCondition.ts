// Pure surface state for plan phase W (weather), not yet connected.
// Advance by simulation seconds only, never by hour differences.
import { SURFACE_RATES } from "./surfaceAccumulation.ts";

/** Live surface state of a level. snowDepth in metres, the rest 0..1. */
export interface SurfaceCondition {
  wetness: number;
  puddleFill: number;
  snowCoverage: number;
  snowDepth: number;
}

/** Live precipitation. Both strengths are independent and in 0..1. */
export interface Precipitation { rain: number; snow: number }

/** Fractions or metres per simulation second. Zero stops that direction. */
export interface SurfaceConditionRates {
  wettingRate: number;
  dryingRate: number;
  puddleFillRate: number;
  puddleDrainRate: number;
  snowAccumulationRate: number;
  snowMeltRate: number;
  snowDepthRate: number;
  snowDepthMeltRate: number;
  /** Deepest snow, metres. */
  snowMaxDepth: number;
}

export const SURFACE_CONDITION_RATES: Readonly<SurfaceConditionRates> = {
  ...SURFACE_RATES,
  puddleFillRate: .005, puddleDrainRate: .0025,
  snowDepthRate: .001, snowDepthMeltRate: .0005, snowMaxDepth: .4,
};
/** Melting in the absence of snowfall runs at 1 + RAIN_MELT * rain. */
export const RAIN_MELT = 2;
/** Liquid water melting snow supplies, as a rain strength. */
export const MELT_WATER = .5;

const nonnegative = (value: number): number => Number.isFinite(value) ? Math.max(0, value) : 0;
const clamp01 = (value: number): number => Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

const timeToBound = (distance: number, rate: number): number => distance > 0 && rate > 0 ? distance / rate : Infinity;

/** The event happens in this segment; coincident events count as one past an earlier segment's roundoff. */
const reaches = (step: number, boundAt: number): boolean => boundAt !== Infinity && boundAt - step <= 2 * Number.EPSILON * boundAt;

/** When the depth closes `gap` under the linear coverage ramp: depthRate * (c t + c' t² / 2) = gap. */
function timeToDepthCap(gap: number, depthRate: number, coverage: number, coverageRate: number): number {
  if (depthRate === 0) return Infinity;
  if (coverageRate === 0) return timeToBound(gap, depthRate * coverage);
  const endCoverage = Math.sqrt(coverage ** 2 + 2 * coverageRate * gap / depthRate);
  // Coverage saturates first: the next segment solves with it constant.
  return endCoverage > 1 ? Infinity : (endCoverage - coverage) / coverageRate;
}

export function advanceSurfaceCondition(
  current: Readonly<SurfaceCondition>, precipitation: Readonly<Precipitation>,
  rates: Readonly<SurfaceConditionRates>, seconds: number,
): SurfaceCondition {
  if (!Number.isFinite(seconds) || seconds <= 0) return current;

  const rain = clamp01(nonnegative(precipitation.rain));
  const snow = clamp01(nonnegative(precipitation.snow));
  const netSnow = snow - rain;
  const accumulating = netSnow > 0;
  const meltStrength = snow === 0 ? 1 + RAIN_MELT * rain : Math.max(0, -netSnow);
  const coverageMelt = nonnegative(rates.snowMeltRate) * meltStrength;
  const depthMelt = nonnegative(rates.snowDepthMeltRate) * meltStrength;
  const coverageGrowth = nonnegative(rates.snowAccumulationRate) * Math.max(0, netSnow);
  const depthGrowth = nonnegative(rates.snowDepthRate) * Math.max(0, netSnow);
  const maxDepth = nonnegative(rates.snowMaxDepth);
  const wetting = nonnegative(rates.wettingRate);
  const drying = nonnegative(rates.dryingRate);
  const filling = nonnegative(rates.puddleFillRate);
  const draining = nonnegative(rates.puddleDrainRate);
  let wetness = clamp01(current.wetness);
  let puddleFill = clamp01(current.puddleFill);
  let snowCoverage = clamp01(current.snowCoverage);
  let snowDepth = nonnegative(current.snowDepth);
  let remaining = seconds;

  // At most two snow bounds and four water bounds can be reached in one call.
  for (let segment = 0; segment < 7 && remaining > 0; segment++) {
    const depthFall = snowDepth > 0 ? depthMelt : 0;
    const coverageFall = snowDepth === 0 && snowCoverage > 0 ? coverageMelt : 0;
    const coverageRise = snowCoverage < 1 ? coverageGrowth : 0;
    const depthRise = snowDepth < maxDepth ? depthGrowth : 0;
    const liquid = Math.max(rain, depthFall > 0 || coverageFall > 0 ? MELT_WATER : 0);
    const wet = liquid > 0;
    const dry = !wet && !accumulating;
    const waterBound = wet ? 1 : 0;
    const wetnessRate = wet && wetness < 1 ? wetting * liquid : dry && wetness > 0 ? -drying : 0;
    const puddleRate = wet && wetness === 1 && puddleFill < 1 ? filling * liquid
      : dry && wetness === 0 && puddleFill > 0 ? -draining : 0;

    const coverageBound = accumulating ? 1 : 0;
    const coverageAt = timeToBound(Math.abs(coverageBound - snowCoverage), coverageRise + coverageFall);
    const depthAt = depthFall > 0 ? timeToBound(snowDepth, depthFall)
      : timeToDepthCap(maxDepth - snowDepth, depthRise, snowCoverage, coverageRise);
    const wetnessAt = timeToBound(Math.abs(waterBound - wetness), Math.abs(wetnessRate));
    const puddleAt = timeToBound(Math.abs(waterBound - puddleFill), Math.abs(puddleRate));
    const step = Math.min(remaining, coverageAt, depthAt, wetnessAt, puddleAt);

    const nextCoverage = reaches(step, coverageAt) ? coverageBound
      : clamp01(snowCoverage + (coverageRise - coverageFall) * step);
    if (reaches(step, depthAt)) {
      snowDepth = accumulating ? maxDepth : 0;
    } else if (depthRise > 0) {
      const meanCoverage = (snowCoverage + nextCoverage) / 2;
      snowDepth = Math.min(maxDepth, snowDepth + (depthRise * meanCoverage) * step);
    } else if (depthFall > 0) {
      snowDepth = Math.max(0, snowDepth - depthFall * step);
    }
    snowCoverage = nextCoverage;
    wetness = reaches(step, wetnessAt) ? waterBound : clamp01(wetness + wetnessRate * step);
    puddleFill = reaches(step, puddleAt) ? waterBound : clamp01(puddleFill + puddleRate * step);
    remaining -= step;
  }

  return wetness === current.wetness && puddleFill === current.puddleFill
    && snowCoverage === current.snowCoverage && snowDepth === current.snowDepth
    ? current : { wetness, puddleFill, snowCoverage, snowDepth };
}
