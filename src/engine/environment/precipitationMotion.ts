// How rain and snow move (plan phase W1): the pure half of the drawing.
//
// A volume of precipitation is a box around the camera whose particles sit at
// fixed seeds in 0..1 and drift together: a particle is at
// `camera + (fract(seed + phase) - 0.5) * size`, with
// `phase = fract((offset - camera) / size)`. Moving the camera moves the phase
// the other way, so the particles stay where they are in the world and only
// wrap around the box; `offset` is the distance fallen, in metres. Both are
// doubles here and the shader sees only the 0..1 phase, so neither a far camera
// nor a long rain loses precision.
//
// Velocities are metres per simulation second: the fall plus the wind, whose
// gusts swell and calm with simulation time. Nothing moves in a pause.

import type { ResolvedWind } from "./wind.ts";

export type Vec3Tuple = [number, number, number];

/** The World Environment's authored `precipitation` group (its schema is the feature's). */
export interface PrecipitationSettings {
  readonly windInfluence: number;
  readonly brightness: number;
  readonly rain: { readonly amount: number; readonly opacity: number; readonly speed: number; readonly length: number };
  readonly snow: { readonly amount: number; readonly opacity: number; readonly speed: number; readonly size: number; readonly flutter: number };
}

/** Wind speed at strength 1 (m/s): drops fall through most of it, flakes drift with it but are drawn slow. */
export const PRECIPITATION_WIND_SPEED = { rain: 8, snow: 4 } as const;

/** 1 on average; gusts swell it by up to `gust` (simulation seconds, two unrelated periods). */
export function gustFactor(gust: number, seconds: number): number {
  return 1 + gust * 0.5 * (Math.sin(seconds * 0.9) + Math.sin(seconds * 2.3 + 1.7));
}

/** Metres per second of one kind of precipitation now. */
export function precipitationVelocity(kind: "rain" | "snow", fallSpeed: number, windInfluence: number, wind: ResolvedWind, seconds: number): Vec3Tuple {
  const speed = Math.max(0, wind.strength * PRECIPITATION_WIND_SPEED[kind] * windInfluence * gustFactor(wind.gust, seconds));
  return [wind.direction[0] * speed, -fallSpeed, wind.direction[1] * speed];
}

const wrap = (value: number, size: number): number => value - Math.floor(value / size) * size;

/** Adds `seconds` of `velocity` to a volume's offset, kept inside the volume. */
export function advanceOffset(offset: Vec3Tuple, velocity: Readonly<Vec3Tuple>, size: Readonly<Vec3Tuple>, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  for (let axis = 0; axis < 3; axis += 1) offset[axis] = wrap(offset[axis]! + velocity[axis]! * seconds, size[axis]!);
}

/** The 0..1 phase the shader adds to a particle's seed. */
export function volumePhase(offset: Readonly<Vec3Tuple>, camera: Readonly<Vec3Tuple>, size: Readonly<Vec3Tuple>, out: Vec3Tuple): Vec3Tuple {
  for (let axis = 0; axis < 3; axis += 1) {
    const phase = wrap((offset[axis]! - camera[axis]!) / size[axis]!, 1);
    out[axis] = phase >= 1 ? 0 : phase;
  }
  return out;
}

/** A jump farther than this in one frame is a cut, not a movement (metres). */
export const CAMERA_CUT_DISTANCE = 4;
/** The fastest camera a streak leans into (m/s). */
export const CAMERA_LEAN_SPEED = 40;

/** The camera's velocity for the streaks' lean: smoothed, 0 over a cut or a pause. */
export function leanVelocity(previous: Readonly<Vec3Tuple> | null, camera: Readonly<Vec3Tuple>, seconds: number, smoothed: Vec3Tuple): Vec3Tuple {
  const delta: Vec3Tuple = previous ? [camera[0] - previous[0], camera[1] - previous[1], camera[2] - previous[2]] : [0, 0, 0];
  const distance = Math.hypot(...delta);
  const moving = previous !== null && Number.isFinite(seconds) && seconds > 0 && distance <= CAMERA_CUT_DISTANCE;
  if (!moving) { smoothed.fill(0); return smoothed; }
  const scale = Math.min(1, CAMERA_LEAN_SPEED / Math.max(distance / seconds, 1e-6)) / seconds;
  const blend = 1 - Math.exp(-seconds * 12);
  for (let axis = 0; axis < 3; axis += 1) smoothed[axis] = smoothed[axis]! + (delta[axis]! * scale - smoothed[axis]!) * blend;
  return smoothed;
}

/** Particles drawn of a volume that holds `full` at strength, amount and density 1; never above `full * AMOUNT_MAX`. */
export const AMOUNT_MAX = 3;
export function particleCount(full: number, strength: number, amount: number, density: number): number {
  const share = Math.max(0, strength) * Math.max(0, amount) * Math.max(0, density);
  return Number.isFinite(share) ? Math.round(full * Math.min(AMOUNT_MAX, share)) : 0;
}
