import { SNOW_COVER_EDGE_OFFSETS, SNOW_COVER_EDGE_WEIGHT, SNOW_COVER_OFFSETS, SNOW_COVER_SOFTNESS } from "./precipitationCover.ts";
import { dryingLateness, patchSizeOf, patchySnow, smoothstep, snowShare, type SurfacePattern, type SurfaceResponseSettings, type Vec3 } from "./surfaceResponse.ts";

export interface TerrainSnowPoint {
  readonly position: Vec3;
  readonly normalY: number;
  readonly cavity: number;
  readonly snowAccept: number;
  readonly covered: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** CPU twin of the terrain's W5 snow share, sampled before W7 raises the surface. */
export function terrainSnowShare(coverage: number, settings: SurfaceResponseSettings & Partial<SurfacePattern>, point: TerrainSnowPoint): number {
  const [x, y, z] = point.position;
  const late = dryingLateness(x, z, point.cavity, patchSizeOf(settings));
  return patchySnow(coverage, late, settings.snowSpread ?? 1) * snowShare(point.normalY, y, settings)
    * clamp01(point.snowAccept) * (1 - clamp01(point.covered));
}

/** Height of the first roof, road, or water hit above the undisplaced ground. */
export type TerrainSnowRay = (x: number, y: number, z: number) => number | null;

/** Physics-side counterpart to the top-down depth map. The ray source supplies scene hits. */
export function terrainSnowCoverAt(position: Vec3, spacing: number, hitAbove: TerrainSnowRay): number {
  const [x, y, z] = position;
  const at = (dx: number, dz: number): number => {
    const hit = hitAbove(x + dx * spacing, y, z + dz * spacing);
    return hit === null ? 0 : smoothstep(0, SNOW_COVER_SOFTNESS, hit - y);
  };
  let covered = 0;
  for (const [dx, dz] of SNOW_COVER_OFFSETS) {
    covered = Math.max(covered, at(dx, dz));
    if (covered === 1) return 1;
  }
  let edge = 0;
  for (const [dx, dz] of SNOW_COVER_EDGE_OFFSETS) edge = Math.max(edge, at(dx, dz));
  return Math.max(covered, edge * SNOW_COVER_EDGE_WEIGHT);
}
