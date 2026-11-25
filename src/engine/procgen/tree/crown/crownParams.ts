// Parameters of the crown generator (tree recipe generator version 6,
// vegetation plan PG5b, §9.8) read from a `forge.treeRecipe` document: the
// size and growth fields every version has, the spray group (the leafy
// branchlet cards) and the LODs. A branch level's numbers (`levels`) and the
// `leaves` group belong to the older generators.

export const CROWN_GENERATOR_VERSION = 6;
/** Triangles per LOD, fine to coarse (user decision 2026-11-25: LOD0 40,000, only near). */
export const CROWN_TRIANGLE_CAPS = [40000, 5000, 800, 800] as const;
/** The share of a spray's rectangle its texture covers (sprayTexture.ts paints up to it). */
export const SPRAY_COVERAGE = 0.33;

export type LeafShape = "ovate" | "lobed" | "palmate" | "needle";
export const LEAF_SHAPES: readonly LeafShape[] = ["ovate", "lobed", "palmate", "needle"];

export interface SprayParams {
  /** Metres along the twig. */
  length: number;
  /** Width over length. */
  aspect: number;
  /** Positive values hang down. */
  droop: number;
  leafShape: LeafShape;
  /** Metres. */
  leafLength: number;
  /** Width over length of one leaf. */
  leafWidth: number;
  /** sRGB `#rrggbb`. */
  leafColor: string;
  twigColor: string;
  /** Pixels per spray tile. */
  textureSize: number;
}

export interface CrownLodParams {
  radialSegments: number;
  ringsPerMeter: number;
  minRadius: number;
  /** Share of the sprays kept; the kept ones grow to hold the leaf area. */
  leafFraction: number;
}

export interface CrownParams {
  seed: number;
  habit: "broadleaf" | "conifer";
  /** Metres, at this age. */
  height: number;
  trunkRadius: number;
  taper: number;
  flare: number;
  crownStart: number;
  irregularity: number;
  /** Crown diameter over height. */
  width: number;
  widestPoint: number;
  fullness: number;
  leaderDominance: number;
  spray: SprayParams;
  lods: CrownLodParams[];
}

const DEFAULT_LODS: readonly CrownLodParams[] = [
  { radialSegments: 14, ringsPerMeter: 3, minRadius: 0, leafFraction: 1 },
  { radialSegments: 7, ringsPerMeter: 1, minRadius: 0.025, leafFraction: 0.4 },
  { radialSegments: 4, ringsPerMeter: 0.4, minRadius: 0.07, leafFraction: 0.12 },
];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const hex = (value: unknown, fallback: string): string => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

export function normalizeCrownParams(input: Readonly<Record<string, unknown>>): CrownParams {
  const growth = isRecord(input.growth) ? input.growth : {}, spray = isRecord(input.spray) ? input.spray : {};
  const habit = input.habit === "conifer" ? "conifer" : "broadleaf";
  const needle = habit === "conifer";
  const maturity = Math.min(1, num(growth.age, 60, 1, 400) / num(growth.matureAge, 60, 1, 400));
  const lods = (Array.isArray(input.lods) ? input.lods : []).filter(isRecord).slice(0, 4).map((lod, index): CrownLodParams => {
    const fallback = DEFAULT_LODS[Math.min(index, DEFAULT_LODS.length - 1)]!;
    return {
      radialSegments: Math.floor(num(lod.radialSegments, fallback.radialSegments, 3, 32)),
      ringsPerMeter: num(lod.ringsPerMeter, fallback.ringsPerMeter, 0.1, 16),
      minRadius: num(lod.minRadius, fallback.minRadius, 0, 0.5),
      leafFraction: num(lod.leafFraction, fallback.leafFraction, 0, 1),
    };
  });
  return {
    seed: Math.trunc(num(input.seed, 1, -2147483648, 4294967295)) >>> 0,
    habit,
    // A young tree is shorter, much thinner, and leafy nearer the ground.
    height: num(input.height, 12, 1, 60) * (0.12 + 0.88 * Math.sqrt(maturity)),
    trunkRadius: num(input.trunkRadius, 0.3, 0.02, 3) * (0.06 + 0.94 * maturity ** 0.84),
    taper: num(input.taper, 0.08, 0.01, 1),
    flare: num(input.flare, 0.65, 0, 2),
    crownStart: Math.min(0.9, num(input.crownStart, 0.28, 0, 1) * (0.45 + 0.55 * maturity)),
    irregularity: num(input.irregularity, 0.5, 0, 1),
    width: num(growth.width, needle ? 0.46 : 0.8, 0.1, 1.6) * (0.75 + 0.25 * maturity),
    widestPoint: num(growth.widestPoint, 0.45, 0.05, 0.95),
    fullness: num(growth.fullness, 0.75, 0, 1),
    leaderDominance: num(growth.leaderDominance, 0.55, 0, 1),
    spray: {
      length: num(spray.length, 0.9, 0.2, 3),
      aspect: num(spray.aspect, 0.8, 0.2, 1.5),
      droop: num(spray.droop, 0.12, -1, 1),
      leafShape: LEAF_SHAPES.find((shape) => shape === spray.leafShape) ?? (needle ? "needle" : "ovate"),
      leafLength: num(spray.leafLength, needle ? 0.04 : 0.1, 0.01, 0.6),
      leafWidth: num(spray.leafWidth, needle ? 0.08 : 0.6, 0.02, 1.4),
      leafColor: hex(spray.leafColor, needle ? "#476b36" : "#668c30"),
      twigColor: hex(spray.twigColor, "#4d3826"),
      textureSize: 2 ** Math.round(Math.log2(num(Number(spray.textureSize), 512, 32, 1024))),
    },
    lods: lods.length > 0 ? lods : DEFAULT_LODS.map((lod) => ({ ...lod })),
  };
}

/** The leaf area a crown carries over its reference area, m² per m² (a closed forest has 4-8, dark conifers more). */
export const targetLeafAreaIndex = (params: CrownParams): number => (2.5 + 4.5 * params.fullness) * (params.habit === "conifer" ? 1.25 : 1);
