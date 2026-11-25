// The spray atlas of a generator version 6 tree (vegetation plan PG5b, §9.8):
// 2 × 2 tiles, each a leafy branchlet seen from its face, its twig along +U
// from the left edge. Painted on the CPU, back to front: the colour (sRGB,
// the summer leaf, its alpha the cut mask), and a tangent-space normal, so
// every painted leaf has its own tilt, fold and rib under the light. Leaves
// keep their real size on the card; as many are painted as the covered share
// asks for (SPRAY_COVERAGE, the one number the generator's leaf area counts
// with). Deterministic: every draw comes from the seed's streams.

import { createStream, type RandomStream } from "../random.ts";
import { SPRAY_COVERAGE, type SprayParams } from "../tree/crown/crownParams.ts";

export interface SprayAtlas {
  /** Atlas edge, pixels. */
  readonly size: number;
  /** RGBA8, sRGB; alpha the antialiased cut mask. */
  readonly rgba: Uint8Array;
  /** RGBA8, linear: the tangent-space normal, +Y toward the image's top. */
  readonly normal: Uint8Array;
  /** Covered share of each tile. */
  readonly coverage: readonly number[];
}

const GRID = 2;
/** Alpha at or above which a texel counts as covered (the generated leaf material's cut). */
export const SPRAY_CUT = 0.4;

type Rgb = readonly [number, number, number];
interface Texel { color: Rgb; alpha: number; nx: number; ny: number }
interface Canvas { size: number; color: Float32Array; alpha: Float32Array; normal: Float32Array; covered: number }

const clamp = (v: number, min = 0, max = 1): number => Math.max(min, Math.min(max, v));
const srgb = (hex: string): Rgb => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
};
const scaled = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** Paints a shape over what is there; `at` gives its texel in the canvas's pixel space (y down). */
function paint(canvas: Canvas, x0: number, y0: number, x1: number, y1: number, at: (x: number, y: number) => Texel | null): void {
  const { size, color, alpha, normal } = canvas;
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(size - 1, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(size - 1, Math.ceil(x1)); x++) {
      const texel = at(x + 0.5, y + 0.5);
      if (!texel || texel.alpha <= 0) continue;
      const i = y * size + x, a = texel.alpha, under = alpha[i]!, over = under > 0 ? a : 1;
      for (let k = 0; k < 3; k++) color[i * 3 + k] = color[i * 3 + k]! * (1 - over) + texel.color[k]! * over;
      normal[i * 2] = normal[i * 2]! * (1 - over) + texel.nx * over;
      normal[i * 2 + 1] = normal[i * 2 + 1]! * (1 - over) + texel.ny * over;
      alpha[i] = Math.max(under, a);
      if (under < SPRAY_CUT && a >= SPRAY_CUT) canvas.covered++;
    }
  }
}

/** A tapering round stalk: a twig or a needle. */
function stalk(canvas: Canvas, ax: number, ay: number, bx: number, by: number, w0: number, w1: number, color: Rgb, round: number): void {
  const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy || 1, length = Math.sqrt(length2), m = Math.max(w0, w1) + 1;
  paint(canvas, Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m, (x, y) => {
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / length2), width = w0 + (w1 - w0) * t;
    const ox = x - ax - dx * t, oy = y - ay - dy * t, alpha = clamp(width - Math.hypot(ox, oy) + 0.5);
    if (alpha <= 0) return null;
    // Across the stalk, -1..1.
    const across = clamp((-ox * dy + oy * dx) / length / Math.max(width, 0.5), -1, 1) * round;
    return { color, alpha, nx: -dy / length * across, ny: dx / length * across };
  });
}

/** The half width of a leaf at `u` from its stalk (0) to its tip (1), 0..1. */
function outline(shape: SprayParams["leafShape"], u: number): number {
  if (shape === "lobed") return Math.sin(Math.PI * u ** 0.75) ** 0.7 * (0.72 + 0.28 * Math.cos(u * Math.PI * 7));
  return Math.sin(Math.PI * u ** 0.8) ** 0.8 * (1 + 0.05 * Math.cos(u * Math.PI * 22));
}

