// The leaf card texture (vegetation plan PG2, §6.6 "leaf" generator): what a
// tree's leaf cards draw, baked on the CPU with its alpha (the leaf material
// cuts at `alphaTest`). One card = a twig along U (the card's outward axis,
// engine/procgen/tree/treeMesh.ts) with leaves on it:
// - `broad`: pointed leaves alternating left and right, a darker midrib and a
//   light edge falloff;
// - `needle`: thin needles leaving the twig at both sides.
// Colour is sRGB, the summer leaf; the season tint multiplies it in the
// shader. Deterministic: every random choice comes from the seed's streams.

import { createStream } from "../random.ts";

export interface LeafTextureParams {
  seed: number;
  kind: "broad" | "needle";
  /** Power of two 64..1024. */
  size: number;
  /** Leaves (broad) or needle pairs (needle) along the twig, 1..64. */
  count: number;
  /** sRGB 0..1. */
  leafColor: readonly [number, number, number];
  twigColor: readonly [number, number, number];
}

export interface LeafTextureResult {
  size: number;
  /** RGBA8, sRGB colour, alpha the cut mask (antialiased). */
  rgba: Uint8Array;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function normalizeLeafTextureParams(input: Readonly<Record<string, unknown>>): LeafTextureParams {
  const num = (value: unknown, fallback: number, min: number, max: number): number =>
    typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  const rgb = (value: unknown, fallback: readonly [number, number, number]): [number, number, number] =>
    Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number" && Number.isFinite(v))
      ? [clamp(value[0], 0, 1), clamp(value[1], 0, 1), clamp(value[2], 0, 1)] : [...fallback];
  const kind = input.kind === "needle" ? "needle" : "broad";
  const requested = num(input.size, 256, 64, 1024);
  return {
    seed: Math.trunc(num(input.seed, 1, 0, 4294967295)) >>> 0,
    kind,
    size: 2 ** Math.round(Math.log2(requested)),
    count: Math.round(num(input.count, kind === "broad" ? 7 : 22, 1, 64)),
    leafColor: rgb(input.leafColor, kind === "broad" ? [0.3, 0.45, 0.16] : [0.17, 0.3, 0.16]),
    twigColor: rgb(input.twigColor, [0.3, 0.22, 0.15]),
  };
}

interface Shape {
  /** Signed coverage distance in texels (positive inside) and a shading term 0..1 for the pixel centre. */
  sample(x: number, y: number): { inside: number; shade: number };
}

/** A segment of half width `width` from a to b (texel space). */
function segment(ax: number, ay: number, bx: number, by: number, width: number): Shape {
  const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
  return {
    sample(x, y) {
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / length2, 0, 1);
      const distance = Math.hypot(x - ax - dx * t, y - ay - dy * t);
      return { inside: width * (1 - 0.6 * t) - distance, shade: 0.7 };
    },
  };
}

/** A pointed leaf from its base along `angle`, `length` long, `width` wide at its widest. */
function leaf(bx: number, by: number, angle: number, length: number, width: number): Shape {
  const c = Math.cos(angle), s = Math.sin(angle);
  return {
    sample(x, y) {
      const u = ((x - bx) * c + (y - by) * s) / length, v = (-(x - bx) * s + (y - by) * c);
      if (u < 0 || u > 1) return { inside: -Math.hypot(Math.min(Math.abs(u), Math.abs(u - 1)) * length, v), shade: 0 };
      const half = width * Math.sin(Math.PI * u) ** 0.75 * (1 - 0.25 * u);
      const midrib = Math.abs(v) < Math.max(0.8, width * 0.06) ? 0.72 : 1;
      const edge = clamp(Math.abs(v) / Math.max(half, 1e-3), 0, 1);
      return { inside: half - Math.abs(v), shade: midrib * (1 - 0.18 * edge * edge) * (0.92 + 0.08 * u) };
    },
  };
}

export function bakeLeafTexture(input: Readonly<Record<string, unknown>> | LeafTextureParams): LeafTextureResult {
  const params = normalizeLeafTextureParams({ ...input });
  const { size, count } = params;
  const random = createStream(params.seed, `leaf/${params.kind}`);
  const twigY = size * 0.5, twigStart = size * 0.03, twigEnd = size * 0.97;
  const twig = segment(twigStart, twigY, twigEnd, twigY, Math.max(1, size * (params.kind === "broad" ? 0.012 : 0.01)));
  const leaves: { shape: Shape; tone: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    // Broad leaves reach past their base: they stay on the first three quarters so the card does not clip them.
    const at = twigStart + (twigEnd - twigStart) * (params.kind === "broad" ? 0.03 + 0.7 * (i + 0.5) / count : 0.08 + 0.9 * (i + 0.5) / count);
    const sides = params.kind === "broad" ? [i % 2 === 0 ? -1 : 1] : [-1, 1];
    for (const side of sides) {
      const pick = random.fork(`${i}/${side}`);
      if (params.kind === "broad") {
        const angle = side * (0.75 + pick.range(-0.2, 0.2)) - 0.25;
        const length = size * (0.3 + 0.12 * Math.sin(Math.PI * (i + 0.5) / count)) * pick.range(0.85, 1.1);
        leaves.push({ shape: leaf(at, twigY, angle, length, length * 0.24), tone: pick.range(0.88, 1.08) });
      } else {
        const angle = side * (0.95 + pick.range(-0.15, 0.15)) - 0.35;
        const length = size * 0.3 * pick.range(0.8, 1.1);
        const ex = at + Math.cos(angle) * length, ey = twigY + Math.sin(angle) * length;
        leaves.push({ shape: segment(at, twigY, ex, ey, Math.max(0.9, size * 0.009)), tone: pick.range(0.85, 1.1) });
      }
    }
  }
  const rgba = new Uint8Array(size * size * 4);
  const byte = (v: number): number => Math.round(clamp(v, 0, 1) * 255);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5, py = y + 0.5;
      let alpha = 0, color: readonly number[] = [0, 0, 0];
      for (const { shape, tone } of leaves) {
        const { inside, shade } = shape.sample(px, py);
        const coverage = clamp(inside + 0.5, 0, 1);
        if (coverage > alpha) { alpha = coverage; color = params.leafColor.map((c) => c * shade * tone); }
      }
      const t = twig.sample(px, py), twigCoverage = clamp(t.inside + 0.5, 0, 1);
      if (twigCoverage > alpha) { alpha = twigCoverage; color = params.twigColor; }
      const offset = (y * size + x) * 4;
      rgba[offset] = byte(color[0]!); rgba[offset + 1] = byte(color[1]!); rgba[offset + 2] = byte(color[2]!); rgba[offset + 3] = byte(alpha);
    }
  }
  return { size, rgba };
}
