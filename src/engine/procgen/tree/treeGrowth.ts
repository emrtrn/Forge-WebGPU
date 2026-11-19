import { createStream } from "../random.ts";
import { cross, dot, sub, unit, type Vec3 } from "../vector.ts";
import { normalizeTreeParams, type TreeParams } from "./treeParams.ts";
import { addScaled, buildTreeSkeleton, createStemSampler, perpendicular, type TreeStem } from "./treeSkeleton.ts";

/** Recipes marked 1–3 historically went through the PG3 baker. Preserve its output stamp as well as its geometry. */
export function treeOutputVersion(version: unknown): 3 | 4 {
  if (version === undefined || version === 1 || version === 2 || version === 3) return 3;
  if (version === 4) return 4;
  throw new Error(`Unsupported tree generator version ${String(version)}`);
}

const up: Vec3 = [0, 1, 0];
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Juvenile trees have thinner trunks, fewer lateral branches and smaller, lower crowns.
 * All controls are dimensionless except age (years), mature height and radius (metres). */
function growthSkeleton(params: TreeParams, input: Readonly<Record<string, unknown>>): ReturnType<typeof buildTreeSkeleton> {
  const field = (key: string, fallback: number, min: number, max: number) => {
    const value = input[key];
    return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  };
  const maturity = Math.min(1, field("age", 60, 1, 400) / field("matureAge", 60, 1, 400));
  const width = field("width", 0.8, 0.1, 1.6), widest = field("widestPoint", 0.5, 0.05, 0.95);
  const fullness = field("fullness", 0.78, 0, 1), dominance = field("leaderDominance", 0.55, 0, 1);
  params.height *= 0.12 + 0.88 * Math.sqrt(maturity);
  params.trunkRadius *= 0.06 + 0.94 * maturity ** 0.84;
  params.crownStart *= 0.45 + 0.55 * maturity;
  params.leaves.perStem = Math.round(params.leaves.perStem * fullness * (0.65 + 0.35 * maturity));
  const density = Math.max(4, ...params.lods.map(lod => lod.ringsPerMeter));
  const crownRadius = params.height * width * (0.32 + 0.18 * maturity);
  const trunkStream = createStream(params.seed, "growth/trunk");
  const phase = trunkStream.range(0, 2 * Math.PI);
  const bend = params.height * params.irregularity * (0.014 + 0.082 * (1 - dominance));
  const steps = Math.max(8, Math.ceil(params.height * density));
  const trunk: TreeStem = { id: "0", parent: -1, level: 0, attach: 0, length: 0, points: [], radii: [] };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point: Vec3 = [bend * t * (Math.sin(phase + 4 * t) + 0.6 * Math.cos(phase)), t * params.height,
      bend * t * (Math.cos(phase + 3 * t) + 0.6 * Math.sin(phase))];
    if (i) trunk.length += Math.hypot(...sub(point, trunk.points[i - 1]!));
    trunk.points.push(point);
    trunk.radii.push(params.trunkRadius * (1 - t * (1 - params.taper)) * (1 + params.flare * Math.max(0, 1 - t / 0.06) ** 2));
  }
  const stems = [trunk];
  for (const [parentIndex, parent] of stems.entries()) {
    const level = parent.level, rule = params.levels[level];
    if (!rule) continue;
    const group = createStream(params.seed, `growth/${parent.id}`);
    const vigor = level === 0 ? 1 : group.range(1 - 0.36 * params.irregularity, 1);
    const count = Math.round(rule.count * vigor * (0.35 + 0.65 * maturity ** (0.6 + 0.4 * level)) * (0.7 + 0.3 * fullness));
    if (stems.length + count > 4000) return { error: "Growth exceeds the 4000 stem budget." };
    const sample = createStemSampler(parent);
    const rotation = group.range(0, 2 * Math.PI);
    const first = level === 0 ? Math.max(params.crownStart, rule.start * (0.45 + 0.55 * maturity)) : rule.start;
    for (let i = 0; i < count; i++) {
      const id = `${parent.id}/${i}`, rng = createStream(params.seed, `growth/${id}`);
      const whorled = level === 0 && params.habit === "conifer";
      const slot = whorled ? Math.floor(i / 4) : i, slots = whorled ? Math.ceil(count / 4) : count;
      const t = (slot + 0.5 + rng.range(-0.39, 0.39) * params.irregularity) / slots;
      const attach = first + (1 - first) * t;
      const { point, tangent, radius } = sample(attach);
      const azimuth = rotation + (whorled ? i * Math.PI / 2 + slot * goldenAngle : i * goldenAngle) + rng.range(-0.6, 0.6) * params.irregularity;
      const normal = perpendicular(tangent);
      const radial = addScaled(normal.map(n => n * Math.cos(azimuth)) as Vec3, cross(tangent, normal), Math.sin(azimuth));
      const angle = clamp(rule.angle + rng.range(-rule.angleVariation, rule.angleVariation) * params.irregularity, 5, 120) * Math.PI / 180;
      let heading = unit(addScaled(tangent.map(n => n * Math.cos(angle)) as Vec3, radial, Math.sin(angle)));
      const distance = t < widest ? (widest - t) / widest : (t - widest) / (1 - widest);
      const envelope = 0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - distance ** 2));
      const spread = crownRadius * envelope * rule.lengthRatio / 0.5;
      const horizontalLimit = spread / Math.max(0.3, Math.sin(angle));
      const verticalLimit = params.height * (1.08 - attach) / Math.max(0.2, Math.cos(angle));
      const targetLength = level === 0 ? Math.min(horizontalLimit, verticalLimit) : parent.length * rule.lengthRatio;
      const length = targetLength * rng.range(1 - 0.24 * params.irregularity, 1 + 0.16 * params.irregularity);
      const base = radius * rule.radiusRatio * (1 + (1 - dominance) * (1 - t) * 0.35);
      const stem: TreeStem = { id, parent: parentIndex, level: level + 1, attach, length, points: [point], radii: [base * 1.22] };
      const spans = Math.min(128, Math.max(4, Math.ceil(length * density)));
      const side = perpendicular(heading), wave = rng.range(0, 2 * Math.PI);
      for (let s = 1; s <= spans; s++) {
        const u = s / spans;
        const lift = addScaled(up, heading, -dot(up, heading));
        heading = unit(addScaled(addScaled(heading, lift, (rule.bend + 0.5 * (1 - dominance) * maturity * u) / spans),
          side, Math.sin(wave + u * 5) * rule.wobble * params.irregularity / spans));
        stem.points.push(addScaled(stem.points[s - 1]!, heading, length / spans));
        stem.radii.push(base * (1 - 0.92 * u) ** 0.9 * (1 + 0.22 * Math.max(0, 1 - u / 0.16) ** 2));
      }
      stems.push(stem);
    }
  }
  return { stems };
}

/** Atlas baking, interactive preview and final meshes must resolve age and species identically. */
export function recipeTreeStructure(input: Readonly<Record<string, unknown>>) {
  const params = normalizeTreeParams(input);
  const growth = input.growth;
  const skeleton = treeOutputVersion(input.generatorVersion) === 3 ? buildTreeSkeleton(params)
    : growthSkeleton(params, typeof growth === "object" && growth !== null ? growth as Record<string, unknown> : {});
  return { params, skeleton };
}
