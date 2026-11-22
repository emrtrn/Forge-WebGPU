import { createStream } from "../random.ts";
import { cross, dot, sub, unit } from "../vector.ts";
import type { Vec3 } from "../vector.ts";
import type { TreeLevelParams, TreeParams } from "./treeParams.ts";

export interface TreeStem {
  /** Root identifiers are followed by slash-separated child indices. */
  id: string;
  level: number;
  parent: number;
  /** Attachment at a fraction of the parent's arc length. */
  attach: number;
  points: Vec3[];
  radii: number[];
  length: number;
}

const UP: Vec3 = [0, 1, 0];
const GOLDEN_ANGLE = 137.5 * Math.PI / 180;
const MAX_STEMS = 4000;

export function addScaled(point: Vec3, direction: Vec3, distance: number): Vec3 {
  return [
    point[0] + direction[0] * distance,
    point[1] + direction[1] * distance,
    point[2] + direction[2] * distance,
  ];
}

export function perpendicular(direction: Vec3): Vec3 {
  return unit(cross(direction, Math.abs(direction[1]) < 0.9 ? UP : [0, 0, 1]));
}

function arcLengths(points: Vec3[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1]! + Math.hypot(...sub(points[i]!, points[i - 1]!)));
  }
  return lengths;
}

interface StemSample { point: Vec3; tangent: Vec3; radius: number }

/** Arc-length sampling with interpolated tangents for smooth ring frames. */
export function createStemSampler(stem: TreeStem): (t: number) => StemSample {
  const distances = arcLengths(stem.points);
  const directions = stem.points.slice(1).map((point, i) => unit(sub(point, stem.points[i]!)));
  const tangents = stem.points.map((_, i) => {
    const before = directions[Math.max(0, i - 1)]!;
    const after = directions[Math.min(i, directions.length - 1)]!;
    return unit(addScaled(before, after, 1));
  });
  return t => {
    const distance = t * distances[distances.length - 1]!;
    let lower = 0, upper = distances.length - 1;
    while (upper - lower > 1) {
      const middle = (lower + upper) >>> 1;
      if (distances[middle]! <= distance) lower = middle;
      else upper = middle;
    }
    const f = (distance - distances[lower]!) / (distances[upper]! - distances[lower]!);
    const point = stem.points[lower]!, tangent = tangents[lower]!;
    const radius = stem.radii[lower]!;
    return {
      point: addScaled(point, sub(stem.points[upper]!, point), f),
      tangent: unit(addScaled(tangent, sub(tangents[upper]!, tangent), f)),
      radius: radius + (stem.radii[upper]! - radius) * f,
    };
  };
}

function trunk(params: TreeParams, density: number): TreeStem {
  const random = createStream(params.seed, "stem/0");
  const lean = params.habit === "broadleaf" ? 0.035 * params.height * params.irregularity : 0;
  const drift = random.fork("lean").range(0, 2 * Math.PI);
  const steps = Math.max(3, Math.ceil(params.height * density));
  const times = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  if (!times.includes(0.04)) times.splice(Math.ceil(steps * 0.04), 0, 0.04);
  const points: Vec3[] = times.map(t => [
    lean * Math.cos(drift) * t ** 2, params.height * t, lean * Math.sin(drift) * t ** 2,
  ]);
  const radii = times.map(t => {
    const taper = 1 - (1 - params.taper) * t;
    const flare = 1 + params.flare * Math.max(0, 1 - t / 0.04) ** 2;
    return params.trunkRadius * taper * flare;
  });
  return { id: "0", level: 0, parent: -1, attach: 0, points, radii, length: arcLengths(points).at(-1)! };
}

/** Start a forest of stems in one root crown. Each root has its own arc and RNG. */
function shrubRoots(params: TreeParams, density: number, { stemCount, spread }: NonNullable<TreeParams["shrub"]>): TreeStem[] {
  const rotation = createStream(params.seed, "shrub/crown").range(0, 2 * Math.PI);
  return Array.from({ length: stemCount }, (_, index) => {
    const id = "shrub/" + index;
    const random = createStream(params.seed, id);
    const azimuth = rotation + (2 * Math.PI / stemCount) * (index + random.range(-0.25, 0.25) * params.irregularity);
    const height = params.height * (0.72 + random.range(0, 0.28) * params.irregularity);
    const reach = spread * params.height * random.range(0.73, 1.13);
    const base = Math.min(spread * params.height * random.range(0.12, 0.19), params.trunkRadius * 4);
    const radius = params.trunkRadius * random.range(0.76, 1.13);
    const curve = random.range(-0.48, 0.48) * params.irregularity;
    const steps = Math.max(8, Math.ceil(Math.hypot(height, reach) * density));
    const points: Vec3[] = [], radii: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, angle = azimuth + curve * t;
      const distance = base + reach * (0.28 * t + 0.72 * t ** 1.55);
      points.push([distance * Math.cos(angle), -radius + (height + radius) * t, distance * Math.sin(angle)]);
      radii.push(radius * (1 - (1 - params.taper) * t) * (1 + params.flare * Math.max(0, 1 - t / 0.10) ** 2));
    }
    return { id, parent: -1, level: 0, attach: 0, points, radii, length: arcLengths(points).at(-1)! };
  });
}