interface Leaf { x: number; y: number; angle: number; length: number; width: number; tone: number; warm: number; tiltX: number; tiltY: number }

function leafBlade(canvas: Canvas, leaf: Leaf, base: Rgb, shape: SprayParams["leafShape"]): void {
  const c = Math.cos(leaf.angle), s = Math.sin(leaf.angle), reach = leaf.length + leaf.width;
  const color: Rgb = [(base[0] + leaf.warm) * leaf.tone, (base[1] + leaf.warm * 0.45) * leaf.tone, base[2] * leaf.tone];
  const blade = (x: number, y: number, turn: number, length: number, width: number): Texel | null => {
    const cc = Math.cos(leaf.angle + turn), ss = Math.sin(leaf.angle + turn);
    const u = ((x - leaf.x) * cc + (y - leaf.y) * ss) / length, v = -(x - leaf.x) * ss + (y - leaf.y) * cc;
    if (u <= 0 || u >= 1) return null;
    const half = width * outline(shape, u), alpha = clamp(half - Math.abs(v) + 0.5);
    if (alpha <= 0) return null;
    const rib = Math.abs(v) < Math.max(0.6, width * 0.05) ? 1.18 : 1;
    const vein = (((u * 7 - Math.abs(v) / width * 0.9) % 1) + 1) % 1;
    const k = rib * (Math.abs(vein - 0.5) > 0.42 ? 1.06 : 1) * (0.92 + 0.16 * u);
    // A blade folds up along its rib and bends down toward its tip.
    const fold = -Math.sign(v) * 0.34 * Math.min(1, Math.abs(v) / Math.max(1, width * 0.25)), bend = (u - 0.4) * 0.5;
    return { color: scaled(color, k), alpha, nx: leaf.tiltX + cc * bend - ss * fold, ny: leaf.tiltY + ss * bend + cc * fold };
  };
  paint(canvas, leaf.x - reach, leaf.y - reach, leaf.x + reach, leaf.y + reach, (x, y) => {
    if (Math.hypot(x - leaf.x - c * leaf.length / 2, y - leaf.y - s * leaf.length / 2) > reach) return null;
    if (shape !== "palmate") return blade(x, y, 0, leaf.length, leaf.width);
    // Five pointed lobes from one stalk.
    let best: Texel | null = null;
    for (const [turn, size] of [[0, 1], [0.75, 0.82], [-0.75, 0.82], [1.6, 0.5], [-1.6, 0.5]] as const) {
      const texel = blade(x, y, turn, leaf.length * size, leaf.width * 0.5 * size);
      if (texel && texel.alpha > (best?.alpha ?? 0)) best = texel;
    }
    return best;
  });
}

/** The branchlet's own wood: its main twig and the side twigs on it, 0..1 of the tile. */
interface Twig { ax: number; ay: number; bx: number; by: number; order: number }
function branchlet(random: RandomStream, sides: number, open: number, reach: number): { main: (t: number) => [number, number]; twigs: Twig[] } {
  const curve = random.range(-0.03, 0.03), main = (t: number): [number, number] => [0.015 + 0.9 * t, 0.5 + Math.sin(t * 3) * curve];
  const twigs: Twig[] = [];
  for (let i = 0; i < sides; i++) {
    const t = 0.05 + 0.88 * (i + 0.5) / sides, side = i % 2 ? 1 : -1, [ax, ay] = main(t);
    const angle = side * (open - 0.3 * t + random.range(-0.14, 0.14));
    // Longest before the middle: the card's silhouette is a spray, not a rectangle.
    const length = reach * Math.sin(Math.PI * clamp(0.2 + 0.7 * t)) ** 0.8 * random.range(0.82, 1.15);
    twigs.push({ ax, ay, bx: Math.min(0.955, ax + Math.cos(angle) * length), by: clamp(ay + Math.sin(angle) * length, 0.045, 0.955), order: random.next() });
  }
  return { main, twigs };
}

const coverageOf = (canvas: Canvas): number => canvas.covered / canvas.alpha.length;

