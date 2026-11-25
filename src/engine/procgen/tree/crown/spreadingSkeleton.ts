// Broadleaf trees, open-crowned pines and shrubs: space colonisation (Runions
// et al. 2007). Attraction points fill the crown's envelope
// (crownEnvelope.ts), nodes step toward them from the trunk (a shrub's main
// stems), a pipe model gives the radii, and each stem follows its thickest
// child. The crown is filled because the wood grows into its volume. `droop`
// hangs the thin wood.

import { createStream } from "../../random.ts";
import { cross, sub, unit, type Vec3 } from "../../vector.ts";
import { addScaled, perpendicular } from "../stems.ts";
import { crownEnvelope, type CrownEnvelope } from "./crownEnvelope.ts";
import type { CrownParams } from "./crownParams.ts";
import { flareOf, MAX_STEMS, referenceArea, stemOf, type CrownSkeletonResult, type CrownStem, type SpraySite } from "./crownSkeleton.ts";

const TAU = Math.PI * 2;

/** `main`: the trunk's, or a shrub's main stems'. */
interface Node { p: Vec3; d: Vec3; parent: number; kids: number[]; main: boolean }

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function extend(nodes: Node[], parent: number, p: Vec3, d: Vec3, main: boolean): number {
  nodes.push({ p, d, parent, kids: [], main });
  if (parent >= 0) nodes[parent]!.kids.push(nodes.length - 1);
  return nodes.length - 1;
}

/** The trunk, up to its leader's end. */
function trunk(params: CrownParams, crown: CrownEnvelope, step: number): Node[] {
  const { seed, height: H, irregularity, leaderDominance } = params, nodes: Node[] = [];
  const shape = createStream(seed, "crown/trunk"), top = crown.base + crown.depth * mix(0.22, 0.88, leaderDominance);
  const swayAt = shape.range(0, TAU), sway = irregularity * 0.02 * H * (1.15 - leaderDominance), steps = Math.max(4, Math.round(top / step));
  for (let i = 0; i <= steps; i++) {
    const y = top * i / steps, t = y / H, [ax, az] = crown.axis(y);
    const p: Vec3 = [ax + Math.sin(swayAt + t * 6) * sway * t, y, az + Math.cos(swayAt * 1.7 + t * 5) * sway * t];
    extend(nodes, i - 1, p, i ? unit(sub(p, nodes[i - 1]!.p)) : [0, 1, 0], true);
  }
  return nodes;
}

/** A shrub's main stems, spreading out of one root crown. */
function shrubStems(params: CrownParams, crown: CrownEnvelope, step: number): Node[] {
  const { seed, height: H, irregularity, shrub } = params, nodes: Node[] = [], turn = createStream(seed, "shrub/crown").range(0, TAU);
  for (let k = 0; k < shrub.stemCount; k++) {
    const random = createStream(seed, `shrub/${k}`), around = turn + TAU * (k + random.range(-0.3, 0.3) * irregularity) / shrub.stemCount;
    const rise = (crown.base + crown.depth * 0.55) * random.range(0.8, 1.1), out = Math.min(shrub.spread * H * 0.5, crown.radius * 0.75) * random.range(0.6, 1.1);
    const curve = random.range(-0.5, 0.5) * irregularity, foot = Math.min(0.06 * H, params.trunkRadius * 3), steps = Math.max(4, Math.round(Math.hypot(rise, out) / step));
    let last = -1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = around + curve * t, r = foot + out * t ** 1.4, p: Vec3 = [Math.cos(a) * r, rise * t, Math.sin(a) * r];
      last = extend(nodes, last, p, i ? unit(sub(p, nodes[last]!.p)) : [0, 1, 0], true);
    }
  }
  return nodes;
}

