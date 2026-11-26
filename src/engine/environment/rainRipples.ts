// Rain rings on standing water (plan phase W6, user scope 2026-11-26; new to
// Forge WebGPU). Pure: the shader (render/materials/waterRipples.ts) repeats
// these formulas, and this CPU twin is what tests read.
//
// - Rings live on a cell grid (`rippleSize` metres) in a few layers of
//   different cell sizes and clocks. A cell holds one drop: its centre and
//   its time offset by hash; whether it is falling at all by its hash against
//   the share of active cells (`rippleDensity` × the live rain). One cell is
//   read per layer: a ring never leaves its cell, so there is no seam.
// - A ring grows to `RIPPLE_RADIUS` of its cell over `RIPPLE_PERIOD` seconds
//   and fades as it grows; its slope is analytic (the derivative of the
//   ring's height across its width).
// - The live rain drives it: no rain, no rings; the water stays. The clock is
//   simulation time (pause stops it). It fades with distance and where a
//   pixel grows wider than half the ring (no shimmer).
// - Where: a material's puddle (surfaceCover `factors.w`), a wet patch only
//   faintly (`RIPPLE_PATCH_SHARE`), and `forge.puddle`'s water; the
//   precipitation cover and the flat-ground window already shape the mask.

import { hash12, smoothstep } from "./surfaceResponse.ts";

/** World Environment `surface` settings of the rings and the puddles' wind ripples. */
export interface WaterRippleSettings {
  /** Slope of the rings, 0..2 (0 none). */
  readonly rippleStrength: number;
  /** Cell size (m) of the rings' grid: a ring reaches `RIPPLE_RADIUS` of it. */
  readonly rippleSize: number;
  /** Share of cells that hold a falling drop in full rain, 0..1. */
  readonly rippleDensity: number;
  /** Slope of the wind's crests on a material's puddle, 0..2 (× the wind). */
  readonly windRippleStrength: number;
}

export const WATER_RIPPLE_DEFAULTS: WaterRippleSettings = { rippleStrength: 2, rippleSize: 1, rippleDensity: 1, windRippleStrength: 2 };
export const WATER_RIPPLE_RANGES = {
  rippleStrength: [0, 2], rippleSize: [0.05, 1], rippleDensity: [0, 1], windRippleStrength: [0, 2],
} as const satisfies Record<keyof WaterRippleSettings, readonly [number, number]>;

/** Seconds from a drop's fall to its ring's end. */
export const RIPPLE_PERIOD = 0.8;
/** A ring's largest radius and its half width, in cells. */
export const RIPPLE_RADIUS = 0.25;
export const RIPPLE_WIDTH = 0.1;
/** How far a drop's centre strays from its cell's middle, in cells (± half of it): radius + width stays inside. */
export const RIPPLE_JITTER = 0.25;
/** Slope at a ring's crest at birth, at strength 1. */
export const RIPPLE_SLOPE = 0.35;
/** Layers: cell size multiplier, clock offset (periods), hash offset. */
export const RIPPLE_LAYERS = [[1, 0, 0], [0.73, 0.37, 17.3], [1.37, 0.71, 41.9]] as const;
/** Full rings up to this distance (m) and none past the second, at `RIPPLE_FADE_SIZE`; both scale with `rippleSize`. */
export const RIPPLE_FADE = [15, 40] as const;
/** The ring cell size (m) `RIPPLE_FADE` is tuned for; independent of the default size. */
export const RIPPLE_FADE_SIZE = 0.25;
/** A wet patch (not a puddle) shows this share of the rings. */
export const RIPPLE_PATCH_SHARE = 0.15;
/** The clock wraps here (s): float precision on the GPU; a wrap is one frame's jump in a pattern nobody follows. */
export const RIPPLE_CLOCK_WRAP = 4096 * RIPPLE_PERIOD;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const fract = (value: number): number => value - Math.floor(value);