function broadTile(params: SprayParams, canvas: Canvas, random: RandomStream): void {
  const { size } = canvas, leafColor = srgb(params.leafColor), twigColor = srgb(params.twigColor);
  const length = Math.min(0.4, params.leafLength / params.length) * size, width = length * params.leafWidth / 2;
  const { main, twigs } = branchlet(random, 7, 1.02, 0.46);
  // The twigs' places, filled in rounds until the tile is covered.
  const lobes = params.leafShape === "palmate" ? [0, 0.75, -0.75, 1.6, -1.6] : [0];
  const inside = (leaf: Leaf): boolean => lobes.every((turn) => [0.35, 0.7, 1].every((u) => {
    const length = leaf.length * (turn === 0 ? 1 : 0.82), angle = leaf.angle + turn;
    const x = leaf.x + Math.cos(angle) * length * u, y = leaf.y + Math.sin(angle) * length * u;
    const margin = (u === 1 ? 0 : leaf.width * (lobes.length > 1 ? 0.5 : 1)) + 0.008 * size;
    return x > margin && x < size - margin && y > margin && y < size - margin;
  }));
  /** A blade that would leave the tile turns back toward its middle; null when it still would. */
  const place = (leaf: Leaf): Leaf | null => {
    if (inside(leaf)) return leaf;
    const back = { ...leaf, angle: Math.atan2(size / 2 - leaf.y, size * 0.45 - leaf.x) + random.range(-0.6, 0.6), length: leaf.length * 0.85, width: leaf.width * 0.85 };
    return inside(back) ? back : null;
  };
  const leaves: Leaf[] = [];
  const leafOn = (x: number, y: number, angle: number): void => {
    const grow = random.range(0.78, 1.15);
    const leaf = place({
      x, y, angle, length: length * grow, width: width * grow * random.range(0.8, 1.15), tone: 1, warm: random.range(-0.04, 0.07),
      tiltX: random.range(-0.4, 0.4), tiltY: random.range(-0.4, 0.4),
    });
    if (leaf) leaves.push(leaf);
  };
  const perRound = (offset: number): void => {
    const gap = Math.max(0.018 * size, length * 0.5);
    for (const twig of twigs) {
      const dx = (twig.bx - twig.ax) * size, dy = (twig.by - twig.ay) * size, span = Math.hypot(dx, dy), angle = Math.atan2(dy, dx), count = Math.max(1, Math.round(span * 0.85 / gap));
      for (let k = 0; k < count; k++) {
        const u = 0.15 + 0.85 * (k + offset) / count;
        leafOn(twig.ax * size + dx * u, twig.ay * size + dy * u, angle + (k % 2 ? 1 : -1) * random.range(0.45, 1.2));
      }
      leafOn(twig.bx * size - dx * 0.06, twig.by * size - dy * 0.06, angle + random.range(-0.5, 0.5));
    }
    const along = Math.round(0.85 * size / gap * 0.6);
    for (let k = 0; k < along; k++) {
      const [x, y] = main(0.08 + 0.9 * (k + offset) / along);
      leafOn(x * size, y * size, (k % 2 ? 1 : -1) * random.range(0.35, 1.1));
    }
  };
  const wood = (): void => {
    for (const twig of twigs) stalk(canvas, twig.ax * size, twig.ay * size, twig.bx * size, twig.by * size, 0.0038 * size, 0.0015 * size, twigColor, 0.8);
    for (let i = 0; i < 16; i++) {
      const [ax, ay] = main(i / 16), [bx, by] = main((i + 1) / 16);
      stalk(canvas, ax * size, ay * size, bx * size, by * size, (0.0068 - 0.0048 * i / 16) * size, (0.0068 - 0.0048 * (i + 1) / 16) * size, twigColor, 0.8);
    }
  };
  // Layer by layer: the first ones lie deeper, in the shade of those over them; the twigs between.
  const blade = (leaf: Leaf, depth: number): void => leafBlade(canvas, { ...leaf, tone: (0.66 + 0.42 * depth) * random.range(0.9, 1.1) }, leafColor, params.leafShape);
  perRound(0.2);
  for (const leaf of leaves.splice(0).sort((a, b) => a.tiltY - b.tiltY)) {
    blade(leaf, 0.3 * random.next());
    if (coverageOf(canvas) >= SPRAY_COVERAGE * 0.62) break;
  }
  wood();
  for (let round = 0; round < 24 && coverageOf(canvas) < SPRAY_COVERAGE; round++) {
    perRound((0.5 + round * 0.37) % 1);
    for (const leaf of leaves.splice(0).sort((a, b) => a.tiltX - b.tiltX)) {
      blade(leaf, 0.5 + 0.5 * random.next());
      if (coverageOf(canvas) >= SPRAY_COVERAGE) return;
    }
  }
}

