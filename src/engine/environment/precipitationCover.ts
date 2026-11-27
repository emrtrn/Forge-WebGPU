// Precipitation cover (plan phase W3, architecture §4.9), new to Forge WebGPU.
// Two top-down depth maps record the highest static surface around the camera.
// Their centres snap to the texel grid to keep sampling stable until a redraw.
// The CPU reference sampler mirrors the shader's depth decoding and fades.

export interface CoverCascadeSpec {
  /** Edge of the square, metres. */
  readonly size: number;
  /** Texels along an edge. */
  readonly resolution: number;
}

/** Near then far. */
export const COVER_CASCADES: readonly CoverCascadeSpec[] = [
  { size: 64, resolution: 1024 },
  { size: 256, resolution: 1024 },
];
/** Metres the slab reaches above and below the camera when it is (re)placed. */
export const COVER_ABOVE = 500;
export const COVER_BELOW = 300;
/** A square is re-centred once the camera is this fraction of its edge away from the centre (x or z). */
export const COVER_RECENTRE_FRACTION = 0.125;
/** The camera moved this far up or down from the slab's placement: redraw (metres). */
export const COVER_RECENTRE_HEIGHT = 100;
/** Fraction of the half edge, from the border inward, over which the cover fades out. */
export const COVER_EDGE_FADE = 0.15;
/** A point this far (m) below the cover's underside is fully covered; between 0 and this it fades. */
export const COVER_SOFTNESS = 0.25;
export interface CoverPlacement {
  /** Centre of the square (x, z), on the texel grid. */
  readonly centerX: number;
  readonly centerZ: number;
  /** World Y of the slab's top and bottom. */
  readonly top: number;
  readonly bottom: number;
}

export function coverTexel(spec: CoverCascadeSpec): number {
  return spec.size / spec.resolution;
}

export function placeCover(spec: CoverCascadeSpec, camera: readonly [number, number, number]): CoverPlacement {
  const [x, y, z] = camera;
  const texel = coverTexel(spec);
  return {
    centerX: Math.round(x / texel) * texel,
    centerZ: Math.round(z / texel) * texel,
    top: y + COVER_ABOVE,
    bottom: y - COVER_BELOW,
  };
}

export function coverNeedsRecentre(
  spec: CoverCascadeSpec, placement: CoverPlacement | null, camera: readonly [number, number, number],
): boolean {
  if (placement === null) return true;
  if (!camera.every(Number.isFinite)) return false;

  const [x, y, z] = camera;
  const threshold = spec.size * COVER_RECENTRE_FRACTION;
  return Math.abs(x - placement.centerX) > threshold
    || Math.abs(z - placement.centerZ) > threshold
    || Math.abs(y - (placement.top - COVER_ABOVE)) > COVER_RECENTRE_HEIGHT;
}

export function coverHeightFromDepth(placement: CoverPlacement, depth: number, reversed: boolean): number | null {
  if (!Number.isFinite(depth)) return null;
  const t = reversed ? 1 - depth : depth;
  if (t >= 1 - 1e-6) return null;
  return placement.top - t * (placement.top - placement.bottom);
}

function smoothstep(min: number, max: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

export function coverEdgeWeight(spec: CoverCascadeSpec, placement: CoverPlacement, x: number, z: number): number {
  const halfSize = spec.size / 2;
  const radius = Math.max(Math.abs(x - placement.centerX), Math.abs(z - placement.centerZ)) / halfSize;
  return 1 - smoothstep(1 - COVER_EDGE_FADE, 1, radius);
}

export function coverAmount(coverHeight: number | null, y: number): number {
  if (coverHeight === null || y >= coverHeight) return 0;
  return smoothstep(0, COVER_SOFTNESS, coverHeight - y);
}

export interface CoverMap {
  readonly spec: CoverCascadeSpec;
  readonly placement: CoverPlacement;
  /** Row-major resolution × resolution, from min z and min x. Depth 0..1, cleared to 1 (reversed: 0). */
  readonly depth: Float32Array;
  readonly reversed: boolean;
}

export function coverAt(maps: readonly CoverMap[], x: number, y: number, z: number): number {
  let result = 0;
  let remaining = 1;
  for (const { spec, placement, depth, reversed } of maps) {
    const weight = coverEdgeWeight(spec, placement, x, z);
    if (!(weight > 0)) continue;

    const halfSize = spec.size / 2;
    const texel = coverTexel(spec);
    const column = Math.floor((x - (placement.centerX - halfSize)) / texel);
    const row = Math.floor((z - (placement.centerZ - halfSize)) / texel);
    if (column < 0 || column >= spec.resolution || row < 0 || row >= spec.resolution) continue;

    const height = coverHeightFromDepth(placement, depth[row * spec.resolution + column] ?? NaN, reversed);
    result += remaining * weight * coverAmount(height, y);
    remaining *= 1 - weight;
    if (remaining === 0) break;
  }
  return result;
}
