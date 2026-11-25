const FRACTION_STEPS = 2 ** 24;
const DIAGONAL = Math.SQRT1_2;
const GRADIENTS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [DIAGONAL, DIAGONAL], [-DIAGONAL, DIAGONAL], [DIAGONAL, -DIAGONAL], [-DIAGONAL, -DIAGONAL],
] as const;

function wrap(index: number, period: number): number {
  return ((index % period) + period) % period;
}

function tileCoordinate(value: number, period: number): number {
  // Snap sub-cell fractions to absorb roundoff from shifting floating-point inputs by a period.
  const local = value % period;
  const rounded = Math.round(local * FRACTION_STEPS) / FRACTION_STEPS;
  return rounded < 0 ? rounded + period : rounded === period ? 0 : rounded;
}

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function dot(x: number, y: number, fx: number, fy: number, seed: number): number {
  const [gx, gy] = GRADIENTS[hash(x, y, seed) & 7]!;
  return gx * fx + gy * fy;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function gradientAt(x: number, y: number, period: number, periodY: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const nextX = (ix + 1) % period, nextY = (iy + 1) % periodY;
  const fx = x - ix, fy = y - iy;
  const u = fade(fx), v = fade(fy);
  return lerp(
    lerp(dot(ix, iy, fx, fy, seed), dot(nextX, iy, fx - 1, fy, seed), u),
    lerp(dot(ix, nextY, fx, fy - 1, seed), dot(nextX, nextY, fx - 1, fy - 1, seed), u),
    v,
  );
}

/** Periodic 2D gradient noise with quintic fade, roughly [-1, 1]. */
export function periodicNoise2(x: number, y: number, period: number, seed: number): number {
  return gradientAt(tileCoordinate(x, period), tileCoordinate(y, period), period, period, seed);
}

/** Periodic Worley F1 in cell units, clamped to [0, 1]. */
export function periodicCellular2(x: number, y: number, period: number, seed: number, periodY = period): number {
  x = tileCoordinate(x, period);
  y = tileCoordinate(y, periodY);
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  let closestSquared = 1;
  // Any cell outside this neighborhood is at least one cell unit away.
  for (let dy = -1; dy <= 1; dy++) {
    const cellY = wrap(iy + dy, periodY);
    for (let dx = -1; dx <= 1; dx++) {
      const bits = hash(wrap(ix + dx, period), cellY, seed);
      const offsetX = dx + ((bits & 0xffff) + 0.5) / 65536 - fx;
      const offsetY = dy + ((bits >>> 16) + 0.5) / 65536 - fy;
      closestSquared = Math.min(closestSquared, offsetX * offsetX + offsetY * offsetY);
    }
  }
  return Math.sqrt(closestSquared);
}

/** Amplitude-normalized periodic fBm. Lacunarity is an integer of at least two. */
export function periodicFbm2(x: number, y: number, period: number, octaves: number, lacunarity: number, gain: number, seed: number, periodY = period): number {
  x = tileCoordinate(x, period);
  y = tileCoordinate(y, periodY);
  const count = Math.min(10, Math.max(1, Math.floor(octaves) || 1));
  let sum = 0, total = 0, amplitude = 1;
  for (let octave = 0; octave < count && amplitude !== 0; octave++) {
    sum += amplitude * gradientAt(x, y, period, periodY, seed + octave * 101);
    total += amplitude;
    amplitude *= gain;
    x *= lacunarity;
    y *= lacunarity;
    period *= lacunarity;
    periodY *= lacunarity;
  }
  return sum / total;
}
