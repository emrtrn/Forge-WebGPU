import type { Vec3 } from "../vector.ts";

export interface RockParams {
  seed: number;
  /** Full approximate diameters in metres, before bottom flattening. */
  size: Vec3;
  shape: "angular" | "rounded";
  cuts: number;
  /** Displacement relative to the unit sphere radius (then scaled by size). */
  noiseAmplitude: number;
  noiseScale: number;
  noiseOctaves: number;
  flattenBottom: number;
  embedDepth: number;
  /** Unique subdivision levels, sorted from fine to coarse. */
  lods: number[];
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

/** Resolution is normalized but NOT silently clamped to the vertex budget:
 * generateRock reports over-budget requests before allocating any geometry.
 */
export function normalizeRockParams(input: Readonly<Record<string, unknown>> = {}): RockParams {
  const size = Array.isArray(input.size) ? input.size : [];
  const lods = Array.isArray(input.lods) ? input.lods.slice(0, 8)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map(v => Math.floor(Math.max(0, Math.min(16, v)))) : [3, 2, 1];
  return {
    seed: Math.trunc(finite(input.seed, 1, -2147483648, 4294967295)) >>> 0,
    size: [finite(size[0], 2, 0.01, 1000), finite(size[1], 2, 0.01, 1000), finite(size[2], 2, 0.01, 1000)],
    shape: input.shape === "angular" ? "angular" : "rounded",
    cuts: Math.floor(finite(input.cuts, 8, 0, 64)),
    noiseAmplitude: finite(input.noiseAmplitude, 0.12, 0, 0.35),
    noiseScale: finite(input.noiseScale, 2.5, 0.01, 32),
    noiseOctaves: Math.floor(finite(input.noiseOctaves, 3, 1, 8)),
    flattenBottom: finite(input.flattenBottom, 0.5, 0, 1),
    embedDepth: finite(input.embedDepth, 0.05, 0, 1000),
    lods: [...new Set(lods.length ? lods : [3, 2, 1])].sort((a, b) => b - a),
  };
}