function needleTile(params: SprayParams, canvas: Canvas, random: RandomStream): void {
  const { size } = canvas, leafColor = srgb(params.leafColor), twigColor = srgb(params.twigColor);
  const needle = Math.min(0.2, params.leafLength / params.length) * size, thick = Math.max(0.55, needle * params.leafWidth / 2);
  // Long needles sit in tufts on the outer part of a few shoots (a pine's); short ones line many (a spruce's).
  const tufted = needle > 0.07 * size, bare = tufted ? 0.45 : 0;
  const { main, twigs } = branchlet(random, tufted ? 8 : 15, 1, 0.47);
  const shoots: Twig[] = tufted ? twigs : twigs.flatMap((twig) => {
    const at = random.range(0.4, 0.6), x = twig.ax + (twig.bx - twig.ax) * at, y = twig.ay + (twig.by - twig.ay) * at;
    const angle = Math.atan2(twig.by - twig.ay, twig.bx - twig.ax) * random.range(0.25, 0.5), length = Math.hypot(twig.bx - twig.ax, twig.by - twig.ay) * 0.3;
    return [twig, { ax: x, ay: y, bx: Math.min(0.955, x + Math.cos(angle) * length), by: clamp(y + Math.sin(angle) * length, 0.045, 0.955), order: random.next() }];
  }).sort((a, b) => a.order - b.order);
  const [mx, my] = main(0), [ex, ey] = main(1);
  shoots.push({ ax: mx, ay: my, bx: ex, by: ey, order: 2 });
  // Long needles stand apart: a tuft is spiky, not a fan.
  const gap = Math.max(1.6, 0.0066 * size, needle * 0.075);
  const draw = (shoot: Twig, depth: number): void => {
    const ax = shoot.ax * size, ay = shoot.ay * size, dx = shoot.bx * size - ax, dy = shoot.by * size - ay, length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
    stalk(canvas, ax, ay, ax + dx, ay + dy, 0.0045 * size, 0.002 * size, twigColor, 0.8);
    const count = Math.max(3, Math.round(length * (1 - bare) / gap));
    for (let k = 0; k < count; k++) for (const side of [-1, 1]) {
      const u = bare + (1 - bare) * (k + (side > 0 ? 0.5 : 0)) / count, turn = angle + side * random.range(0.4, 1), x = ax + dx * u, y = ay + dy * u;
      // None leaves its tile.
      const room = (at: number, step: number): number => (Math.abs(step) < 1e-6 ? Infinity : Math.max(0, ((step > 0 ? 0.985 * size : 0.015 * size) - at) / step));
      const reach = Math.min(needle * random.range(0.72, 1.18), room(x, Math.cos(turn)), room(y, Math.sin(turn)));
      const tone = (0.7 + 0.4 * depth) * random.range(0.86, 1.12) * (0.94 + 0.2 * u);
      stalk(canvas, x, y, x + Math.cos(turn) * reach, y + Math.sin(turn) * reach, thick, thick * 0.55, scaled(leafColor, tone), 0.7);
    }
  };
  shoots.forEach((shoot, i) => draw(shoot, i / shoots.length));
  // Denser until the tile is covered: more side shoots over the same twigs.
  for (let round = 0; round < 64 && coverageOf(canvas) < SPRAY_COVERAGE; round++) {
    const twig = shoots[Math.floor(random.next() * shoots.length)]!, t = random.range(Math.max(0.1, bare), 0.9), x = twig.ax + (twig.bx - twig.ax) * t, y = twig.ay + (twig.by - twig.ay) * t;
    const angle = Math.atan2(twig.by - twig.ay, twig.bx - twig.ax) + (random.next() < 0.5 ? -1 : 1) * random.range(0.3, 0.8), length = random.range(0.07, 0.16);
    draw({ ax: x, ay: y, bx: clamp(x + Math.cos(angle) * length, 0.03, 0.955), by: clamp(y + Math.sin(angle) * length, 0.045, 0.955), order: 0 }, 0.5 + 0.5 * random.next());
  }
}

