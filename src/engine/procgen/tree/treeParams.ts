export interface TreeLevelParams {
  count: number;
  /** Angle from the parent direction, in degrees. */
  angle: number;
  angleVariation: number;
  lengthRatio: number;
  /** First child placement as a fraction of parent length. */
  start: number;
  radiusRatio: number;
  /** Positive values bend toward +Y. */
  bend: number;
  wobble: number;
}

export interface TreeLodParams {
  radialSegments: number;
  ringsPerMeter: number;
  minRadius: number;
  leafFraction: number;
  /** Branch-tip cards (one card per kept terminal stem, from the species' card library) instead of leaf cards. */
  clusterCards: boolean;
}

export interface TreeParams {
  seed: number;
  habit: "broadleaf" | "conifer";
  height: number;
  trunkRadius: number;
  taper: number;
  flare: number;
  crownStart: number;
  levels: TreeLevelParams[];
  irregularity: number;
  leaves: { perStem: number; size: readonly [number, number]; cards: number; /** Branch-tip card library size, 0..15. */ clusters: number };
  /** Fine to coarse. */
  lods: TreeLodParams[];
}

export const TREE_PRESETS: { broadleaf: TreeParams; conifer: TreeParams } = {
  broadleaf: {
    seed: 1, habit: "broadleaf", height: 12, trunkRadius: 0.3, taper: 0.08, flare: 0.65,
    crownStart: 0.39, irregularity: 0.64,
    levels: [
      { count: 14, angle: 84, angleVariation: 14, lengthRatio: 0.34, start: 0.44, radiusRatio: 0.52, bend: 0.25, wobble: 0.25 },
      { count: 5, angle: 45, angleVariation: 20, lengthRatio: 0.44, start: 0.35, radiusRatio: 0.45, bend: 0.15, wobble: 0.24 },
      { count: 3, angle: 33, angleVariation: 15, lengthRatio: 0.48, start: 0.45, radiusRatio: 0.42, bend: 0.12, wobble: 0.2 },
    ],
    leaves: { perStem: 4, size: [0.35, 0.35], cards: 2, clusters: 12 },
    lods: [
      { radialSegments: 14, ringsPerMeter: 4, minRadius: 0, leafFraction: 1, clusterCards: false },
      { radialSegments: 8, ringsPerMeter: 1.6, minRadius: 0.006, leafFraction: 0.8, clusterCards: true },
      { radialSegments: 5, ringsPerMeter: 0.75, minRadius: 0.034, leafFraction: 0.2, clusterCards: true },
    ],
  },
  conifer: {
    seed: 1, habit: "conifer", height: 14, trunkRadius: 0.28, taper: 0.025, flare: 0.5,
    crownStart: 0.21, irregularity: 0.34,
    levels: [
      { count: 32, angle: 91, angleVariation: 10, lengthRatio: 0.31, start: 0, radiusRatio: 0.4, bend: 0.17, wobble: 0.1 },
      { count: 5, angle: 38, angleVariation: 19, lengthRatio: 0.34, start: 0.28, radiusRatio: 0.43, bend: 0.14, wobble: 0.13 },
    ],
    leaves: { perStem: 5, size: [0.5, 0.15], cards: 2, clusters: 12 },
    lods: [
      { radialSegments: 13, ringsPerMeter: 4, minRadius: 0, leafFraction: 1, clusterCards: false },
      { radialSegments: 8, ringsPerMeter: 1.5, minRadius: 0.01, leafFraction: 0.8, clusterCards: true },
      { radialSegments: 4, ringsPerMeter: 0.65, minRadius: 0.04, leafFraction: 0.2, clusterCards: true },
    ],
  },
};

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entries<T>(
  value: unknown, defaults: readonly T[], limit: number,
  normalize: (entry: Readonly<Record<string, unknown>>, fallback: T) => T,
): T[] {
  const result: T[] = [];
  if (Array.isArray(value)) for (const entry of value) {
    if (!isRecord(entry)) continue;
    result.push(normalize(entry, defaults[Math.min(result.length, defaults.length - 1)]!));
    if (result.length === limit) break;
  }
  return result.length ? result : defaults.map(entry => ({ ...entry }));
}

function normalizeLevel(entry: Readonly<Record<string, unknown>>, fallback: TreeLevelParams): TreeLevelParams {
  return {
    count: Math.floor(finite(entry.count, fallback.count, 0, 64)),
    angle: finite(entry.angle, fallback.angle, 0, 120),
    angleVariation: finite(entry.angleVariation, fallback.angleVariation, 0, 60),
    lengthRatio: finite(entry.lengthRatio, fallback.lengthRatio, 0.05, 1),
    start: finite(entry.start, fallback.start, 0, 1),
    radiusRatio: finite(entry.radiusRatio, fallback.radiusRatio, 0.1, 1),
    bend: finite(entry.bend, fallback.bend, -1, 1),
    wobble: finite(entry.wobble, fallback.wobble, 0, 1),
  };
}

function normalizeLod(entry: Readonly<Record<string, unknown>>, fallback: TreeLodParams): TreeLodParams {
  return {
    radialSegments: Math.floor(finite(entry.radialSegments, fallback.radialSegments, 3, 32)),
    ringsPerMeter: finite(entry.ringsPerMeter, fallback.ringsPerMeter, 0.5, 16),
    minRadius: finite(entry.minRadius, fallback.minRadius, 0, 0.5),
    leafFraction: finite(entry.leafFraction, fallback.leafFraction, 0, 1),
    clusterCards: entry.leafCards === "clusters" ? true : entry.leafCards === "leaves" ? false
      : typeof entry.clusterCards === "boolean" ? entry.clusterCards : fallback.clusterCards,
  };
}

export function normalizeTreeParams(input: Readonly<Record<string, unknown>>): TreeParams {
  const habit = input.habit === "conifer" ? "conifer" : "broadleaf";
  const defaults = TREE_PRESETS[habit];
  const leaves = isRecord(input.leaves) ? input.leaves : {};
  const size = Array.isArray(leaves.size) ? leaves.size : [];
  return {
    seed: Math.trunc(finite(input.seed, defaults.seed, -2147483648, 4294967295)) >>> 0,
    habit,
    height: finite(input.height, defaults.height, 1, 60),
    trunkRadius: finite(input.trunkRadius, defaults.trunkRadius, 0.02, 3),
    taper: finite(input.taper, defaults.taper, 0.01, 1),
    flare: finite(input.flare, defaults.flare, 0, 2),
    crownStart: finite(input.crownStart, defaults.crownStart, 0, 1),
    levels: entries(input.levels, defaults.levels, 3, normalizeLevel),
    irregularity: finite(input.irregularity, defaults.irregularity, 0, 1),
    leaves: {
      perStem: Math.floor(finite(leaves.perStem, defaults.leaves.perStem, 0, 64)),
      size: [finite(size[0], defaults.leaves.size[0], 0.01, 5), finite(size[1], defaults.leaves.size[1], 0.01, 5)],
      cards: Math.floor(finite(leaves.cards, defaults.leaves.cards, 1, 4)),
      clusters: Math.floor(finite(leaves.clusters, defaults.leaves.clusters, 0, 15)),
    },
    lods: entries(input.lods, defaults.lods, 4, normalizeLod),
  };
}
