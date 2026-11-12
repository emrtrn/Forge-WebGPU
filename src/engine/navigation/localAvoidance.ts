// Ported from Forge WebGL engine/navigation/localAvoidance.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Simple local avoidance for AI path following: planar separation steering away
 * from nearby agents, and a stuck tracker that flags an agent making no progress
 * so the host can replan or fail the move.
 *
 * Pure engine module: no DOM, Three.js or editor imports; value imports stay
 * relative so the engine-test bundler (no path aliases) can run it.
 */
import type { Vec3 } from "../legacy/layout.ts";

/** Another agent the mover should keep clear of (planar X/Z check). */
export interface AvoidanceNeighbor {
  readonly position: Vec3;
  /** Planar collision radius of the neighbor (capsule/collider radius). */
  readonly radius: number;
}

export interface SeparationOptions {
  /** Extra clearance beyond the two radii before a neighbor stops pushing. */
  readonly buffer?: number;
  /** Upper bound on the returned vector's magnitude. */
  readonly maxMagnitude?: number;
}

const DEFAULT_SEPARATION_BUFFER = 0.4;
const DEFAULT_SEPARATION_MAX = 1;
/** Below this planar distance two agents count as co-located (degenerate push). */
const OVERLAP_EPSILON = 1e-4;

/**
 * Planar (X/Z) separation steering: each neighbor closer than
 * `selfRadius + neighbor.radius + buffer` pushes the agent directly away, with
 * strength growing linearly as the gap closes. Returns a world-space `[x, z]`
 * vector clamped to `maxMagnitude`; zero when every neighbor is clear. Exactly
 * co-located neighbors push along +X so two stacked agents still separate
 * deterministically.
 */
export function separationSteering(
  position: Vec3,
  selfRadius: number,
  neighbors: readonly AvoidanceNeighbor[],
  options: SeparationOptions = {},
): readonly [number, number] {
  const buffer = saneNonNegative(options.buffer, DEFAULT_SEPARATION_BUFFER);
  const maxMagnitude = saneNonNegative(options.maxMagnitude, DEFAULT_SEPARATION_MAX);
  let outX = 0;
  let outZ = 0;
  for (const neighbor of neighbors) {
    const range = Math.max(0, selfRadius) + Math.max(0, neighbor.radius) + buffer;
    if (range <= 0) continue;
    const dx = position[0] - neighbor.position[0];
    const dz = position[2] - neighbor.position[2];
    const distance = Math.hypot(dx, dz);
    if (distance >= range) continue;
    const weight = (range - distance) / range;
    if (distance < OVERLAP_EPSILON) {
      outX += weight;
      continue;
    }
    outX += (dx / distance) * weight;
    outZ += (dz / distance) * weight;
  }
  const magnitude = Math.hypot(outX, outZ);
  if (magnitude <= maxMagnitude || magnitude === 0) return [outX, outZ];
  const scale = maxMagnitude / magnitude;
  return [outX * scale, outZ * scale];
}

/**
 * Progress window for stuck detection: the anchor is the last position the
 * agent measurably progressed from; `secondsWithoutProgress` accumulates while
 * it stays within `minProgress` of that anchor.
 */
export interface StuckState {
  readonly anchorX: number;
  readonly anchorZ: number;
  readonly secondsWithoutProgress: number;
}

export interface StuckOptions {
  /** Planar distance from the anchor that counts as progress (resets the window). */
  readonly minProgress?: number;
  /** Seconds without progress before {@link isStuck} reports true. */
  readonly stuckAfterSeconds?: number;
}

const DEFAULT_MIN_PROGRESS = 0.25;
const DEFAULT_STUCK_AFTER_SECONDS = 1.25;

/** A fresh (not stuck) progress window anchored at `position`. */
export function freshStuckState(position: Vec3): StuckState {
  return { anchorX: position[0], anchorZ: position[2], secondsWithoutProgress: 0 };
}

/**
 * Advances the progress window by one frame: moving `minProgress` away from the
 * anchor re-anchors and clears the timer, anything else accumulates `deltaSeconds`.
 */
export function updateStuckState(
  state: StuckState,
  position: Vec3,
  deltaSeconds: number,
  options: StuckOptions = {},
): StuckState {
  const minProgress = sanePositive(options.minProgress, DEFAULT_MIN_PROGRESS);
  const moved = Math.hypot(position[0] - state.anchorX, position[2] - state.anchorZ);
  if (moved >= minProgress) return freshStuckState(position);
  return {
    anchorX: state.anchorX,
    anchorZ: state.anchorZ,
    secondsWithoutProgress: state.secondsWithoutProgress + Math.max(0, deltaSeconds),
  };
}

/** True once the agent has gone `stuckAfterSeconds` without progress. */
export function isStuck(state: StuckState, options: StuckOptions = {}): boolean {
  const threshold = sanePositive(options.stuckAfterSeconds, DEFAULT_STUCK_AFTER_SECONDS);
  return state.secondsWithoutProgress >= threshold;
}

function sanePositive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function saneNonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