/** Fills uncovered texels from their covered neighbours, so filtering at the cut does not pull in black. */
function bleed(canvas: Canvas, passes: number): void {
  const { size, color, alpha, normal } = canvas, filled = Uint8Array.from(alpha, (a) => (a > 0.02 ? 1 : 0));
  const beside = (i: number): number[] => {
    const x = i % size, out: number[] = [];
    if (x + 1 < size) out.push(i + 1);
    if (x > 0) out.push(i - 1);
    if (i + size < filled.length) out.push(i + size);
    if (i >= size) out.push(i - size);
    return out;
  };
  // Ring by ring outward from the covered texels.
  let ring: number[] = [];
  filled.forEach((value, i) => { if (value && beside(i).some((j) => !filled[j])) ring.push(i); });
  const seen = Uint8Array.from(filled);
  for (let pass = 0; pass < passes && ring.length > 0; pass++) {
    const next: number[] = [];
    for (const i of ring) for (const j of beside(i)) if (!seen[j]) { seen[j] = 1; next.push(j); }
    for (const i of next) {
      const sum = [0, 0, 0, 0, 0];
      let n = 0;
      for (const j of beside(i)) {
        if (!filled[j]) continue;
        n++;
        for (let k = 0; k < 3; k++) sum[k]! += color[j * 3 + k]!;
        for (let k = 0; k < 2; k++) sum[3 + k]! += normal[j * 2 + k]!;
      }
      for (let k = 0; k < 3; k++) color[i * 3 + k] = sum[k]! / n;
      for (let k = 0; k < 2; k++) normal[i * 2 + k] = sum[3 + k]! / n;
    }
    for (const i of next) filled[i] = 1;
    ring = next;
  }
}

export function bakeSprayAtlas(params: SprayParams, seed: number, tileLimit = Infinity): SprayAtlas {
  const tile = Math.max(16, Math.min(params.textureSize, tileLimit)), size = tile * GRID;
  const rgba = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4), coverage: number[] = [];
  const byte = (value: number): number => Math.round(255 * clamp(value));
  for (let t = 0; t < GRID * GRID; t++) {
    const canvas: Canvas = { size: tile, color: new Float32Array(tile * tile * 3), alpha: new Float32Array(tile * tile), normal: new Float32Array(tile * tile * 2), covered: 0 };
    const random = createStream(seed, `spray/${params.leafShape}/${t}`);
    if (params.leafShape === "needle") needleTile(params, canvas, random); else broadTile(params, canvas, random);
    coverage.push(coverageOf(canvas));
    bleed(canvas, Math.max(4, tile / 16));
    const x0 = (t % GRID) * tile, y0 = Math.floor(t / GRID) * tile;
    for (let y = 0; y < tile; y++) for (let x = 0; x < tile; x++) {
      const i = y * tile + x, out = ((y0 + y) * size + x0 + x) * 4;
      for (let k = 0; k < 3; k++) rgba[out + k] = byte(canvas.color[i * 3 + k]!);
      rgba[out + 3] = byte(canvas.alpha[i]!);
      const nx = canvas.normal[i * 2]!, ny = -canvas.normal[i * 2 + 1]!, scale = 1 / Math.hypot(nx, ny, 1);
      normal[out] = byte(nx * scale * 0.5 + 0.5);
      normal[out + 1] = byte(ny * scale * 0.5 + 0.5);
      normal[out + 2] = byte(scale * 0.5 + 0.5);
      normal[out + 3] = 255;
    }
  }
  return { size, rgba, normal, coverage };
}
