// Static batches split by world cell (plan 5c R9a, step a): placements that
// draw alike share a batch only within one cell of `size` metres on X / Z, so
// a batch's draw can be skipped when its cell is occluded (an occlusion query
// per batch, step b). Size 0 keeps today's level-wide batches.

import type { Matrix4 } from "three/webgpu";

/** The batch key suffix of a placement at `matrix` (its translation); "" when cells are off. */
export function cellSuffix(matrix: Matrix4, size: number): string {
  if (!(size > 0)) return "";
  const e = matrix.elements;
  return `|cell ${Math.floor(e[12]! / size)},${Math.floor(e[14]! / size)}`;
}
