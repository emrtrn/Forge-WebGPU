// The volume a spreading crown fills: a body of revolution (height, width,
// widest point, crown start) broken into boughs, so its outline has shoulders
// and light gets between them in every seed. `clumping` deepens the gaps.

import { noise3 } from "../../noise.ts";
import { createStream, streamSeed } from "../../random.ts";
import { dot, unit, type Vec3 } from "../../vector.ts";
import type { CrownParams } from "./crownParams.ts";

const TAU = Math.PI * 2;
const BOUGHS = 9;

export interface CrownEnvelope {
  /** Metres: the crown's lower edge, its depth, its radius at the widest point. */
  base: number;
  depth: number;
  radius: number;
  middle: Vec3;
  /** Where the crown's axis passes at a height. */
  axis(y: number): [number, number];
  /** 0 on the axis, 1 on the outline, more outside. */
  reach(p: Vec3): number;
  /** No leaves here: the air between the boughs, and (the less the leader leads) around the trunk where the limbs rise. */
  open(p: Vec3, reach: number): boolean;
}

export function crownEnvelope(params: CrownParams): CrownEnvelope {
  const { seed, height: H, irregularity, fullness, clumping, leaderDominance, widestPoint: widest } = params;
  const base = H * params.crownStart, depth = H - base, shrub = params.habit === "shrub";
  const shape = createStream(seed, "crown/shape");
  const radius = H * params.width * 0.5 * (1 + shape.range(-0.08, 0.08) * irregularity);
  const noiseSeed = streamSeed(seed, "crown/noise");
  const leanAt = shape.range(0, TAU), lean = shrub ? 0 : irregularity * 0.045 * H;
  const axis = (y: number): [number, number] => {
    const t = Math.max(0, Math.min(1, y / H));
    return [Math.cos(leanAt) * lean * t * t, Math.sin(leanAt) * lean * t * t];
  };
  const middle: Vec3 = [0, base + depth * widest, 0];
  // A bough is a direction out of the crown's middle, jittered off an even spread, with a size of its own.
  const spread = createStream(seed, "crown/boughs"), boughs: { d: Vec3; size: number }[] = [], turn = spread.range(0, TAU);
  for (let k = 0; k < BOUGHS; k++) {
    const y = 1 - (2 * k + 1) / BOUGHS, r = Math.sqrt(1 - y * y), a = turn + k * Math.PI * (3 - Math.sqrt(5));
    const jitter = spread.unitVector(), size = spread.range(0.55, 1.1);
    boughs.push({ d: unit([r * Math.cos(a) + jitter[0] * 0.4, y + jitter[1] * 0.3, r * Math.sin(a) + jitter[2] * 0.4]), size });
  }
  const lobed = 0.5 * clumping;
  const lobes = (out: Vec3): number => {
    let best = 0;
    for (const { d, size } of boughs) best = Math.max(best, size * Math.exp((dot(out, d) - 1) * 3.4));
    return 1 - lobed + 1.5 * lobed * Math.min(1, best);
  };
  /** The outline's radius at height y, without the boughs. */
  const profile = (y: number, edge: number): number => {
    const t = (y - base - edge) / (depth - edge);
    if (t <= 0 || t >= 1) return 0;
    const d = t < widest ? (widest - t) / widest : (t - widest) / (1 - widest);
    return radius * (t < widest ? 0.25 + 0.75 * Math.sqrt(1 - d * d) : Math.sqrt(1 - d * d));
  };
  const clump = 0.17 * Math.min(H, radius * 3), air = -0.42 + 0.5 * clumping + 0.22 * (1 - fullness), bare = shrub ? 0 : 0.85 * (1 - leaderDominance);
  return {
    base, depth, radius, middle, axis,
    reach(p) {
      const [ax, az] = axis(p[1]), x = p[0] - ax, z = p[2] - az, flat = Math.hypot(x, z) || 1;
      // The lower edge rises and falls around the trunk.
      const edge = irregularity * 0.3 * depth * Math.max(0, noise3(x / flat * 1.2, 5.5, z / flat * 1.2, noiseSeed + 3) + 0.15);
      const r = profile(p[1], edge);
      if (r <= 0) return 2;
      const out = unit([x / radius, (p[1] - middle[1]) / (0.55 * depth), z / radius]);
      const uneven = 1 + irregularity * 0.6 * noise3(out[0] * 1.9 + 11, out[1] * 1.9, out[2] * 1.9, noiseSeed);
      return flat / (r * uneven * lobes(out));
    },
    open: (p, reach) => reach < bare * (1 - (p[1] - base) / (0.45 * depth))
      || noise3(p[0] / clump, p[1] / clump * 1.25, p[2] / clump, noiseSeed + 7) < air,
  };
}
