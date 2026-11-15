// Ported from Forge WebGL engine/terrain/puddleInteraction.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The pure part (constants, ripple stops); `puddleWheelContact` comes with vehicles (phase 6 / 8).
export const PUDDLE_RIPPLE_SECTORS = 32;
export const PUDDLE_MAX_RIPPLES = 12;
export const PUDDLE_TOTAL_RIPPLES = 48;
export const PUDDLE_MAX_RIPPLE_SHORE_SEGMENTS = 1024;

/** Conservative stop radius for each angular sector. Clip every exact shore
 * segment against the sector cone and find its nearest point. A narrow island
 * between centre rays still blocks the whole sector; waves never jump it.
 * This stops waves at obstacles; it does not simulate diffraction or flow. */
export function puddleRippleStops(x: number, z: number, shore: Float32Array, maximum: number): Float32Array {
  const stops = new Float32Array(PUDDLE_RIPPLE_SECTORS);
  if (!Number.isFinite(x + z + maximum) || maximum <= 0 || !shore.length || shore.length / 4 > PUDDLE_MAX_RIPPLE_SHORE_SEGMENTS) return stops;
  stops.fill(maximum);
  for (let sector = 0; sector < stops.length; sector++) {
    const left = sector * 2 * Math.PI / stops.length, right = (sector + 1) * 2 * Math.PI / stops.length;
    const lx = Math.cos(left), lz = Math.sin(left), rx = Math.cos(right), rz = Math.sin(right);
    for (let i = 0; i < shore.length; i += 4) {
      const ax = shore[i]! - x, az = shore[i + 1]! - z, dx = shore[i + 2]! - shore[i]!, dz = shore[i + 3]! - shore[i + 1]!;
      let lo = 0, hi = 1;
      // cross(left,p)>=0 and cross(p,right)>=0 form the convex sector.
      const a = lx * az - lz * ax, b = lx * dz - lz * dx;
      if (Math.abs(b) < 1e-12) { if (a < -1e-8) continue; }
      else if (b > 0) lo = Math.max(lo, -a / b); else hi = Math.min(hi, -a / b);
      const c = ax * rz - az * rx, d = dx * rz - dz * rx;
      if (Math.abs(d) < 1e-12) { if (c < -1e-8) continue; }
      else if (d > 0) lo = Math.max(lo, -c / d); else hi = Math.min(hi, -c / d);
      if (lo > hi) continue;
      const length = dx * dx + dz * dz;
      const t = Math.max(lo, Math.min(hi, length > 0 ? -(ax * dx + az * dz) / length : 0));
      stops[sector] = Math.min(stops[sector]!, Math.max(0, Math.hypot(ax + dx * t, az + dz * t) - .002));
    }
  }
  return stops;
}
