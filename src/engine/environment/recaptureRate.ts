// How often the Sky Light is captured while the World Environment's sun moves
// (plan phase 3 step 7; user decision 2026-11-13, from the measurement).
// Not a Forge port: Forge's angle policy (recapturePolicy.ts, unchanged) is
// the base, with two additions for the event-based time of day.
//
// - Rate limit: one capture a PMREM costs ~3.3-3.5 ms of GPU and ~1.3-2 ms of
//   CPU (256, NVIDIA Ampere, `npm run measure:sky-capture`). Near the horizon
//   the angle policy captures every frame during a transition (about 21
//   frames in a row for a 5 s day-to-night at 60 Hz). While the sun moves, a
//   capture waits at least MIN_RECAPTURE_INTERVAL_SECONDS after the previous
//   one; the brightness between captures is still bridged per frame
//   (skyLightCompensation), only the colour lags (at most ~6 degrees of sun
//   for a 5 s transition).
// - Settle: once the sun stands still away from the last capture (the end
//   of a transition, the release of a scrubbed clock), one capture takes the
//   exact resting light. Forge's continuous clock left up to the step angle
//   (3 degrees at high sun) behind; a stopped hour would keep it for good.
//
// A weather or season change (`captureKey`) still captures at once, and a
// scrubbed clock never captures (Forge).

import type { Vec3 } from "../legacy/layout.ts";
import { angleBetweenDeg, shouldRecapture, type CaptureRecord, type CaptureRequest } from "./recapturePolicy.ts";

/** Least simulation time between two captures while the sun moves. */
export const MIN_RECAPTURE_INTERVAL_SECONDS = 0.1;
/** A sun standing still this far from the last capture is captured once more. */
export const SETTLE_RECAPTURE_ANGLE_DEG = 0.01;
/** The sun moved since the previous frame (anything above rounding). */
const MOVED_ANGLE_DEG = 1e-6;

export interface RecaptureInput {
  /** The last capture and when it was taken (simulation seconds). */
  readonly last: CaptureRecord | null;
  readonly lastAt: number;
  /** Simulation seconds now (the same clock as `lastAt`). */
  readonly now: number;
  /** The sun of the previous frame; null on the first. */
  readonly previousSun: Vec3 | null;
  readonly request: CaptureRequest;
}

export function decideRecapture(input: RecaptureInput): boolean {
  const { last, request } = input;
  if (request.scrubbing) return false;
  if (!last || request.captureKey !== last.captureKey) return true;
  const moving = input.previousSun === null || angleBetweenDeg(input.previousSun, request.sunDirection) > MOVED_ANGLE_DEG;
  if (!moving) return angleBetweenDeg(last.sunDirection, request.sunDirection) >= SETTLE_RECAPTURE_ANGLE_DEG;
  return input.now - input.lastAt >= MIN_RECAPTURE_INTERVAL_SECONDS - 1e-9 && shouldRecapture(last, request);
}
