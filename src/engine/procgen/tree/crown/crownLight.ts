// How open each place in a crown is (vegetation plan PG5b, §9.8): the leaf
// area goes into a voxel grid, rays from a place measure the leaves around it.
// `light` 0..1 (1 outside, small in the core: the shader darkens with it) and
// the bent normal, the mean open direction: what a leaf there is lit by, so a
// clump shades as a clump and the two sides of a card alike.

import { unit, type Vec3 } from "../../vector.ts";
import { addScaled } from "../stems.ts";

export interface CrownSample { light: number; normal: Vec3 }

const RAYS: readonly { d: Vec3; weight: number }[] = (() => {
  const rays: { d: Vec3; weight: number }[] = [];
  const count = 18;
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * i + 1) / count, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
    // The sky above counts most, the ground below still reflects a little.
    rays.push({ d: [r * Math.cos(a), y, r * Math.sin(a)], weight: y > 0.2 ? 1 : y > -0.4 ? 0.7 : 0.35 });
  }
  return rays;
})();

/** `leaves`: where the leaf area is (m² per entry). */
export function createCrownLight(leaves: readonly { p: Vec3; area: number }[], cell: number): (p: Vec3) => CrownSample {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const { p } of leaves) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, p[k]!); max[k] = Math.max(max[k]!, p[k]!); }
  if (leaves.length === 0) return () => ({ light: 1, normal: [0, 1, 0] });
  const size = [0, 1, 2].map((k) => Math.max(1, Math.min(96, Math.ceil((max[k]! - min[k]!) / cell) + 2)));
  const [nx, ny, nz] = size as [number, number, number];
  // Leaf area density, m² per m³.
  const density = new Float32Array(nx * ny * nz);
  for (const { p, area } of leaves) {
    // Spread over the eight cells around the place.
    const f = [0, 1, 2].map((k) => (p[k]! - min[k]!) / cell + 0.5);
    const i0 = f.map(Math.floor);
    for (let corner = 0; corner < 8; corner++) {
      let weight = 1, index = 0;
      for (let k = 2; k >= 0; k--) {
        const up = (corner >> k) & 1, at = Math.min(size[k]! - 1, i0[k]! + up);
        weight *= up ? f[k]! - i0[k]! : 1 - (f[k]! - i0[k]!);
        index = index * size[k]! + at;
      }
      density[index]! += weight * area / cell ** 3;
    }
  }
  const at = (p: Vec3): number => {
    const x = Math.floor((p[0] - min[0]) / cell + 1), y = Math.floor((p[1] - min[1]) / cell + 1), z = Math.floor((p[2] - min[2]) / cell + 1);
    return x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? 0 : density[(z * ny + y) * nx + x]!;
  };
  const reach = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2, steps = Math.max(3, Math.ceil(reach / cell));
  return (p) => {
    let light = 0, weights = 0, normal: Vec3 = [0, 0, 0];
    for (const { d, weight } of RAYS) {
      let depth = 0;
      for (let s = 1; s <= steps; s++) depth += at(addScaled(p, d, (s - 0.35) * cell));
      // Half of the leaf area faces a ray on average; leaves scatter light, so the crown is never black.
      const open = Math.exp(-0.5 * depth * cell);
      light += weight * open;
      weights += weight;
      normal = addScaled(normal, d, weight * open);
    }
    const length = Math.hypot(...normal);
    // A place on the crown's outside has the crown behind it: half open is in full light.
    return { light: Math.min(1, 2 * light / weights), normal: length > 1e-4 ? unit(normal) : [0, 1, 0] };
  };
}
