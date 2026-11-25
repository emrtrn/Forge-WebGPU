// The wood of a generator version 6 tree (vegetation plan PG5b, §9.8) and
// where its sprays may sit.
//
// Broadleaf: space colonisation (Runions et al. 2007). Attraction points fill
// the crown's envelope (height, width, widest point, crown start; noise opens
// gaps as fullness drops), nodes step toward them from the trunk, a pipe
// model gives the radii, and each stem follows its thickest child. The crown
// is filled because the wood grows into its volume.
//
// Conifer: whorls on a straight leader, branches hanging low in the crown and
// rising near the top, lengths under a cone.
//
// Every random draw comes from a stream of the seed (and of the part's id
// where one part must not move another).

import { noise3 } from "../../noise.ts";
import { createStream, streamSeed } from "../../random.ts";
import { cross, dot, sub, unit, type Vec3 } from "../../vector.ts";
import { addScaled, createStemSampler, perpendicular, type TreeStem } from "../treeSkeleton.ts";
import type { CrownParams } from "./crownParams.ts";

const TAU = Math.PI * 2;
const MAX_STEMS = 4000;

export interface CrownStem extends TreeStem {
  /** The stem off the trunk this one belongs to (its own index for one, 0 the trunk): the wind's phase. */
  limb: number;
}

/** A place on thin wood a spray may grow from. */
export interface SpraySite {
  id: string;
  stem: number;
  /** Arc fraction on the stem. */
  t: number;
  base: Vec3;
  dir: Vec3;
  /** The leaf side's direction, not yet perpendicular to `dir`. */
  up: Vec3;
  /** Multiplies the recipe's spray length. */
  scale: number;
  /** A coarse LOD's card stays shorter than this, metres. */
  reach?: number;
}

