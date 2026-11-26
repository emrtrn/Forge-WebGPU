// Bake the starter Forest Floor terrain maps: node tools/procgen/forestFloor.ts
// To bake the detailed litter candidate in a separate directory, pass --detail <out>.
// A 1.6 m tile. The terrain layer array needs CPU-readable texture pixels.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createStream } from "../../src/engine/procgen/random.ts";
import { bakeSurfaceRecipe } from "../../src/engine/procgen/texture/surfaceRecipe.ts";
import { encodeRgbaPng } from "./png.ts";
import { bakeForestFloorLitter } from "./forestFloorLitter.ts";

const args = process.argv.slice(2);
if (args.length > 0 && (args.length !== 2 || args[0] !== "--detail" || !args[1])) {
  throw new Error("Usage: node tools/procgen/forestFloor.ts [--detail <out>]");
}

const size = 512;
const mask = size - 1;
const seed = 6831;
const random = createStream(seed, "forest-floor/litter");
const soil = bakeSurfaceRecipe({
  seed, size: String(size),
  layers: [
    { kind: "gradient", scale: 5, octaves: 5, gain: 0.58, weight: 0.85 },
    { kind: "cellular", scale: 55, octaves: 2, gain: 0.5, weight: 0.65 },
    { kind: "ridged", scale: 42, octaves: 3, gain: 0.55, weight: 0.35 },
  ],
  colorRamp: [
    { at: 0, color: "#513e2d" }, { at: 0.43, color: "#916f51" },
    { at: 0.72, color: "#b08b68" }, { at: 1, color: "#caa57e" },
  ],
  aoStrength: 0, normalStrength: 1, roughness: [0.9, 0.96],
});
const { height, baseColor, normal } = soil;
const detailDirectory = args[1];
if (detailDirectory) {
  mkdirSync(detailDirectory, { recursive: true });
  for (const [name, pixels] of Object.entries(bakeForestFloorLitter(soil, seed))) {
    writeFileSync(join(detailDirectory, `ForestFloor_${name}.png`), encodeRgbaPng(size, size, pixels));
  }
  process.exit(0);
}
const soilHeight = height.slice();
const pixelAt = (x: number, y: number) => (y & mask) * size + (x & mask);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Draw in local leaf coordinates, wrapping both paint and relief across tile edges.
function scatterPiece(twig: boolean): void {
  const x = random.range(0, size), y = random.range(0, size);
  const angle = random.range(0, Math.PI * 2), cos = Math.cos(angle), sin = Math.sin(angle);
  const length = twig ? random.range(9, 35) : random.range(3, 15); // half-length in texels
  const width = twig ? random.range(0.45, 1.15) : length * random.range(0.23, 0.48);
  const bend = random.range(-0.32, 0.32) * width;
  const lobes = random.int(2, 5), phase = random.range(0, 2 * Math.PI);
  const tone = random.range(0.66, 1.21), olive = random.range(-7, 8);
  const pigment = twig ? [134, 107, 81] : [190 + olive, 150 + olive * 2, 106 + olive];
  const radius = Math.ceil(Math.hypot(length, width + Math.abs(bend)) + 1);
  for (let py = Math.floor(y) - radius; py <= y + radius; py++) {
    for (let px = Math.floor(x) - radius; px <= x + radius; px++) {
      const dx = px + 0.5 - x, dy = py + 0.5 - y;
      const u = (dx * cos + dy * sin) / length;
      if (Math.abs(u) >= 1) continue;
      const v = dy * cos - dx * sin - bend * (1 - u * u);
      const profile = twig ? (0.85 - 0.28 * u) : (1 - u * u) * (0.84 + 0.16 * Math.sin(u * lobes * Math.PI + phase));
      const halfWidth = width * profile;
      const coverage = clamp01(halfWidth + 0.5 - Math.abs(v));
      if (coverage === 0) continue;
      const at = pixelAt(px, py);
      const grain = soilHeight[at]! - 0.5;
      const rib = clamp01(1 - Math.abs(v) / 0.85);
      const fold = clamp01(1 - Math.abs(v) / halfWidth);
      const value = tone * (0.9 + 0.2 * fold + 0.62 * grain);
      for (let c = 0; c < 3; c++) {
        const channel = at * 4 + c;
        const target = pigment[c]! * value + rib * 10;
        baseColor[channel] = Math.round(255 * clamp01((baseColor[channel]! + coverage * (target - baseColor[channel]!)) / 255));
      }
      height[at] = Math.max(height[at]!, soilHeight[at]! + coverage * (0.08 + 0.17 * fold + 0.04 * rib));
    }
  }
}

for (let i = 0; i < 1150; i++) scatterPiece(false);
for (let i = 0; i < 68; i++) scatterPiece(true);

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const nx = (height[pixelAt(x - 1, y)]! - height[pixelAt(x + 1, y)]!) * 1.7;
    const ny = (height[pixelAt(x, y + 1)]! - height[pixelAt(x, y - 1)]!) * 1.7;
    const scale = 127.5 / Math.hypot(nx, ny, 1);
    const at = pixelAt(x, y) * 4;
    normal[at] = Math.round(127.5 + nx * scale);
    normal[at + 1] = Math.round(127.5 + ny * scale);
    normal[at + 2] = Math.round(127.5 + scale);
  }
}
const directory = new URL("../../content/packs/starter/procgen/ground/", import.meta.url);
for (const [name, pixels] of [["Color", baseColor], ["Normal", normal]] as const) {
  writeFileSync(new URL(`ForestFloor_${name}.png`, directory), encodeRgbaPng(size, size, pixels));
}