/** A setting clamped to its range; absent or not finite: the default. */
export function rippleSetting<K extends keyof WaterRippleSettings>(settings: Partial<WaterRippleSettings> | null | undefined, key: K): number {
  const value = settings?.[key];
  const [low, high] = WATER_RIPPLE_RANGES[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : WATER_RIPPLE_DEFAULTS[key];
}

/** Share of cells holding a falling drop: the density × the live rain (0 without rain). */
export function rippleActiveShare(rain: number, settings?: Partial<WaterRippleSettings> | null): number {
  return clamp01(Number.isFinite(rain) ? rain : 0) * rippleSetting(settings, "rippleDensity");
}

/** The rings' strength now: 0 without rain or with no active cell, else the setting. */
export function rippleStrengthNow(rain: number, settings?: Partial<WaterRippleSettings> | null): number {
  return rippleActiveShare(rain, settings) > 0 ? rippleSetting(settings, "rippleStrength") : 0;
}

/** The clock the rings read: simulation seconds, wrapped. */
export function rippleClock(seconds: number): number {
  return Number.isFinite(seconds) ? ((seconds % RIPPLE_CLOCK_WRAP) + RIPPLE_CLOCK_WRAP) % RIPPLE_CLOCK_WRAP : 0;
}

/** How much of the rings shows at `distance` (m) from the camera. */
export function rippleDistanceFade(distance: number, rippleSize = WATER_RIPPLE_DEFAULTS.rippleSize): number {
  const scale = rippleSize / RIPPLE_FADE_SIZE;
  return 1 - smoothstep(RIPPLE_FADE[0] * scale, RIPPLE_FADE[1] * scale, distance);
}

/** How much of the rings shows where a pixel covers `footprint` metres: gone once it is as wide as a ring. */
export function rippleFootprintFade(footprint: number, rippleSize = WATER_RIPPLE_DEFAULTS.rippleSize): number {
  const ring = rippleSize * RIPPLE_WIDTH;
  return 1 - smoothstep(0.5 * ring, ring, footprint);
}

/** A ring's slope across its width at `x` (-1..1 over the ring), 1 at the crest's front: d/dx of sin(πx)(1 - x²)², / π. */
export function ringProfileSlope(x: number): number {
  if (Math.abs(x) >= 1) return 0;
  const k = 1 - x * x;
  return k * (Math.PI * Math.cos(Math.PI * x) * k - 4 * x * Math.sin(Math.PI * x)) / Math.PI;
}

/**
 * The rings' world XZ slope at a point (before the mask and the fades): every layer's one cell, × `RIPPLE_SLOPE` ×
 * strength. `seconds` is the wrapped clock (`rippleClock`); `share` the active share (`rippleActiveShare`).
 */
export function rainRippleSlopeAt(x: number, z: number, seconds: number, share: number, settings?: Partial<WaterRippleSettings> | null): [number, number] {
  const strength = rippleSetting(settings, "rippleStrength");
  const size = rippleSetting(settings, "rippleSize");
  let gx = 0;
  let gz = 0;
  if (share <= 0 || strength <= 0) return [0, 0];
  for (const [scale, clock, offset] of RIPPLE_LAYERS) {
    const px = x / (size * scale);
    const pz = z / (size * scale);
    const cx = Math.floor(px) + offset;
    const cz = Math.floor(pz) + offset;
    const fall = hash12(cx, cz);
    if (fall >= share) continue;
    const centreX = 0.5 + (hash12(cx + 7.7, cz + 3.1) - 0.5) * RIPPLE_JITTER;
    const centreZ = 0.5 + (hash12(cx + 2.9, cz + 9.3) - 0.5) * RIPPLE_JITTER;
    const t = fract(seconds / RIPPLE_PERIOD + hash12(cx + 5.3, cz + 1.7) + clock);
    const dx = fract(px) - centreX;
    const dz = fract(pz) - centreZ;
    const d = Math.max(Math.hypot(dx, dz), 1e-4);
    const across = (d - t * RIPPLE_RADIUS) / RIPPLE_WIDTH;
    const slope = ringProfileSlope(across) * (1 - t) * (1 - t);
    gx += (dx / d) * slope;
    gz += (dz / d) * slope;
  }
  return [gx * RIPPLE_SLOPE * strength, gz * RIPPLE_SLOPE * strength];
}
