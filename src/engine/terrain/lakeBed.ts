// Ported from Forge WebGL engine/scene/lakeBed.ts (lakeBedDistance, lakeBedTarget, BedPoint) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Pure lake-bed profile math World Builder carves with; the lake model itself waits for Faz 7.


export type BedPoint = [number, number];

/** Negative outside, positive inside; boundary = 0. Local differences preserve large origins. */
export function lakeBedDistance(poly: readonly BedPoint[], x: number, z: number): number {
  let inside = false, distance = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    if ((a[1] > z) !== (b[1] > z) && x - a[0] < (z - a[1]) * dx / dz) inside = !inside;
  }
  return inside ? distance : -distance;
}

/**
 * Bed height at `distance` from the shore (positive inside): falls at
 * `slopeDegrees` to `depth` below `level`; outside, rises from `level` and
 * reaches infinity (no change) `width` out.
 */
export function lakeBedTarget(level: number, depth: number, slopeDegrees: number, width: number, distance: number): number {
  const m = Math.tan(slopeDegrees * Math.PI / 180);
  if (distance >= 0) return level - Math.min(depth, distance * m);
  const r = -distance; if (r >= width) return Infinity;
  const t = r / width, blend = t * t * (3 - 2 * t);
  return level + m * r / (1 - blend);
}
