// Improved Perlin-style 3D gradient noise: quintic fade and 12 cube-edge gradients.
// Coordinate hash adapted from engine/worldbuilder/noise.ts (no cross-concern import).
function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x1b873593) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const gradients = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
] as const;
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Roughly [-1, 1], continuous across lattice boundaries, including negative coordinates. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const corner = (dx: number, dy: number, dz: number): number => {
    const g = gradients[hash(ix + dx, iy + dy, iz + dz, seed) % 12]!;
    return g[0] * (fx - dx) + g[1] * (fy - dy) + g[2] * (fz - dz);
  };
  const u = fade(fx), v = fade(fy), w = fade(fz);
  return lerp(
    lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), u), lerp(corner(0, 1, 0), corner(1, 1, 0), u), v),
    lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), u), lerp(corner(0, 1, 1), corner(1, 1, 1), u), v), w,
  );
}

export interface FbmOptions { seed: number; octaves: number; lacunarity: number; gain: number }

/** Amplitude-normalized fBm; bounded octave count also guarantees termination. */
export function fbm3(x: number, y: number, z: number, options: FbmOptions): number {
  const octaves = Number.isFinite(options.octaves) ? Math.max(0, Math.min(16, Math.floor(options.octaves))) : 0;
  const lacunarity = Number.isFinite(options.lacunarity) ? Math.max(1, Math.min(8, options.lacunarity)) : 2;
  const gain = Number.isFinite(options.gain) ? Math.max(0, Math.min(1, options.gain)) : 0.5;
  let sum = 0, weight = 0, amplitude = 1;
  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude * noise3(x, y, z, options.seed + octave * 101);
    weight += amplitude;
    amplitude *= gain;
    x *= lacunarity; y *= lacunarity; z *= lacunarity;
  }
  return weight === 0 ? 0 : sum / weight;
}