export interface CrownSkeleton {
  stems: CrownStem[];
  sites: SpraySite[];
  /** The crown's box: its centre, and its half extents. */
  center: Vec3;
  radius: Vec3;
  /** What the leaf area index is taken over, m². */
  referenceArea: number;
  height: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function stemOf(points: Vec3[], radii: number[], id: string, level: number, parent: number, attach: number, limb: number): CrownStem {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(...sub(points[i]!, points[i - 1]!));
  return { id, level, parent, attach, points, radii, length, limb };
}

/** Half the crown's silhouette, its projection, whichever is larger: a tall narrow crown carries leaves by its side. */
const referenceArea = (radius: number, depth: number): number => Math.max(Math.PI * radius * radius, 0.5 * (Math.PI / 4) * 2 * radius * depth);

const flareOf = (params: CrownParams, y: number): number => 1 + params.flare * Math.max(0, 1 - y / (0.06 * params.height)) ** 2;

// ---------------------------------------------------------------- broadleaf

interface Node { p: Vec3; d: Vec3; parent: number; kids: number[] }

function broadleaf(params: CrownParams): CrownSkeleton | { error: string } {
  const { seed, height: H, irregularity, fullness, leaderDominance } = params;
  const base = H * params.crownStart, depth = H - base;
  const shape = createStream(seed, "crown/shape");
  const radius = H * params.width * 0.5 * (1 + shape.range(-0.08, 0.08) * irregularity);
  const widest = params.widestPoint;
  const noiseSeed = streamSeed(seed, "crown/noise");
  const leanAt = shape.range(0, TAU), lean = irregularity * 0.045 * H;
  const axis = (y: number): [number, number] => {
    const t = clamp(y / H, 0, 1);
    return [Math.cos(leanAt) * lean * t * t, Math.sin(leanAt) * lean * t * t];
  };
  /** The envelope's radius at height y, without the lobes. */
  const profile = (y: number): number => {
    const t = (y - base) / depth;
    if (t <= 0 || t >= 1) return 0;
    const d = t < widest ? (widest - t) / widest : (t - widest) / (1 - widest);
    return radius * (t < widest ? 0.25 + 0.75 * Math.sqrt(1 - d * d) : Math.sqrt(1 - d * d));
  };
  const middle: Vec3 = [0, base + depth * widest, 0];
  /** 0 at the axis, 1 on the envelope. */
  const reach = (p: Vec3): number => {
    const r = profile(p[1]);
    if (r <= 0) return 2;
    const [ax, az] = axis(p[1]);
    const out = unit([p[0] - ax, (p[1] - middle[1]) * 0.8, p[2] - az]);
    const lobe = 1 + irregularity * 0.95 * noise3(out[0] * 1.6 + 11, out[1] * 1.6, out[2] * 1.6, noiseSeed);
    return Math.hypot(p[0] - ax, p[2] - az) / (r * lobe);
  };

  const step = clamp(0.027 * H, 0.09, 0.6);
  const spacing = step * mix(2.35, 1.9, fullness);
  const clump = 0.17 * Math.min(H, radius * 3);
  const wanted = clamp(Math.round(0.6 * Math.PI * radius * radius * depth * 1.15 / spacing ** 3), 160, 2400);
  let points: { p: Vec3; node: number; distance: number }[] = [];
  const scatter = createStream(seed, "crown/points");
  for (let tries = 0; points.length < wanted && tries < wanted * 60; tries++) {
    const p: Vec3 = [scatter.range(-1.45, 1.45) * radius, scatter.range(base, H), scatter.range(-1.45, 1.45) * radius];
    const roll = scatter.next(), q = reach(p);
    if (q >= 1 || roll > 0.28 + 0.72 * q) continue;
    if (noise3(p[0] / clump, p[1] / clump, p[2] / clump, noiseSeed + 7) < mix(0.16, -0.3, fullness)) continue;
    points.push({ p, node: -1, distance: Infinity });
  }

  // The trunk, up to its leader's end; the crown grows from its upper part.
  const top = base + depth * mix(0.22, 0.88, leaderDominance);
  const swayAt = shape.range(0, TAU), sway = irregularity * 0.02 * H * (1.15 - leaderDominance);
  const nodes: Node[] = [];
  const trunkSteps = Math.max(4, Math.round(top / step));
  for (let i = 0; i <= trunkSteps; i++) {
    const y = top * i / trunkSteps, t = y / H, [ax, az] = axis(y);
    const p: Vec3 = [ax + Math.sin(swayAt + t * 6) * sway * t, y, az + Math.cos(swayAt * 1.7 + t * 5) * sway * t];
    nodes.push({ p, d: i ? unit(sub(p, nodes[i - 1]!.p)) : [0, 1, 0], parent: i - 1, kids: [] });
    if (i) nodes[i - 1]!.kids.push(i);
  }
  const lowest = base * 0.82;
  const near = (first: number): void => {
    for (const point of points) for (let i = first; i < nodes.length; i++) {
      const n = nodes[i]!.p;
      if (n[1] < lowest) continue;
      const dx = point.p[0] - n[0], dy = point.p[1] - n[1], dz = point.p[2] - n[2], d = dx * dx + dy * dy + dz * dz;
      if (d < point.distance) { point.distance = d; point.node = i; }
    }
  };
  near(0);
  const tropism = mix(0.1, 0.5, leaderDominance ** 2), kill = (spacing * 0.92) ** 2, wander = createStream(seed, "crown/wander");
  for (let round = 0; round < 140 && points.length > 0; round++) {
    const pull = new Map<number, Vec3>();
    for (const { p, node } of points) {
      if (node < 0) continue;
      pull.set(node, addScaled(pull.get(node) ?? [0, 0, 0], unit(sub(p, nodes[node]!.p)), 1));
    }
    const first = nodes.length;
    for (const [index, sum] of [...pull].sort((a, b) => a[0] - b[0])) {
      const node = nodes[index]!;
      if (node.kids.length >= (index <= trunkSteps ? 6 : 3)) continue;
      let d = addScaled(addScaled(unit(sum), node.d, index <= trunkSteps ? 0.1 : 0.5), [0, 1, 0], tropism);
      d = unit(addScaled(unit(d), wander.unitVector(), 0.04 + 0.14 * irregularity));
      const p = addScaled(node.p, d, step);
      if (node.kids.some((kid) => Math.hypot(...sub(nodes[kid]!.p, p)) < step * 0.4)) continue;
      nodes.push({ p, d, parent: index, kids: [] });
      node.kids.push(nodes.length - 1);
    }
    if (nodes.length === first) break;
    near(first);
    points = points.filter((point) => point.distance > kill);
  }

  // Pipe model, remapped so the base is the recipe's trunk and a tip is a twig.
  const E = 2.35, tip = clamp(0.0007 * H, 0.004, 0.012), flow = new Float64Array(nodes.length);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const kids = nodes[i]!.kids;
    flow[i] = kids.length ? kids.reduce((sum, kid) => sum + flow[kid]!, 0) : 1;
  }
  const root = flow[0]! ** (1 / E), exponent = root > 1 ? Math.log(params.trunkRadius / tip) / Math.log(root) : 1;
  const pipe = (i: number): number => Math.min(params.trunkRadius, tip * (flow[i]! ** (1 / E)) ** exponent);

