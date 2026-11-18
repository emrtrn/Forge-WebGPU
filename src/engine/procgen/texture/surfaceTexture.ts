import { streamSeed } from "../random.ts";
import { periodicCellular2, periodicFbm2 } from "./tileNoise.ts";

export const SURFACE_NOISE_KINDS = ["gradient", "ridged", "cellular"] as const;
export const SURFACE_BLENDS = ["add", "multiply", "max", "min"] as const;

export interface SurfaceNoiseLayer {
  kind: (typeof SURFACE_NOISE_KINDS)[number];
  /** Integer features per tile, 1..64. */
  scale: number;
  octaves: number; // 1..8
  gain: number; // 0..1
  weight: number; // 0..2
  blend: (typeof SURFACE_BLENDS)[number];
  threshold: number; // 0..1
  /** Smoothstep width around threshold. A width of 1 bypasses the remap. */
  softness: number;
}

export interface SurfaceColorStop { at: number; color: readonly [number, number, number] }

export interface SurfaceTextureParams {
  seed: number;
  /** Power of two, 64..2048. */
  size: number;
  layers: SurfaceNoiseLayer[];
  /** sRGB stops in ascending order of linear height. */
  colorRamp: SurfaceColorStop[];
  normalStrength: number; // 0..16
  /** Roughness at heights 0 and 1. */
  roughness: readonly [number, number];
  aoStrength: number; // 0..1
  metalness: number; // 0..1
}

export interface SurfaceTextureResult {
  size: number;
  /** Linear 0..1 height, row-major. */
  height: Float32Array;
  /** sRGB RGBA8. */
  baseColor: Uint8Array;
  /** OpenGL tangent-space normal RGBA8. */
  normal: Uint8Array;
  /** Linear RGBA8 with occlusion, roughness, and metalness in RGB. */
  orm: Uint8Array;
}

const DEFAULT_LAYERS: readonly SurfaceNoiseLayer[] = [
  { kind: "gradient", scale: 5, octaves: 4, gain: 0.55, weight: 1, blend: "add", threshold: 0.5, softness: 1 },
  { kind: "cellular", scale: 9, octaves: 3, gain: 0.5, weight: 0.35, blend: "add", threshold: 0.5, softness: 1 },
];
const DEFAULT_RAMP: readonly SurfaceColorStop[] = [
  { at: 0, color: [0.22, 0.22, 0.21] },
  { at: 0.55, color: [0.45, 0.44, 0.42] },
  { at: 1, color: [0.67, 0.66, 0.63] },
];
const LACUNARITY = 2;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const field = (value: unknown, fallback: number, min = 0, max = 1): number =>
  finite(value) ? clamp(value, min, max) : fallback;
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function normalizeSurfaceTextureParams(input: Readonly<Record<string, unknown>>): SurfaceTextureParams {
  const requestedSize = field(input.size, 256, 64, 2048);
  const lower = 2 ** Math.floor(Math.log2(requestedSize));
  const size = requestedSize < lower * 1.5 ? lower : lower * 2;
  const layers: SurfaceNoiseLayer[] = [];
  for (const entry of Array.isArray(input.layers) ? input.layers : []) {
    if (!isRecord(entry)) continue;
    const kind = SURFACE_NOISE_KINDS.find(value => value === entry.kind);
    if (!kind) continue;
    layers.push({
      kind, scale: Math.round(field(entry.scale, 5, 1, 64)), gain: field(entry.gain, 0.5),
      octaves: Math.round(field(entry.octaves, 3, 1, 8)), weight: field(entry.weight, 1, 0, 2),
      blend: SURFACE_BLENDS.find(value => value === entry.blend) ?? "add",
      threshold: field(entry.threshold, 0.5), softness: field(entry.softness, 1),
    });
    if (layers.length === 8) break;
  }
  const colorRamp: SurfaceColorStop[] = [];
  for (const entry of Array.isArray(input.colorRamp) ? input.colorRamp : []) {
    if (!isRecord(entry) || !finite(entry.at) || !Array.isArray(entry.color) || entry.color.length !== 3) continue;
    const [r, g, b] = entry.color;
    if (!finite(r) || !finite(g) || !finite(b)) continue;
    colorRamp.push({ at: clamp(entry.at, 0, 1), color: [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)] });
    if (colorRamp.length === 8) break;
  }
  const roughness = Array.isArray(input.roughness) ? input.roughness : [];
  return {
    seed: Math.trunc(field(input.seed, 4, -2147483648, 4294967295)) >>> 0,
    size, layers: layers.length ? layers : DEFAULT_LAYERS.map(layer => ({ ...layer })),
    colorRamp: colorRamp.length ? colorRamp.sort((a, b) => a.at - b.at) : DEFAULT_RAMP.map(({ at, color }) => ({ at, color: [...color] })),
    normalStrength: field(input.normalStrength, 4, 0, 16),
    roughness: [field(roughness[0], 0.88), field(roughness[1], 0.65)],
    aoStrength: field(input.aoStrength, 0.65), metalness: field(input.metalness, 0),
  };
}

function cellularFbm(x: number, y: number, period: number, octaves: number, gain: number, seed: number): number {
  let sum = 0, total = 0, amplitude = 1;
  for (let octave = 0; octave < octaves && amplitude !== 0; octave++) {
    sum += amplitude * periodicCellular2(x, y, period, seed + octave * 101);
    total += amplitude;
    amplitude *= gain;
    x *= LACUNARITY;
    y *= LACUNARITY;
    period *= LACUNARITY;
  }
  return sum / total;
}

