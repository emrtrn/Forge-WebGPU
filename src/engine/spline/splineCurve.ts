// Ported from Forge WebGL engine/scene/splineCurve.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
import {
  normalizeSplineComponentData,
  splineSegmentCount,
  type ForgeSplineComponentData,
} from "./spline.ts";
import type { Vec3 } from "../legacy/layout.ts";

/**
 * Renderer-independent curve evaluation and arc-length cache for generic
 * splines (Faz 2). All inputs/outputs are actor-local coordinates.
 */

const EPSILON = 1e-8;
const FALLBACK_TANGENT: Vec3 = [1, 0, 0];

export interface SplineArcLengthSample {
  t: number;
  distance: number;
}

export interface SplineCurveSegmentCache {
  index: number;
  startDistance: number;
  length: number;
  samples: SplineArcLengthSample[];
}

export interface SplineCurveCache {
  /** Stable fingerprint of normalized input, used by cache owners to invalidate. */
  sourceVersion: string;
  spline: ForgeSplineComponentData;
  segments: SplineCurveSegmentCache[];
  totalLength: number;
}

export interface SplineCurveSample {
  segmentIndex: number;
  t: number;
  distance: number;
  position: Vec3;
  tangent: Vec3;
  direction: Vec3;
}

/**
 * Small owner-side cache helper. Repeated calls with unchanged normalized data
 * return the same arc-length table; any authored data change produces a new one.
 */
export class SplineCurveCacheStore {
  private cache: SplineCurveCache | null = null;

  get(data: unknown): SplineCurveCache {
    const spline = normalizeSplineComponentData(data);
    const sourceVersion = splineComponentVersion(spline);
    if (this.cache?.sourceVersion === sourceVersion) return this.cache;
    this.cache = buildSplineCurveCache(spline, sourceVersion);
    return this.cache;
  }

  clear(): void {
    this.cache = null;
  }
}

/** Builds an arc-length table using the authored reparameterization resolution. */
export function buildSplineCurveCache(data: unknown, sourceVersion?: string): SplineCurveCache {
  const spline = normalizeSplineComponentData(data);
  const version = sourceVersion ?? splineComponentVersion(spline);
  const segmentCount = splineSegmentCount(spline.points.length, spline.closed);
  const segments: SplineCurveSegmentCache[] = [];
  let totalLength = 0;

  for (let index = 0; index < segmentCount; index += 1) {
    const samples: SplineArcLengthSample[] = [{ t: 0, distance: 0 }];
    let previous = evaluateNormalizedSplineSegment(spline, index, 0).position;
    let length = 0;
    for (let step = 1; step <= spline.reparamStepsPerSegment; step += 1) {
      const t = step / spline.reparamStepsPerSegment;
      const position = evaluateNormalizedSplineSegment(spline, index, t).position;
      length += distanceBetween(previous, position);
      samples.push({ t, distance: length });
      previous = position;
    }
    segments.push({ index, startDistance: totalLength, length, samples });
    totalLength += length;
  }

  return { sourceVersion: version, spline, segments, totalLength };
}

/** Evaluates a single segment in local coordinates. Out-of-range indices clamp safely. */
export function evaluateSplineSegment(data: unknown, segmentIndex: number, t: number): Pick<SplineCurveSample, "position" | "tangent" | "direction"> {
  const spline = normalizeSplineComponentData(data);
  return evaluateNormalizedSplineSegment(spline, segmentIndex, t);
}

function evaluateNormalizedSplineSegment(spline: ForgeSplineComponentData, segmentIndex: number, t: number): Pick<SplineCurveSample, "position" | "tangent" | "direction"> {
  const segmentCount = splineSegmentCount(spline.points.length, spline.closed);
  if (segmentCount === 0) {
    const position = spline.points[0]?.position ?? [0, 0, 0];
    return { position: cloneVec3(position), tangent: [...FALLBACK_TANGENT], direction: [...FALLBACK_TANGENT] };
  }

  const index = clamp(Math.floor(segmentIndex), 0, segmentCount - 1);
  const u = clamp01(t);
  const start = spline.points[index]!;
  const end = spline.points[(index + 1) % spline.points.length]!;
  if (start.pointType === "linear") {
    const tangent = subtract(end.position, start.position);
    return {
      position: lerp(start.position, end.position, u),
      tangent,
      direction: normalizeDirection(tangent, fallbackSegmentDirection(spline, index)),
    };
  }

  const startTangent = outgoingTangent(spline, index);
  const endTangent = incomingTangent(spline, (index + 1) % spline.points.length);
  const u2 = u * u;
  const u3 = u2 * u;
  const position: Vec3 = [
    (2 * u3 - 3 * u2 + 1) * start.position[0] +
      (u3 - 2 * u2 + u) * startTangent[0] +
      (-2 * u3 + 3 * u2) * end.position[0] +
      (u3 - u2) * endTangent[0],
    (2 * u3 - 3 * u2 + 1) * start.position[1] +
      (u3 - 2 * u2 + u) * startTangent[1] +
      (-2 * u3 + 3 * u2) * end.position[1] +
      (u3 - u2) * endTangent[1],
    (2 * u3 - 3 * u2 + 1) * start.position[2] +
      (u3 - 2 * u2 + u) * startTangent[2] +
      (-2 * u3 + 3 * u2) * end.position[2] +
      (u3 - u2) * endTangent[2],
  ];
  const tangent: Vec3 = [
    (6 * u2 - 6 * u) * start.position[0] +
      (3 * u2 - 4 * u + 1) * startTangent[0] +
      (-6 * u2 + 6 * u) * end.position[0] +
      (3 * u2 - 2 * u) * endTangent[0],
    (6 * u2 - 6 * u) * start.position[1] +
      (3 * u2 - 4 * u + 1) * startTangent[1] +
      (-6 * u2 + 6 * u) * end.position[1] +
      (3 * u2 - 2 * u) * endTangent[1],
    (6 * u2 - 6 * u) * start.position[2] +
      (3 * u2 - 4 * u + 1) * startTangent[2] +
      (-6 * u2 + 6 * u) * end.position[2] +
      (3 * u2 - 2 * u) * endTangent[2],
  ];
  return { position, tangent, direction: normalizeDirection(tangent, fallbackSegmentDirection(spline, index)) };
}

