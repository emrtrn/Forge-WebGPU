import { createStream } from "../../src/engine/procgen/random.ts";

interface SoilTile {
  readonly size: number;
  readonly height: Float32Array;
  readonly baseColor: Uint8Array;
}

type PieceKind = "leaf" | "fragment" | "twig";
const PALETTE = [
  [169, 124, 79], [194, 147, 91], [157, 105, 65],
  [176, 128, 83], [145, 102, 66], [194, 154, 104],
] as const;
const TAU = Math.PI * 2;
const unit = (value: number): number => Math.min(1, Math.max(0, value));
const byte = (value: number): number => Math.round(Math.min(255, Math.max(0, value)));

/** One periodic tile. Height, pigment and roughness follow the same visible piece. */
export function bakeForestFloorLitter(soil: SoilTile, seed: number): {
  Color: Uint8Array; Normal: Uint8Array; Roughness: Uint8Array;
} {
  const { size } = soil;
  const color = soil.baseColor.slice();
  const height = soil.height.map((value) => 0.34 * value);
  const rough = soil.height.map((value) => 0.92 + 0.065 * unit(value));
  const normal = new Uint8Array(color.length);
  const roughness = new Uint8Array(color.length);
  const at = (x: number, y: number): number => ((y % size + size) % size) * size + ((x % size + size) % size);
  const surface = createStream(seed, "forest-floor/whole-litter");

  function scatter(kind: PieceKind, x: number, y: number, pile: number): void {
    const fragment = kind === "fragment", twig = kind === "twig";
    const angle = surface.range(0, TAU), c = Math.cos(angle), s = Math.sin(angle);
    const length = twig ? surface.range(8, 27) : fragment ? surface.range(2.2, 8.5) : surface.range(5.8, 16);
    const width = twig ? surface.range(0.53, 1.08) : length * surface.range(0.27, 0.59);
    const curve = width * surface.range(-0.37, 0.37);
    const taper = surface.range(-0.28, 0.22);
    const curl = surface.range(0.04, 0.18);
    const curlSide = surface.next() < 0.5 ? -1 : 1;
    const phase = surface.range(0, TAU);
    const lobes = surface.next() < 0.28 ? surface.range(5.5, 8) : 0;
    const pigment = twig ? [127, 97, 70] : PALETTE[surface.int(0, PALETTE.length - 1)]!;
    const value = surface.range(0.78, 1.16);
    const dry = twig ? 0.86 : fragment ? surface.range(0.8, 0.89) : surface.range(0.72, 0.84);
    const radius = Math.ceil(Math.hypot(length, width + Math.abs(curve)) + 2);

    for (let py = Math.floor(y) - radius; py <= y + radius; py++) {
      for (let px = Math.floor(x) - radius; px <= x + radius; px++) {
        const dx = px + 0.5 - x, dy = py + 0.5 - y;
        const u = (dx * c + dy * s) / length;
        if (Math.abs(u) >= 1) continue;
        const body = 1 - u * u;
        const v = dy * c - dx * s - curve * body;
        const rip = Math.sin(8 * u + phase) * 0.61 + Math.sin(19 * u - phase) * 0.39;
        const lobe = 1 + (lobes === 0 ? 0 : 0.18 * Math.cos(lobes * u + phase));
        const halfWidth = twig ? width * (0.84 - 0.21 * u) : width * Math.pow(body, 0.82) * (1 + taper * u) * lobe;
        const margin = halfWidth * (1 + (fragment ? 0.37 : 0.075) * rip) - Math.abs(v);
        // A diagonal tear breaks up the leaf fragments; the tip of a whole leaf stays intact.
        const edge = fragment ? Math.min(margin, length * (0.58 - u) + v * 0.58) : margin;
        if (edge < -0.88) continue;
        const pixel = at(px, py), offset = pixel * 4;
        const cover = unit(edge + 0.5);
        const contact = 0.15 * unit((edge + 0.88) * 1.2) * (1 - cover);
        const across = unit(Math.abs(v) / Math.max(halfWidth, 0.35));
        const sideCurl = v * curlSide > 0 ? 1 : 0.26;
        const bend = across ** 3 * sideCurl * curl;
        const tip = 0.08 * Math.max(0, u) ** 3;
        const ridge = unit(1 - Math.abs(v) / (twig ? 1 : 0.68));
        const sideVeins = 1 - Math.abs(Math.sin(13 * u - 0.73 * Math.abs(v) + phase));
        const veins = twig ? 0 : sideVeins ** 12 * (1 - across) * 0.28;
        const grain = soil.height[pixel]! - 0.5;
        const fold = 1 - 0.15 * across + 0.11 * sideCurl * across * across;
        const tone = value * (fold + 0.22 * grain) * (0.93 + 0.07 * unit(edge + 0.4));
        const tissue = dry + 0.045 * across + 0.025 * grain;
        for (let channel = 0; channel < 3; channel++) {
          const background = color[offset + channel]! * (1 - contact);
          const foreground = pigment[channel]! * tone + 13 * (ridge * 0.64 + veins);
          color[offset + channel] = byte(background + (foreground - background) * cover);
        }
        const lift = 0.048 + 0.09 * pile + body * 0.062 + bend + tip + ridge * 0.019;
        const raised = Math.max(height[pixel]! + 0.018, 0.34 * soil.height[pixel]! + lift);
        height[pixel]! += cover * (raised - height[pixel]!);
        rough[pixel]! += (tissue - rough[pixel]!) * cover;
      }
    }
  }

  // Isolated leaves and scraps leave humus exposed between the deposits.
  for (let i = 0; i < 520; i++) {
    const kind = i < 285 ? "fragment" : "leaf";
    scatter(kind, surface.range(0, size), surface.range(0, size), 0);
  }
  for (let i = 0; i < 49; i++) scatter("twig", surface.range(0, size), surface.range(0, size), 0);

  // Draw each deposit from the bottom of the pile up. Both centres near a
  // tile edge and individual leaves can continue through its opposite side.
  for (let pile = 0; pile < 7; pile++) {
    const cx = surface.range(0, size), cy = surface.range(0, size);
    const radius = surface.range(43, 70), stretch = surface.range(0.55, 0.87);
    const bearing = surface.range(0, TAU), c = Math.cos(bearing), s = Math.sin(bearing);
    const pieces = surface.int(80, 120);
    for (let i = 0; i < pieces; i++) {
      const distance = Math.sqrt(surface.next()) * radius;
      const direction = surface.range(0, TAU);
      const x = distance * Math.cos(direction), y = distance * Math.sin(direction) * stretch;
      const depth = (1 - distance / radius) * (i / pieces);
      scatter(i < pieces * 0.44 ? "fragment" : "leaf", cx + c * x - s * y, cy + s * x + c * y, depth);
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = at(x, y), offset = i * 4;
      const dx = (height[at(x - 1, y)]! - height[at(x + 1, y)]!) * 1.48;
      const dy = (height[at(x, y + 1)]! - height[at(x, y - 1)]!) * 1.48;
      const scale = 127.5 / Math.hypot(dx, dy, 1);
      normal.set([byte(127.5 + dx * scale), byte(127.5 + dy * scale), byte(127.5 + scale), 255], offset);
      const grey = byte(255 * rough[i]!);
      roughness.set([grey, grey, grey, 255], offset);
    }
  }
  return { Color: color, Normal: normal, Roughness: roughness };
}