function sampleLayer(layer: SurfaceNoiseLayer, u: number, v: number, seed: number): number {
  const { kind, scale, octaves, gain, threshold, softness, weight } = layer;
  const x = u * scale, y = v * scale;
  let value: number;
  if (kind === "cellular") {
    value = cellularFbm(x, y, scale, octaves, gain, seed);
  } else {
    const gradient = periodicFbm2(x, y, scale, octaves, LACUNARITY, gain, seed);
    value = kind === "ridged" ? 1 - Math.abs(gradient) : gradient * 0.5 + 0.5;
  }
  if (softness === 0) value = value >= threshold ? 1 : 0;
  else if (softness < 1) {
    const t = clamp((value - threshold) / softness + 0.5, 0, 1);
    value = t * t * (3 - 2 * t);
  }
  return value * weight;
}

function bakeHeight({ size, seed, layers }: SurfaceTextureParams): Float32Array {
  const seeds = layers.map((_, index) => streamSeed(seed, "surface/layer/" + index));
  const heights = new Float64Array(size * size);
  let min = Infinity, max = -Infinity;
  for (let y = 0, i = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++, i++) {
      const u = (x + 0.5) / size;
      let height = sampleLayer(layers[0]!, u, v, seeds[0]!);
      for (let j = 1; j < layers.length; j++) {
        const layer = layers[j]!;
        const value = sampleLayer(layer, u, v, seeds[j]!);
        switch (layer.blend) {
          case "add": height += value; break;
          case "multiply": height *= value; break;
          case "max": height = Math.max(height, value); break;
          case "min": height = Math.min(height, value); break;
        }
      }
      heights[i] = height;
      min = Math.min(min, height);
      max = Math.max(max, height);
    }
  }
  const height = new Float32Array(heights.length);
  if (min === max) return height.fill(0.5);
  for (let i = 0; i < height.length; i++) height[i] = (heights[i]! - min) / (max - min);
  return height;
}

function blurRows(input: Float32Array | Float64Array, size: number, radius: number): Float64Array {
  const output = new Float64Array(input.length);
  const mask = size - 1, width = radius * 2 + 1;
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += input[row + (x & mask)]!;
    for (let x = 0; x < size; x++) {
      // Transpose so the second pass blurs the original columns.
      output[x * size + y] = sum / width;
      sum += input[row + ((x + radius + 1) & mask)]! - input[row + ((x - radius) & mask)]!;
    }
  }
  return output;
}

const toLinear = (v: number): number => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const toSrgb = (v: number): number => v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
const byte = (v: number): number => Math.round(v * 255);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function bakeSurfaceTexture(input: Readonly<Record<string, unknown>> | SurfaceTextureParams): SurfaceTextureResult {
  const params = normalizeSurfaceTextureParams({ ...input });
  const { size, normalStrength, aoStrength, roughness, metalness } = params;
  const height = bakeHeight(params);
  const baseColor = new Uint8Array(height.length * 4);
  const normal = new Uint8Array(baseColor.length);
  const orm = new Uint8Array(baseColor.length);
  const radius = size / 64, mask = size - 1;
  // Slope per texel scaled to a 256 px tile, so the strength means the same at every size.
  const slope = normalStrength * size / 256;
  const blurred = aoStrength > 0 ? blurRows(blurRows(height, size, radius), size, radius) : undefined;
  const ramp = params.colorRamp.map(({ at, color }) => ({ at, color: color.map(toLinear) }));

  for (let y = 0, i = 0; y < size; y++) {
    const row = y * size, above = ((y - 1) & mask) * size, below = ((y + 1) & mask) * size;
    for (let x = 0; x < size; x++, i++) {
      const h = height[i]!, offset = i * 4;
      let end = 0;
      while (end < ramp.length && h >= ramp[end]!.at) end++;
      const a = ramp[Math.max(0, end - 1)]!, b = ramp[Math.min(end, ramp.length - 1)]!;
      const t = a === b ? 0 : (h - a.at) / (b.at - a.at);
      for (let channel = 0; channel < 3; channel++) {
        baseColor[offset + channel] = byte(toSrgb(lerp(a.color[channel]!, b.color[channel]!, t)));
      }

      const nx = (height[row + ((x - 1) & mask)]! - height[row + ((x + 1) & mask)]!) * slope;
      // Texture rows increase downward, opposite the OpenGL +V direction.
      const ny = (height[below + x]! - height[above + x]!) * slope;
      const invLength = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      normal[offset] = byte(nx * invLength * 0.5 + 0.5);
      normal[offset + 1] = byte(ny * invLength * 0.5 + 0.5);
      normal[offset + 2] = byte(invLength * 0.5 + 0.5);

      const cavity = blurred ? clamp((blurred[i]! - h) * 4, 0, 1) : 0;
      orm[offset] = byte(1 - aoStrength * cavity);
      orm[offset + 1] = byte(lerp(roughness[0], roughness[1], h));
      orm[offset + 2] = byte(metalness);
      baseColor[offset + 3] = normal[offset + 3] = orm[offset + 3] = 255;
    }
  }
  return { size, height, baseColor, normal, orm };
}