/** Samples by travelled distance: open splines clamp, closed splines wrap at the seam. */
export function sampleSplineAtDistance(cache: SplineCurveCache, distance: number): SplineCurveSample {
  const segment = segmentAtDistance(cache, distance);
  if (!segment) {
    const position = cache.spline.points[0]?.position ?? [0, 0, 0];
    return {
      segmentIndex: 0,
      t: 0,
      distance: 0,
      position: cloneVec3(position),
      tangent: [...FALLBACK_TANGENT],
      direction: [...FALLBACK_TANGENT],
    };
  }
  const normalizedDistance = normalizeDistance(cache, distance);
  const localDistance = normalizedDistance - segment.startDistance;
  const t = tAtSegmentDistance(segment, localDistance);
  const evaluated = evaluateNormalizedSplineSegment(cache.spline, segment.index, t);
  return { segmentIndex: segment.index, t, distance: normalizedDistance, ...evaluated };
}

export function getSplineLocationAtDistance(cache: SplineCurveCache, distance: number): Vec3 {
  return sampleSplineAtDistance(cache, distance).position;
}

export function getSplineTangentAtDistance(cache: SplineCurveCache, distance: number): Vec3 {
  return sampleSplineAtDistance(cache, distance).tangent;
}

export function getSplineDirectionAtDistance(cache: SplineCurveCache, distance: number): Vec3 {
  return sampleSplineAtDistance(cache, distance).direction;
}

/** Stable lightweight fingerprint used by `SplineCurveCacheStore` invalidation. */
export function splineComponentVersion(data: unknown): string {
  const spline = normalizeSplineComponentData(data);
  return JSON.stringify(spline);
}

function segmentAtDistance(cache: SplineCurveCache, distance: number): SplineCurveSegmentCache | null {
  if (cache.segments.length === 0) return null;
  const normalized = normalizeDistance(cache, distance);
  for (const segment of cache.segments) {
    if (normalized <= segment.startDistance + segment.length + EPSILON) return segment;
  }
  return cache.segments[cache.segments.length - 1]!;
}

function normalizeDistance(cache: SplineCurveCache, distance: number): number {
  if (!Number.isFinite(distance) || cache.totalLength <= EPSILON) return 0;
  if (!cache.spline.closed) return clamp(distance, 0, cache.totalLength);
  const wrapped = distance % cache.totalLength;
  return wrapped < 0 ? wrapped + cache.totalLength : wrapped;
}

function tAtSegmentDistance(segment: SplineCurveSegmentCache, distance: number): number {
  if (segment.length <= EPSILON) return 0;
  const target = clamp(distance, 0, segment.length);
  let low = 0;
  let high = segment.samples.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (segment.samples[middle]!.distance < target) low = middle;
    else high = middle;
  }
  const before = segment.samples[low]!;
  const after = segment.samples[high]!;
  const span = after.distance - before.distance;
  if (span <= EPSILON) return before.t;
  return before.t + ((target - before.distance) / span) * (after.t - before.t);
}

function outgoingTangent(spline: ForgeSplineComponentData, index: number): Vec3 {
  const point = spline.points[index]!;
  return point.pointType === "curveCustom" && point.leaveTangent
    ? cloneVec3(point.leaveTangent)
    : autoTangent(spline, index);
}

function incomingTangent(spline: ForgeSplineComponentData, index: number): Vec3 {
  const point = spline.points[index]!;
  return point.pointType === "curveCustom" && point.arriveTangent
    ? cloneVec3(point.arriveTangent)
    : autoTangent(spline, index);
}

function autoTangent(spline: ForgeSplineComponentData, index: number): Vec3 {
  const points = spline.points;
  const count = points.length;
  if (count < 2) return [0, 0, 0];
  if (spline.closed) {
    const previous = points[(index - 1 + count) % count]!.position;
    const next = points[(index + 1) % count]!.position;
    return scale(subtract(next, previous), 0.5);
  }
  if (index === 0) return subtract(points[1]!.position, points[0]!.position);
  if (index === count - 1) return subtract(points[count - 1]!.position, points[count - 2]!.position);
  return scale(subtract(points[index + 1]!.position, points[index - 1]!.position), 0.5);
}

function fallbackSegmentDirection(spline: ForgeSplineComponentData, index: number): Vec3 {
  const points = spline.points;
  const start = points[index]?.position;
  const end = points[(index + 1) % points.length]?.position;
  return start && end ? subtract(end, start) : FALLBACK_TANGENT;
}

function normalizeDirection(value: Vec3, fallback: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length > EPSILON) return [value[0] / length, value[1] / length, value[2] / length];
  const fallbackLength = Math.hypot(fallback[0], fallback[1], fallback[2]);
  return fallbackLength > EPSILON
    ? [fallback[0] / fallbackLength, fallback[1] / fallbackLength, fallback[2] / fallbackLength]
    : [...FALLBACK_TANGENT];
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function distanceBetween(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function cloneVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

function clamp01(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
