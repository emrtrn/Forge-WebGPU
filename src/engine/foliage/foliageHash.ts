// Ported from Forge WebGL engine/scene/proceduralFoliage.ts @ forge-webgl-final (04b5fb23).
function mix(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Frozen unsigned 32-bit cell hash; changing it reshuffles existing grass layouts. */
export function foliageCellSeed(seed: number, cellX: number, cellZ: number): number {
  return mix(mix((seed >>> 0) ^ Math.imul(cellX | 0, 0x9e3779b1)) ^ Math.imul(cellZ | 0, 0x27d4eb2d));
}
