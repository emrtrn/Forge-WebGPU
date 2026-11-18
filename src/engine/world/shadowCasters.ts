// Size-based caster classification for nested sun shadow cascades (R9c).

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** World-space width of one shadow texel. Returns zero for unusable dimensions. */
export function cascadeTexelSize(width: number, mapSize: number): number {
  if (!positiveFinite(width) || !positiveFinite(mapSize)) return 0;
  const size = width / mapSize;
  return Number.isFinite(size) ? size : 0;
}

/**
 * Last cascade whose texel threshold the world-space radius meets, including
 * equality. Cascades are numbered from one, with zero meaning no shadow.
 */
export function maxCasterCascade(radius: number, texels: readonly number[], minTexels: number): number {
  if (!positiveFinite(radius) || !positiveFinite(minTexels)) return 0;
  let last = 0;
  let previous = 0;
  for (const [index, size] of texels.entries()) {
    if (!positiveFinite(size)) return 0;
    if (size <= previous) throw new RangeError("Cascade texel sizes must be strictly increasing.");
    if (radius >= minTexels * size) last = index + 1;
    previous = size;
  }
  return last;
}

/**
 * Mask of caster classes visible to a one-based shadow cascade. The first
 * layer belongs to class one, the next to class two, and so on. Other camera
 * layers are managed by the caller.
 */
export function casterLayerMask(cascade: number, classLayers: readonly number[]): number {
  if (!Number.isInteger(cascade) || cascade < 1 || cascade > classLayers.length) return 0;
  let mask = 0;
  for (const [index, layer] of classLayers.entries()) {
    if (!Number.isInteger(layer) || layer < 0 || layer >= 32) return 0;
    if (index + 1 >= cascade) mask |= 1 << layer;
  }
  return mask;
}

/** A single sun's nested shadow maps, nearest first. Widths and splits are in metres. */
export interface ShadowCasterProfile {
  readonly texels: readonly number[];
  readonly splits: readonly number[];
  readonly minTexels: number;
}

/** Fade only a caster with some, but not all, cascades available. Zero means no extra fade. */
export function casterFadeEnd(cascade: number, profile: ShadowCasterProfile): number {
  return cascade > 0 && cascade < profile.splits.length ? profile.splits[cascade - 1]! : 0;
}

export const CASTER_FADE_START = 0.85;
