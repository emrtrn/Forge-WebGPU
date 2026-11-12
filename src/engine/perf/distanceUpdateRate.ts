// Ported from Forge WebGL engine/perf/distanceUpdateRate.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Small, deterministic scheduler for work that can run less frequently when an
 * object is far from the player's current area of interest.  It deliberately
 * knows nothing about entities, Three.js or a camera; hosts supply a squared
 * distance and use the returned accumulated delta for their own update.
 *
 * `farUpdateHz` is optional.  Omitting it (or supplying an invalid value) keeps
 * the original per-frame behaviour, which is important for template projects
 * that have not opted into the Phase 7 quality extensions.
 */
export interface DistanceUpdateRateSettings {
  /** Maximum update frequency for work at or beyond `farDistance`. */
  farUpdateHz?: number;
  /** World-space distance at which the far cadence begins. */
  farDistance?: number;
}

/** Sensible generic default; forks may replace it for their gameplay scale. */
export const DEFAULT_FAR_UPDATE_DISTANCE = 30;

export function normalizedFarUpdateInterval(settings: DistanceUpdateRateSettings): number | null {
  const hz = settings.farUpdateHz;
  return typeof hz === "number" && Number.isFinite(hz) && hz > 0 ? 1 / hz : null;
}

export function isFarFromFocus(
  distanceSquared: number | null | undefined,
  settings: DistanceUpdateRateSettings,
): boolean {
  if (typeof distanceSquared !== "number" || !Number.isFinite(distanceSquared)) return false;
  const distance =
    typeof settings.farDistance === "number" && Number.isFinite(settings.farDistance) && settings.farDistance > 0
      ? settings.farDistance
      : DEFAULT_FAR_UPDATE_DISTANCE;
  return distanceSquared >= distance * distance;
}

/**
 * Returns the elapsed time that should be simulated now, or zero when this far
 * object should wait for a later frame. Near objects retain their normal delta
 * and clear any previously accumulated time immediately on return to range.
 */
export function consumeDistanceUpdateDelta(input: {
  deltaSeconds: number;
  accumulatedSeconds: number;
  isFar: boolean;
  settings: DistanceUpdateRateSettings;
}): number {
  const delta = Number.isFinite(input.deltaSeconds) && input.deltaSeconds > 0 ? input.deltaSeconds : 0;
  const accumulated = Math.max(0, input.accumulatedSeconds) + delta;
  const interval = normalizedFarUpdateInterval(input.settings);
  if (!input.isFar || interval === null) return accumulated;
  return accumulated + 1e-9 >= interval ? accumulated : 0;
}
