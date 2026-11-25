// Stems of a generated tree: tapered polylines, and sampling along them.

import { cross, sub, unit, type Vec3 } from "../vector.ts";

export interface TreeStem {
  id: string;
  /** 0 the trunk (a shrub's main stems). */
  level: number;
  /** -1 for one out of the ground. */
  parent: number;
  /** Attachment at a fraction of the parent's arc length. */
  attach: number;
  points: Vec3[];
  radii: number[];
  length: number;
}

const UP: Vec3 = [0, 1, 0];

export function addScaled(point: Vec3, direction: Vec3, distance: number): Vec3 {
  return [
    point[0] + direction[0] * distance,
    point[1] + direction[1] * distance,
    point[2] + direction[2] * distance,
  ];
}

export function perpendicular(direction: Vec3): Vec3 {
  return unit(cross(direction, Math.abs(direction[1]) < 0.9 ? UP : [0, 0, 1]));
}

/** Cumulative length at each point. */
export function arcLengths(points: readonly Vec3[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1]! + Math.hypot(...sub(points[i]!, points[i - 1]!)));
  }
  return lengths;
}

export interface StemSample { point: Vec3; tangent: Vec3; radius: number }

/** Arc-length sampling with interpolated tangents for smooth ring frames. */
export function createStemSampler(stem: TreeStem): (t: number) => StemSample {
  const distances = arcLengths(stem.points);
  const directions = stem.points.slice(1).map((point, i) => unit(sub(point, stem.points[i]!)));
  const tangents = stem.points.map((_, i) => {
    const before = directions[Math.max(0, i - 1)]!;
    const after = directions[Math.min(i, directions.length - 1)]!;
    return unit(addScaled(before, after, 1));
  });
  return t => {
    const distance = t * distances[distances.length - 1]!;
    let lower = 0, upper = distances.length - 1;
    while (upper - lower > 1) {
      const middle = (lower + upper) >>> 1;
      if (distances[middle]! <= distance) lower = middle;
      else upper = middle;
    }
    const f = (distance - distances[lower]!) / (distances[upper]! - distances[lower]!);
    const point = stem.points[lower]!, tangent = tangents[lower]!;
    const radius = stem.radii[lower]!;
    return {
      point: addScaled(point, sub(stem.points[upper]!, point), f),
      tangent: unit(addScaled(tangent, sub(tangents[upper]!, tangent), f)),
      radius: radius + (stem.radii[upper]! - radius) * f,
    };
  };
}