  const stems: CrownStem[] = [], sites: SpraySite[] = [], thin = Math.max(tip * 2.2, 0.17 * params.trunkRadius);
  const queue: { start: number; from: number; parent: number; level: number; limb: number; attach: number }[] = [{ start: 0, from: -1, parent: -1, level: 0, limb: 0, attach: 0 }];
  for (let at = 0; at < queue.length; at++) {
    if (stems.length >= MAX_STEMS) return { error: `Stem cap of ${MAX_STEMS} exceeded` };
    const { start, from, parent, level, limb, attach } = queue[at]!;
    const index = stems.length, mine = level === 0 ? 0 : limb < 0 ? index : limb, path: Vec3[] = [], radii: number[] = [];
    // A branch starts where its parent's smoothed line passes.
    if (from >= 0) { path.push(stems[parent]!.points[attach]!); radii.push(Math.min(pipe(from), pipe(start) * 1.3)); }
    for (let current = start; ;) {
      path.push(nodes[current]!.p);
      radii.push(pipe(current));
      const kids = [...nodes[current]!.kids].sort((a, b) => flow[b]! - flow[a]! || a - b);
      if (kids.length === 0) break;
      for (const kid of kids.slice(1)) queue.push({ start: kid, from: current, parent: index, level: level + 1, limb: level === 0 ? -1 : mine, attach: path.length - 1 });
      current = kids[0]!;
    }
    for (let pass = 0; pass < 2; pass++) for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1]!, b = path[i]!, c = path[i + 1]!;
      path[i] = [b[0] / 2 + (a[0] + c[0]) / 4, b[1] / 2 + (a[1] + c[1]) / 4, b[2] / 2 + (a[2] + c[2]) / 4];
    }
    for (let i = 1; i < radii.length; i++) radii[i] = Math.min(radii[i]!, radii[i - 1]!);
    if (level === 0) radii.forEach((r, i) => { radii[i] = r * flareOf(params, path[i]![1]); });
    const id = `n${start}`;
    stems.push(stemOf(path, radii, id, Math.min(3, level), parent, parent < 0 ? 0 : attach / (stems[parent]!.points.length - 1), mine));
    for (let i = 1; i < path.length; i++) {
      const p = path[i]!;
      if (radii[i]! > thin || p[1] < base * 0.9) continue;
      const q = createStream(seed, `site/${id}/${i}`), tangent = unit(sub(p, path[i - 1]!)), last = i === path.length - 1;
      const side = perpendicular(tangent), other = cross(tangent, side), turn = i * 2.4 + q.range(-0.5, 0.5);
      for (let k = 0; k < (last ? 3 : 1); k++) {
        const open = last ? (k === 0 ? 0.12 : 0.75) : 0.95 + q.range(-0.2, 0.2), around = turn + k * 2.1;
        let dir = addScaled(addScaled(addScaled([0, 0, 0], tangent, Math.cos(open)), side, Math.sin(open) * Math.cos(around)), other, Math.sin(open) * Math.sin(around));
        dir = unit(addScaled(dir, [0, 1, 0], q.range(-0.2, 0.12)));
        sites.push({ id: `${id}/${i}/${k}`, stem: index, t: i / (path.length - 1), base: p, dir, up: unit(addScaled(q.unitVector(), [0, 1, 0], 1.15)), scale: last ? 1.08 : 1 });
      }
    }
  }
  return { stems, sites, center: middle, radius: [radius, depth / 2, radius], referenceArea: referenceArea(radius, depth), height: H };
}

// ---------------------------------------------------------------- conifer

function conifer(params: CrownParams): CrownSkeleton | { error: string } {
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
        path.push(addScaled(path[s - 1]!, [Math.cos(around) * Math.cos(lift), Math.sin(lift), Math.sin(around) * Math.cos(lift)], length / steps));
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
        sites.push({ id: `${id}/${j}/${side}`, stem: index, t: u, base: p, dir, up: unit(addScaled([0, Math.cos(roll), 0], right, side * Math.sin(roll))), scale: size, reach: 0.75 * length + 0.2 });
      }
      const tip = sample(0.7);
      sites.push({ id: `${id}/tip`, stem: index, t: 0.7, base: tip.point, dir: tip.tangent, up: [0, 1, 0], scale: clamp(0.42 * length / params.spray.length, 0.25, 1.1), reach: 0.6 * length + 0.2 });
      n++;
    }
    turn += 2.4;
    y += gap * mix(1, 0.55, t) * random.range(0.8, 1.2);
  }
  // The leader's own needles, around its last metres.
  for (let k = 0; k < 8; k++) {
    const { point } = trunk(0.9 + 0.01 * k), around = k * 2.4 + phase, open = 1.5 - 0.17 * k;
    sites.push({ id: `0/top${k}`, stem: 0, t: 0.94, base: point, dir: unit([Math.cos(around) * open, 1, Math.sin(around) * open]), up: [Math.cos(around), 0, Math.sin(around)], scale: clamp(0.032 * H / params.spray.length, 0.2, 1), reach: 0.034 * H });
  }
  const depth = H * (1 - start);
  return { stems, sites, center: [0, H * mix(start, 1, 0.38), 0], radius: [width, depth * 0.62, width], referenceArea: referenceArea(width, depth) * 0.75, height: H };
}

export function buildCrownSkeleton(params: CrownParams): CrownSkeleton | { error: string } {
  return params.habit === "conifer" ? conifer(params) : broadleaf(params);
}

/** A unit vector with the component along `dir` removed. */
export function perpendicularPart(up: Vec3, dir: Vec3): Vec3 {
  const rest = addScaled(up, dir, -dot(up, dir));
  return Math.hypot(...rest) < 1e-4 ? perpendicular(dir) : unit(rest);
}
