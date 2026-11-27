import { snowCoversTerrain, snowShare, type SurfacePattern, type SurfaceResponseSettings, type Vec3 } from "./surfaceResponse.ts";

export interface TerrainSnowPoint {
  readonly position: Vec3;
  readonly normalY: number;
  readonly snowAccept: number;
}

/** Sample the base slope across the mesh grid so a sharp terrain cut does not create a snow step. */
export const SNOW_SLOPE_RADIUS = 1.5;
export const SNOW_SLOPE_CENTRE_WEIGHT = 0.25;
export const SNOW_SLOPE_OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** CPU twin of the terrain's snow share, sampled before W7 raises the surface. */
export function terrainSnowShare(coverage: number, settings: SurfaceResponseSettings & Partial<SurfacePattern>, point: TerrainSnowPoint): number {
  if (!snowCoversTerrain(coverage, settings.snowSpread)) return 0;
  return snowShare(point.normalY, point.position[1], settings)
    * clamp01(point.snowAccept);
}
