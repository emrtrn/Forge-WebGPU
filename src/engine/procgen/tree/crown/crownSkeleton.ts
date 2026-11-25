// The wood of a generated tree (vegetation plan PG5b, §9.8) and where its
// sprays may sit: the parts both skeletons share, and which one a habit has.
//
// Every random draw comes from a stream of the seed (and of the part's id
// where one part must not move another).

import { dot, sub, unit, type Vec3 } from "../../vector.ts";
import { addScaled, perpendicular, type TreeStem } from "../stems.ts";
import { coniferSkeleton } from "./coniferSkeleton.ts";
import type { CrownParams } from "./crownParams.ts";
import { spreadingSkeleton } from "./spreadingSkeleton.ts";

export const MAX_STEMS = 4000;

export interface CrownStem extends TreeStem {
  /** The stem off the trunk this one belongs to (its own index for one, 0 the trunk): the wind's phase. */
  limb: number;
}

/** A place on thin wood a spray may grow from. */
export interface SpraySite {
  id: string;
  stem: number;
  /** Arc fraction on the stem. */
  t: number;
  base: Vec3;
  dir: Vec3;
  /** The leaf side's direction, not yet perpendicular to `dir`. */
  up: Vec3;
  /** Multiplies the recipe's spray length. */
  scale: number;
  /** A coarse LOD's card stays shorter than this, metres. */
  reach?: number;
  /** Below 1 the coarse LODs rather keep this one than another (default 1). */
  keep?: number;
}

export interface CrownSkeleton {
  stems: CrownStem[];
  sites: SpraySite[];
  /** The crown's box: its centre, and its half extents. */
  center: Vec3;
  radius: Vec3;
  /** What the leaf area index is taken over, m². */
  referenceArea: number;
  height: number;
}

export type CrownSkeletonResult = CrownSkeleton | { error: string };

export function stemOf(points: Vec3[], radii: number[], id: string, level: number, parent: number, attach: number, limb: number): CrownStem {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(...sub(points[i]!, points[i - 1]!));
  return { id, level, parent, attach, points, radii, length, limb };
}

/** Half the crown's silhouette or its projection, whichever is larger: a tall narrow crown carries leaves by its side. */
export const referenceArea = (radius: number, depth: number): number => Math.max(Math.PI * radius * radius, 0.5 * (Math.PI / 4) * 2 * radius * depth);

export const flareOf = (params: CrownParams, y: number): number => 1 + params.flare * Math.max(0, 1 - y / (0.06 * params.height)) ** 2;

export function buildCrownSkeleton(params: CrownParams): CrownSkeletonResult {
  return params.habit === "conifer" ? coniferSkeleton(params) : spreadingSkeleton(params);
}

/** A unit vector with the component along `dir` removed. */
export function perpendicularPart(up: Vec3, dir: Vec3): Vec3 {
  const rest = addScaled(up, dir, -dot(up, dir));
  return Math.hypot(...rest) < 1e-4 ? perpendicular(dir) : unit(rest);
}