/** Grows `nodes` toward the attraction points. */
function colonise(params: CrownParams, crown: CrownEnvelope, nodes: Node[], step: number): void {
  const { seed, height: H, irregularity, fullness, leaderDominance } = params, { base, depth, radius } = crown;
  const spacing = step * mix(2.35, 1.9, fullness);
  const wanted = clamp(Math.round(0.6 * Math.PI * radius * radius * depth * 1.15 / spacing ** 3), params.habit === "shrub" ? 90 : 160, 2400);
  let points: { p: Vec3; node: number; distance: number }[] = [];
  const scatter = createStream(seed, "crown/points");
  for (let tries = 0; points.length < wanted && tries < wanted * 60; tries++) {
    const p: Vec3 = [scatter.range(-1.45, 1.45) * radius, scatter.range(base, H), scatter.range(-1.45, 1.45) * radius];
    const roll = scatter.next(), q = crown.reach(p);
    if (q >= 1 || roll > 0.28 + 0.72 * q || crown.open(p, q)) continue;
    points.push({ p, node: -1, distance: Infinity });
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
  const tropism = mix(0.1, 0.5, leaderDominance ** 2) + 0.7 * Math.max(0, -params.droop), kill = (spacing * 0.92) ** 2, wander = createStream(seed, "crown/wander");
  for (let round = 0; round < 140 && points.length > 0; round++) {
    const pull = new Map<number, Vec3>();
    for (const { p, node } of points) {
      if (node < 0) continue;
      pull.set(node, addScaled(pull.get(node) ?? [0, 0, 0], unit(sub(p, nodes[node]!.p)), 1));
    }
    const first = nodes.length;
    for (const [index, sum] of [...pull].sort((a, b) => a[0] - b[0])) {
      const node = nodes[index]!;
      if (node.kids.length >= (node.main ? 6 : 3)) continue;
      let d = addScaled(addScaled(unit(sum), node.d, node.main ? 0.1 : 0.5), [0, 1, 0], tropism);
      d = unit(addScaled(unit(d), wander.unitVector(), 0.04 + 0.14 * irregularity));
      const p = addScaled(node.p, d, step);
      if (node.kids.some((kid) => Math.hypot(...sub(nodes[kid]!.p, p)) < step * 0.4)) continue;
      extend(nodes, index, p, d, false);
    }
    if (nodes.length === first) break;
    near(first);
    points = points.filter((point) => point.distance > kill);
  }
}

/** Thin wood bends down (or up) along itself; what grows on it goes with it. */
function hang(nodes: Node[], droop: number, thinness: (index: number) => number): void {
  if (droop === 0) return;
  const bend = new Float64Array(nodes.length), moved = nodes.map((node) => node.p);
  nodes.forEach((node, i) => {
    if (node.parent < 0 || node.main) return;
    const along = sub(node.p, nodes[node.parent]!.p), length = Math.hypot(...along);
    bend[i] = bend[node.parent]! + thinness(i) * 0.16;
    const p = addScaled(moved[node.parent]!, unit(addScaled(unit(along), [0, -1, 0], droop * Math.min(2.2, bend[i]!))), length);
    moved[i] = [p[0], Math.max(p[1], 0.15 * nodes[node.parent]!.p[1]), p[2]];
  });
  nodes.forEach((node, i) => { node.p = moved[i]!; });
}

export function spreadingSkeleton(params: CrownParams): CrownSkeletonResult {
  const { seed, height: H } = params, shrub = params.habit === "shrub", crown = crownEnvelope(params);
  const step = shrub ? clamp(0.06 * H, 0.04, 0.3) : clamp(Math.min(0.027 * H, 0.085 * crown.radius), 0.09, 0.6);
  const nodes = shrub ? shrubStems(params, crown, step) : trunk(params, crown, step);
  colonise(params, crown, nodes, step);

  // Pipe model, remapped so the base is the recipe's trunk and a tip is a twig.
  const E = 2.35, tip = clamp(0.0007 * H, shrub ? 0.0025 : 0.004, 0.012), flow = new Float64Array(nodes.length);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const kids = nodes[i]!.kids;
    flow[i] = kids.length ? kids.reduce((sum, kid) => sum + flow[kid]!, 0) : 1;
  }
  const roots = nodes.flatMap((node, i) => (node.parent < 0 ? [i] : []));
  const root = Math.max(...roots.map((i) => flow[i]!)) ** (1 / E), exponent = root > 1 ? Math.log(params.trunkRadius / tip) / Math.log(root) : 1;
  const pipe = (i: number): number => Math.min(params.trunkRadius, tip * (flow[i]! ** (1 / E)) ** exponent);
  hang(nodes, params.droop, (i) => clamp(1 - pipe(i) / (0.22 * params.trunkRadius), 0, 1));

  const stems: CrownStem[] = [], sites: SpraySite[] = [], thin = Math.max(tip * 2.2, 0.17 * params.trunkRadius);
  const queue: { start: number; from: number; parent: number; level: number; limb: number; attach: number }[] =
    roots.map((start) => ({ start, from: -1, parent: -1, level: 0, limb: 0, attach: 0 }));
  for (let at = 0; at < queue.length; at++) {
    if (stems.length >= MAX_STEMS) return { error: `Stem cap of ${MAX_STEMS} exceeded` };
    const { start, from, parent, level, limb, attach } = queue[at]!;
    const index = stems.length, mine = level === 0 || limb < 0 ? index : limb, path: Vec3[] = [], radii: number[] = [];
    // A branch starts where its parent's smoothed line passes.
    if (from >= 0) { path.push(stems[parent]!.points[attach]!); radii.push(Math.min(pipe(from), pipe(start) * 1.3)); }
    for (let current = start; ;) {
      path.push(nodes[current]!.p);
      radii.push(pipe(current));
      const kids = [...nodes[current]!.kids].sort((a, b) => flow[b]! - flow[a]! || a - b);
      if (kids.length === 0) break;
      for (const kid of kids.slice(1)) queue.push({ start: kid, from: current, parent: index, level: level + 1, limb: level === 0 && !shrub ? -1 : mine, attach: path.length - 1 });
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
      if (radii[i]! > thin || p[1] < crown.base * 0.6) continue;
      const q = createStream(seed, `site/${id}/${i}`), tangent = unit(sub(p, path[i - 1]!)), last = i === path.length - 1;
      const side = perpendicular(tangent), other = cross(tangent, side), turn = i * 2.4 + q.range(-0.5, 0.5);
      for (let k = 0; k < (last ? 3 : 1); k++) {
        const open = last ? (k === 0 ? 0.12 : 0.75) : 0.95 + q.range(-0.2, 0.2), around = turn + k * 2.1;
        let dir = addScaled(addScaled(addScaled([0, 0, 0], tangent, Math.cos(open)), side, Math.sin(open) * Math.cos(around)), other, Math.sin(open) * Math.sin(around));
        dir = unit(addScaled(dir, [0, 1, 0], q.range(-0.2, 0.12) - 0.3 * params.droop));
        sites.push({ id: `${id}/${i}/${k}`, stem: index, t: i / (path.length - 1), base: p, dir, up: unit(addScaled(q.unitVector(), [0, 1, 0], 1.15)), scale: last ? 1.08 : 1 });
      }
    }
  }
  return { stems, sites, center: crown.middle, radius: [crown.radius, crown.depth / 2, crown.radius], referenceArea: referenceArea(crown.radius, crown.depth), height: H };
}