function growBranch(
  params: TreeParams, parent: TreeStem, parentIndex: number, sample: (t: number) => StemSample,
  profile: TreeLevelParams, index: number, density: number,
): TreeStem {
  const id = `${parent.id}/${index}`;
  const random = createStream(params.seed, "stem/" + id);
  const onTrunk = parent.level === 0;
  const whorled = onTrunk && params.habit === "conifer";
  const groups = whorled ? Math.ceil(profile.count / 4) : profile.count;
  const group = whorled ? Math.floor(index / 4) : index;
  const start = onTrunk ? Math.max(params.crownStart, profile.start) : profile.start;
  const attach = start + (1 - start) * (group + 0.5) / groups;
  const { point, tangent, radius } = sample(attach);
  const crownT = params.crownStart === 1 ? 1 : (attach - params.crownStart) / (1 - params.crownStart);
  const crownFactor = params.habit === "broadleaf"
    ? 0.15 + 0.85 * Math.sqrt(Math.max(0, 1 - (2 * crownT - 1) ** 2))
    : 1 - 0.9 * crownT;
  const length = parent.length * profile.lengthRatio * (onTrunk ? crownFactor : 1)
    * (1 + random.fork("length").range(-0.23, 0.23) * params.irregularity);

  const azimuth = index * GOLDEN_ANGLE + random.fork("azimuth").range(-0.4, 0.4) * params.irregularity;
  const normal = perpendicular(tangent);
  const radial = addScaled(addScaled([0, 0, 0], normal, Math.cos(azimuth)),
    cross(tangent, normal), Math.sin(azimuth));
  const angle = (profile.angle + random.fork("angle").range(-profile.angleVariation, profile.angleVariation)
    * params.irregularity) * Math.PI / 180;
  const direction = unit(addScaled(addScaled([0, 0, 0], tangent, Math.cos(angle)), radial, Math.sin(angle)));
  const up = addScaled(UP, direction, -dot(UP, direction));
  const wobble = random.fork("wobble");
  const wobbleAxis = perpendicular(direction);
  const otherAxis = cross(direction, wobbleAxis);
  const waveX = wobble.range(0.65, 1.5) * 2 * Math.PI;
  const waveY = wobble.range(0.65, 1.5) * 2 * Math.PI;
  // Curvature varies over the whole stem, even when the mesh needs more rings.
  const steps = Math.min(128, Math.max(3, Math.ceil(length * density)));
  const points = [point], radii = [radius * profile.radiusRatio];
  for (let i = 1; i <= steps; i++) {
    const t = (i - 0.5) / steps;
    let heading = addScaled(direction, up, profile.bend * t * 1.4);
    heading = addScaled(heading, wobbleAxis, Math.sin(waveX * t) * profile.wobble * t * 0.45);
    heading = addScaled(heading, otherAxis, Math.sin(waveY * t) * profile.wobble * t * 0.45);
    points.push(addScaled(points[i - 1]!, unit(heading), length / steps));
    radii.push(radii[0]! * (1 - 0.8 * i / steps));
  }
  return { id, level: parent.level + 1, parent: parentIndex, attach, points, radii, length };
}

export function buildTreeSkeleton(params: TreeParams): { stems: TreeStem[] } | { error: string } {
  let total = params.shrub?.stemCount ?? 1, count = total;
  for (const [level, profile] of params.levels.entries()) {
    count *= profile.count;
    total += count;
    if (total > MAX_STEMS) return { error: `Stem cap of ${MAX_STEMS} exceeded at level ${level + 1} (${total} stems)` };
  }

  const density = Math.max(4, ...params.lods.map(lod => lod.ringsPerMeter));
  const stems = params.shrub ? shrubRoots(params, density, params.shrub) : [trunk(params, density)];
  for (let parentIndex = 0; parentIndex < stems.length; parentIndex++) {
    const parent = stems[parentIndex]!, profile = params.levels[parent.level];
    if (!profile?.count) continue;
    const sample = createStemSampler(parent);
    for (let index = 0; index < profile.count; index++) {
      stems.push(growBranch(params, parent, parentIndex, sample, profile, index, density));
    }
  }
  return { stems };
}
