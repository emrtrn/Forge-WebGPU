// WES cover uses scaled simulation seconds, never the difference in hour.
// Targets are independent of season/weather (user decision 2026-11-15).
export interface SurfaceAmount { snowCoverage: number; wetness: number }
export interface SurfaceRates {
  snowAccumulationRate: number;
  snowMeltRate: number;
  wettingRate: number;
  dryingRate: number;
}
/** Fractions of 0..1 cover per simulation second. Zero holds the amount. */
export const SURFACE_RATES: Readonly<SurfaceRates> = {
  snowAccumulationRate: .01, snowMeltRate: .005, wettingRate: .1, dryingRate: .01,
};
export function advanceSurface(current: SurfaceAmount, target: SurfaceAmount, rates: SurfaceRates, seconds: number): SurfaceAmount {
  if (!Number.isFinite(seconds) || seconds <= 0) return current;
  const approach = (value: number, goal: number, rise: number, fall: number): number => {
    const delta = Math.max(0, goal > value ? rise : fall) * seconds;
    return goal > value ? Math.min(goal, value + delta) : Math.max(goal, value - delta);
  };
  return {
    snowCoverage: approach(current.snowCoverage, target.snowCoverage, rates.snowAccumulationRate, rates.snowMeltRate),
    wetness: approach(current.wetness, target.wetness, rates.wettingRate, rates.dryingRate),
  };
}
