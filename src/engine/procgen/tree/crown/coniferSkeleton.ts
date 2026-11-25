// Spruces and firs: whorls on a straight leader, branches hanging low in the
// crown and rising near the top, lengths under a cone, short shoots on the
// trunk between the whorls.

import { createStream } from "../../random.ts";
import { cross, unit, type Vec3 } from "../../vector.ts";
import { addScaled, createStemSampler } from "../stems.ts";
import type { CrownParams } from "./crownParams.ts";
import { flareOf, MAX_STEMS, referenceArea, stemOf, type CrownSkeletonResult, type CrownStem, type SpraySite } from "./crownSkeleton.ts";

const TAU = Math.PI * 2;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A spray with little room to grow goes before one that can stand in for its neighbours: `room` times its length. */
const keepOf = (room: number): number => clamp((room - 1) / 1.2, 0.15, 1);

export function coniferSkeleton(params: CrownParams): CrownSkeletonResult {
  const { seed, height: H, irregularity, fullness } = params;
  const random = createStream(seed, "crown/conifer"), phase = random.range(0, TAU);
  const points: Vec3[] = [], radii: number[] = [], rings = 32, sway = irregularity * 0.006 * H;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    points.push([Math.sin(phase + t * 4) * sway * t, H * t, Math.cos(phase + t * 3) * sway * t]);
    radii.push(Math.max(0.008, params.trunkRadius * mix(1 - t, 1, params.taper * 0.1) ** 0.9 * flareOf(params, H * t)));
  }
  const stems: CrownStem[] = [stemOf(points, radii, "0", 0, -1, 0, 0)], sites: SpraySite[] = [];
  const trunk = createStemSampler(stems[0]!);
  const start = Math.max(0.03, params.crownStart), width = H * params.width * 0.5;
  const gap = mix(0.5, 0.3, fullness) * clamp(H / 14, 0.45, 1.5) / H;
  let turn = random.range(0, TAU), n = 0;
  for (let y = start; y < 0.985;) {
    const t = (y - start) / (1 - start), count = Math.max(5, Math.round(mix(7, 9, fullness) - 3 * t));
    for (let k = 0; k < count; k++) {
      if (stems.length >= MAX_STEMS) return { error: `Stem cap of ${MAX_STEMS} exceeded` };
      const id = `0/${n}`, branch = createStream(seed, `crown/${id}`);
      const at = clamp(y + branch.range(-0.4, 0.4) * gap, start, 0.985), { point, radius } = trunk(at);
      const around = turn + (k / count) * TAU + branch.range(-0.35, 0.35) * (0.4 + 0.6 * irregularity);
      const length = Math.max(0.012 * H, width * (1 - t) ** 0.92 * (t < 0.1 ? 0.82 + 1.8 * t : 1) * (1 + branch.range(-0.3, 0.2) * irregularity));
      const rise = -0.2 + 1.0 * t * t + branch.range(-0.14, 0.14);
      const path: Vec3[] = [point], thickness = [Math.max(0.005, Math.min(radius * 0.5, 0.008 + length * 0.011))], steps = 7;
      for (let s = 1; s <= steps; s++) {
        const u = s / steps, lift = rise - (0.2 + params.spray.droop) * Math.sin(u * Math.PI * 0.9) * (1 - t) + 0.42 * u * u;
        const p = addScaled(path[s - 1]!, [Math.cos(around) * Math.cos(lift), Math.sin(lift), Math.sin(around) * Math.cos(lift)], length / steps);
        path.push([p[0], Math.max(p[1], 0.02 * H), p[2]]);
        thickness.push(thickness[0]! * (1 - 0.85 * u));
      }
      const index = stems.length;
      stems.push(stemOf(path, thickness, id, 1, 0, at, index));
      const sample = createStemSampler(stems[index]!);
      const pairs = Math.max(3, Math.round(length / 0.22));
      for (let j = 0; j < pairs; j++) for (const side of [-1, 1]) {
        const u = clamp((j + 0.05 + (side > 0 ? 0.4 : 0)) / pairs, 0.01, 0.96), q = branch.fork(`site/${j}/${side}`);
        const { point: p, tangent } = sample(u), right = unit(cross(tangent, [0, 1, 0])), open = 1 - 0.3 * u + q.range(-0.16, 0.16);
        let dir = addScaled(addScaled([0, 0, 0], tangent, Math.cos(open)), right, Math.sin(open) * side);
        dir = unit(addScaled(dir, [0, 1, 0], q.range(-0.6, 0.05)));
        // Branchlets hang: a card seen from its branch's end is not edge-on.
        const roll = q.range(-0.2, 1.3);
        const size = Math.min(1.2, (0.16 + 0.46 * length * (1 - 0.6 * u)) / params.spray.length) * q.range(0.85, 1.15);
        sites.push({ id: `${id}/${j}/${side}`, stem: index, t: u, base: p, dir, up: unit(addScaled([0, Math.cos(roll), 0], right, side * Math.sin(roll))), scale: size, reach: 0.75 * length + 0.2 + 0.3 * t, keep: keepOf((0.75 * length + 0.2) / (size * params.spray.length)) });
      }
      const tip = sample(0.7);
      sites.push({ id: `${id}/tip`, stem: index, t: 0.7, base: tip.point, dir: tip.tangent, up: [0, 1, 0], scale: clamp(0.42 * length / params.spray.length, 0.25, 1.1), reach: 0.6 * length + 0.2 + 0.2 * t, keep: keepOf(1.4) });
      n++;
    }
    const rise = gap * mix(1, 0.55, t) * random.range(0.8, 1.2);
    // Short shoots on the trunk up to the next whorl: it shows through, not bare.
    for (let k = 0; k < 9; k++) {
      const id = `0/i${n}/${k}`, q = createStream(seed, `crown/${id}`), at = clamp(y + rise * (k + q.next()) / 9, start, 0.97), { point, radius } = trunk(at);
      const around = turn + k * 2.4 + q.range(-0.3, 0.3), out: Vec3 = [Math.cos(around), 0, Math.sin(around)];
      sites.push({ id, stem: 0, t: at, base: addScaled(point, out, radius * 0.7), dir: unit(addScaled(out, [0, 1, 0], q.range(-0.35, 0.35))), up: [0, 1, 0], scale: clamp((0.3 + 0.12 * width * (1 - t)) / params.spray.length, 0.3, 0.9) * q.range(0.8, 1.1), reach: 0.8 });
    }
    turn += 2.4;
    y += rise;
  }
  // The leader's own needles, around its last metres.
  for (let k = 0; k < 8; k++) {
    const { point } = trunk(0.9 + 0.01 * k), around = k * 2.4 + phase, open = 1.5 - 0.17 * k;
    sites.push({ id: `0/top${k}`, stem: 0, t: 0.94, base: point, dir: unit([Math.cos(around) * open, 1, Math.sin(around) * open]), up: [Math.cos(around), 0, Math.sin(around)], scale: clamp(0.032 * H / params.spray.length, 0.2, 1), reach: 0.05 * H, keep: 0.1 });
  }
  const depth = H * (1 - start);
  return { stems, sites, center: [0, H * mix(start, 1, 0.38), 0], radius: [width, depth * 0.62, width], referenceArea: referenceArea(width, depth) * 0.75, height: H };
}
