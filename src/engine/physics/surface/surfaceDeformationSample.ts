// Ported from Forge WebGL engine/terrain/terrainSurface.ts (SurfaceDeformationSample) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The deformation a wheel reads from the ground. Forge declared it in the terrain
// surface sampler; physics owns it here and terrain imports it when it is ported.

/**
 * The soft-surface profile under a point, blended over the deformable layers
 * (TERRAIN_DEFORMATION Faz 2): `deformability` is their share of the paint
 * weight, the other fields their weight-averaged profile values.
 */
export interface SurfaceDeformationSample {
  /** Presentation-only, weight-blended water eligibility; absent means dry. */
  readonly wetness?: number;
  readonly deformability: number;
  readonly maxDepth: number;
  readonly compaction: number;
  /** Additional digging while slipping (m/s). */
  readonly digRate: number;
  readonly recoveryRate: number;
  /** Extra resistance multiplier as the wheel sinks. */
  readonly sinkResistance: number;
}
