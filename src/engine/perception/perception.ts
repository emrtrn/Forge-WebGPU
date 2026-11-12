// Ported from Forge WebGL engine/perception/perception.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Engine-level AI perception helpers.
 *
 * Pure module: no DOM, Three.js, editor, or physics backend imports. Hosts pass
 * entity positions, listener configs, transient stimuli, and blocker AABBs in;
 * this file only answers what each listener can currently sense.
 */
import type { EntityId } from "../legacy/entity.ts";
import type { Vec3 } from "../legacy/layout.ts";

export interface PerceptionAabb {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface PerceptionListener {
  readonly entityId: EntityId;
  readonly position: Vec3;
  /** Optional world-space point used as the sight trace origin. */
  readonly sightOrigin?: Vec3;
  /** World-space forward direction. Only X/Z are used for horizontal FOV. */
  readonly forward: Vec3;
  readonly sightRadius?: number;
  /** Optional close awareness radius that bypasses FOV/blocker checks. */
  readonly nearSightRadius?: number;
  readonly fieldOfViewDeg?: number;
  readonly hearingRadius?: number;
}

export interface StimulusSource {
  readonly entityId: EntityId;
  readonly position: Vec3;
  /** Optional world-space point used as the sight trace target. */
  readonly sightTarget?: Vec3;
}

export interface NoiseStimulus {
  readonly sourceEntityId: EntityId;
  readonly position: Vec3;
  /** 1 means authored hearing radius, 2 doubles it, etc. */
  readonly loudness?: number;
}

export type GameplayPerceptionSense = "damage" | "alert" | "gameplay";
export type PerceptionSense = "sight" | "hearing" | GameplayPerceptionSense;

export const PERCEPTION_SENSE_PRIORITY: Readonly<Record<PerceptionSense, number>> = {
  damage: 100,
  sight: 80,
  alert: 70,
  hearing: 50,
  gameplay: 30,
};

export interface PerceivedStimulus {
  readonly sense: PerceptionSense;
  readonly sourceEntityId: EntityId;
  readonly position: Vec3;
  readonly distance: number;
  /** 1 is strongest, 0 is just inside range. */
  readonly strength: number;
  readonly lineOfSight?: boolean;
  /** Original gameplay/script event type, when this came from the message bus. */
  readonly eventType?: string;
}

export interface PerceptionEvaluationInput {
  readonly listener: PerceptionListener;
  readonly sources: readonly StimulusSource[];
  readonly noises?: readonly NoiseStimulus[];
  readonly blockers?: readonly PerceptionAabb[];
}

export function evaluatePerception(input: PerceptionEvaluationInput): PerceivedStimulus[] {
  const out: PerceivedStimulus[] = [];
  out.push(...evaluateSight(input.listener, input.sources, input.blockers ?? []));
  out.push(...evaluateHearing(input.listener, input.noises ?? []));
  return out.sort(comparePerceivedStimuli);
}

export function dominantPerceivedStimulus(
  stimuli: readonly PerceivedStimulus[],
): PerceivedStimulus | null {
  let dominant: PerceivedStimulus | null = null;
  for (const stimulus of stimuli) {
    if (!dominant || comparePerceivedStimuli(stimulus, dominant) < 0) {
      dominant = stimulus;
    }
  }
  return dominant;
}

export function comparePerceivedStimuli(a: PerceivedStimulus, b: PerceivedStimulus): number {
  return (
    PERCEPTION_SENSE_PRIORITY[b.sense] - PERCEPTION_SENSE_PRIORITY[a.sense] ||
    b.strength - a.strength ||
    a.distance - b.distance ||
    a.sourceEntityId.localeCompare(b.sourceEntityId)
  );
}

export function evaluateSight(
  listener: PerceptionListener,
  sources: readonly StimulusSource[],
  blockers: readonly PerceptionAabb[] = [],
): PerceivedStimulus[] {
  const radius = positiveOr(listener.sightRadius, 0);
  if (radius <= 0) return [];
  const nearRadius = positiveOr(listener.nearSightRadius, 0);
  const fov = clamp(positiveOr(listener.fieldOfViewDeg, 360), 0, 360);
  const sightOrigin = listener.sightOrigin ?? listener.position;
  const result: PerceivedStimulus[] = [];
  for (const source of sources) {
    if (source.entityId === listener.entityId) continue;
    const sightTarget = source.sightTarget ?? source.position;
    const distance = planarDistance(listener.position, source.position);
    if (distance > radius) continue;
    const nearAware = nearRadius > 0 && distance <= nearRadius;
    if (!nearAware && !insideHorizontalFov(sightOrigin, listener.forward, sightTarget, fov)) continue;
    const blocked = blockers.some((blocker) => segmentIntersectsAabb(sightOrigin, sightTarget, blocker));
    if (blocked && !nearAware) continue;
    result.push({
      sense: "sight",
      sourceEntityId: source.entityId,
      position: cloneVec3(source.position),
      distance,
      strength: 1 - distance / radius,
      lineOfSight: true,
    });
  }
  return result;
}

export function evaluateHearing(
  listener: PerceptionListener,
  noises: readonly NoiseStimulus[],
): PerceivedStimulus[] {
  const radius = positiveOr(listener.hearingRadius, 0);
  if (radius <= 0) return [];
  const result: PerceivedStimulus[] = [];
  for (const noise of noises) {
    if (noise.sourceEntityId === listener.entityId) continue;
    const loudness = Math.max(0, positiveOr(noise.loudness, 1));
    if (loudness <= 0) continue;
    const effectiveRadius = radius * loudness;
    const distance = planarDistance(listener.position, noise.position);
    if (distance > effectiveRadius) continue;
    result.push({
      sense: "hearing",
      sourceEntityId: noise.sourceEntityId,
      position: cloneVec3(noise.position),
      distance,
      strength: 1 - distance / effectiveRadius,
    });
  }
  return result;
}

export function insideHorizontalFov(
  origin: Vec3,
  forward: Vec3,
  target: Vec3,
  fieldOfViewDeg: number,
): boolean {
  if (fieldOfViewDeg >= 360) return true;
  const dx = target[0] - origin[0];
  const dz = target[2] - origin[2];
  const targetLen = Math.hypot(dx, dz);
  if (targetLen <= 1e-9) return true;
  const fx = forward[0];
  const fz = forward[2];
  const forwardLen = Math.hypot(fx, fz);
  if (forwardLen <= 1e-9) return true;
  const dot = (dx / targetLen) * (fx / forwardLen) + (dz / targetLen) * (fz / forwardLen);
  const halfRad = (clamp(fieldOfViewDeg, 0, 360) * Math.PI / 180) / 2;
  return dot >= Math.cos(halfRad) - 1e-9;
}

export function segmentIntersectsAabb(start: Vec3, end: Vec3, aabb: PerceptionAabb): boolean {
  let tMin = 0;
  let tMax = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = start[axis]!;
    const delta = end[axis]! - origin;
    const min = aabb.min[axis]!;
    const max = aabb.max[axis]!;
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const inv = 1 / delta;
    let near = (min - origin) * inv;
    let far = (max - origin) * inv;
    if (near > far) [near, far] = [far, near];
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    if (tMin > tMax) return false;
  }
  return true;
}

function planarDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[2] - a[2]);
}

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function cloneVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
