// Event-based time of day (plan phase 3 step 7, architecture §4.9; phase 3
// decision 8). Not a Forge port: Forge WebGL's `setHour` jumped at once.
//
// The hour of a level stands still. A gameplay event moves it with a timed
// transition: the hour runs forward to the target over `seconds` of
// simulation time, eased in and out (the sun starts and stops gently), then
// stands still again. Pure and three-free: the World Environment controller
// holds one transition and steps it with the world's tick.
//
// - Time only runs forward: a target earlier than the current hour crosses
//   midnight (20 -> 6 is ten hours). A target equal to the current hour is
//   no transition (not a whole day).
// - No time (`seconds` <= 0 or not finite) or no distance: no transition;
//   the caller sets the hour at once.
// - A new transition (or a direct `setHour`) replaces the running one; it
//   starts from the hour the old one reached, so the sun never jumps.

import { HOURS_PER_DAY, wrapHour } from "./worldClock.ts";

export interface TimeTransitionRequest {
  /** The target hour; any finite value, wrapped into [0, 24). */
  readonly hour: number;
  /** Simulation seconds the transition takes. */
  readonly seconds: number;
}

export interface TimeTransition {
  /** The hour the transition started from, in [0, 24). */
  readonly fromHour: number;
  /** Hours run forward to the target, in (0, 24). */
  readonly hours: number;
  readonly seconds: number;
  /** Simulation seconds run so far, in [0, seconds]. */
  readonly elapsed: number;
}

/** The hours from `fromHour` forward to `toHour`, in [0, 24). */
export function forwardHours(fromHour: number, toHour: number): number {
  const hours = wrapHour(wrapHour(toHour) - wrapHour(fromHour));
  // Rounding can leave a hair under a full day for equal hours.
  return HOURS_PER_DAY - hours < 1e-9 ? 0 : hours;
}

/**
 * Starts a transition from `fromHour`; null when there is none to run (no
 * time, no distance, or a non-finite input): the caller then sets the target
 * hour at once (or ignores a non-finite one).
 */
export function startTimeTransition(fromHour: number, request: TimeTransitionRequest): TimeTransition | null {
  if (!Number.isFinite(fromHour) || !Number.isFinite(request.hour)) return null;
  if (!(request.seconds > 0) || !Number.isFinite(request.seconds)) return null;
  const hours = forwardHours(fromHour, request.hour);
  if (hours === 0) return null;
  return { fromHour: wrapHour(fromHour), hours, seconds: request.seconds, elapsed: 0 };
}

/** Eased progress in [0, 1] (smoothstep: zero speed at both ends). */
export function transitionProgress(transition: TimeTransition): number {
  const t = Math.min(1, Math.max(0, transition.elapsed / transition.seconds));
  return t * t * (3 - 2 * t);
}

/** The hour the transition has reached, in [0, 24); the exact target once done. */
export function transitionHour(transition: TimeTransition): number {
  if (transitionDone(transition)) return wrapHour(transition.fromHour + transition.hours);
  return wrapHour(transition.fromHour + transition.hours * transitionProgress(transition));
}

/** Steps that sum to the duration land on it despite rounding (ten 0.1 s steps are one second). */
const END_EPSILON_SECONDS = 1e-9;

/** Runs the transition by simulation seconds; negative or non-finite steps are ignored. */
export function advanceTimeTransition(transition: TimeTransition, seconds: number): TimeTransition {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return transition;
  const elapsed = transition.elapsed + seconds;
  return { ...transition, elapsed: elapsed >= transition.seconds - END_EPSILON_SECONDS ? transition.seconds : elapsed };
}

export function transitionDone(transition: TimeTransition): boolean {
  return transition.elapsed >= transition.seconds;
}
