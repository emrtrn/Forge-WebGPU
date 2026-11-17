// Which static batches draw through the GPU-driven automatic LOD path (plan
// 5c R9.3 / R9.4). A batch decides when it builds its meshes (first build,
// capacity growth, colour buffer), so the decision is stable between edits.
//
// - A part can take the path when its geometry is a complete, static,
//   indexed-or-not triangle list and its materials are opaque (R9.3).
//   Transparent parts stay instanced: neither path sorts instances, but the
//   instanced mesh keeps three's per-object order, which R9 does not change.
// - `auto`: a batch with at least `GPU_STATIC_MIN_INSTANCES` placements when it builds, or with a
//   part over `SMALL_TRIANGLES` (it may have LODs), takes the path; smaller
//   batches stay instanced (per-view compute would cost more than it saves).
//   The threshold is provisional.
// - `gpu` / `instanced` force a path (measurement, `?staticPath=`).
// - The host's default is `instanced`: R9.0 (2026-11-17) measured no level
//   where the GPU path paid (three dispatches per batch and view cost about
//   50 µs of submission per batch; GPU time no lower).

import type { BufferGeometry, Material } from "three/webgpu";
import { SMALL_TRIANGLES } from "../../engine/geometry/triangleData.ts";

export type StaticPath = "auto" | "gpu" | "instanced";

export const STATIC_PATHS: readonly StaticPath[] = ["auto", "gpu", "instanced"];

/** Placements from which `auto` draws a batch through the GPU path (provisional, R9.0). */
export const GPU_STATIC_MIN_INSTANCES = 16;

export interface StaticPathPart {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
}

/** The part can be drawn by the automatic LOD path (R9.3). */
export function lodEligible(part: StaticPathPart): boolean {
  const geometry = part.geometry;
  if (Object.keys(geometry.morphAttributes).length > 0) return false;
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  if (!geometry.attributes.position) return false;
  if (Object.values(geometry.attributes).some((attribute) => attribute.itemSize > 4)) return false;
  const materials = Array.isArray(part.material) ? part.material : [part.material];
  return materials.every((material) => !material.transparent);
}

function triangleCount(geometry: BufferGeometry): number {
  return Math.floor((geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0) / 3);
}

/** Per part: draw it through the automatic LOD path. All false keeps the batch instanced. */
export function lodParts(path: StaticPath, parts: readonly StaticPathPart[], placements: number): boolean[] {
  const eligible = parts.map(lodEligible);
  if (path === "instanced") return eligible.map(() => false);
  if (path === "gpu") return eligible;
  const worth = placements >= GPU_STATIC_MIN_INSTANCES || parts.some((part, i) => eligible[i] && triangleCount(part.geometry) > SMALL_TRIANGLES);
  return eligible.map((ok) => ok && worth);
}

/** `?staticPath=` (development measurement); anything else is `auto`. */
export function parseStaticPath(value: string | null): StaticPath {
  return STATIC_PATHS.includes(value as StaticPath) ? value as StaticPath : "auto";
}
