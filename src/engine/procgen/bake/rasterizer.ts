// The CPU rasterizer of the bake path (vegetation plan PG3, §6.7; user
// decision 2026-11-11: CPU, runs in Node and in a worker, deterministic).
// Draws unlit G-buffer data of generated meshes through an orthographic
// camera: per output layer the mean sRGB colour and coverage of the covered
// samples, the octahedral object-space normal, the depth, and an `extra`
// channel: the largest threshold of every fragment that passed the alpha
// test in the pixel (hidden ones too), which lets a shader shed leaves per
// pixel and keep a pixel leafy while any leaf covering it remains.
//
// Each layer has its own depth buffer: a wood layer is not occluded by the
// leaves. Samples sit at sample centres; the top-left rule keeps a shared
// edge from being covered twice or missed. No lighting, no perspective.

import type { ProcMesh } from "../mesh.ts";
import type { Vec3 } from "../vector.ts";

export interface BakeTexture { width: number; height: number; /** RGBA8, colour sRGB. */ rgba: Uint8Array }

export interface BakeSurface {
  /** Object space; normals go to the output, nothing is lit. */
  mesh: ProcMesh;
  /** Two per vertex; needed with `texture`. */
  uvs?: Float32Array;
  /** Sampled bilinear, wrap repeat, v = 0 the first row of `rgba`. */
  texture?: BakeTexture | null;
  /** sRGB 0..1 multiplier of the sampled colour (default white). */
  color?: readonly [number, number, number];
  /** Discard below this sampled alpha (0..1); default 0.5 with a texture, 0 without. */
  alphaTest?: number;
  /** Output layer index. */
  layer: number;
  /** One per vertex, 0..1, interpolated into the layer's `extra`. */
  threshold?: Float32Array;
  /** Default true; false culls triangles whose winding faces away (CCW = front). */
  doubleSided?: boolean;
}

/** Orthographic camera: an orthonormal basis, `forward` = cross(up, right) into the scene. */
export interface BakeCamera {
  center: Vec3;
  right: Vec3;
  /** Image +y: row 0 of the output is the top (+halfHeight). */
  up: Vec3;
  forward: Vec3;
  halfWidth: number;
  halfHeight: number;
  /** The volume along forward: [-halfDepth, +halfDepth] around the centre. */
  halfDepth: number;
}

export interface RasterOptions {
  width: number;
  height: number;
  layers: number;
  /** Samples per axis per output pixel, 1..4 (default 2). */
  supersample?: number;
}

export interface RasterLayer {
  /** RGBA8: rgb the mean sRGB colour of the covered samples, a = covered / samples. */
  albedo: Uint8Array;
  /** RGBA8: rg octahedral object-space normal, b depth (0 nearest the camera), a = round(255 × max threshold). */
  normal: Uint8Array;
}

const byte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/** Full-sphere octahedral encoding, each component 0..1. */
export function octEncode(n: Vec3): [number, number] {
  const sum = Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) || 1;
  let x = n[0] / sum, y = n[1] / sum;
  if (n[2] < 0) {
    const fx = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
    const fy = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
    x = fx; y = fy;
  }
  return [x * 0.5 + 0.5, y * 0.5 + 0.5];
}

export function octDecode(u: number, v: number): Vec3 {
  let x = u * 2 - 1, y = v * 2 - 1;
  const z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0) {
    const fx = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
    const fy = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
    x = fx; y = fy;
  }
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

interface SampleLayer {
  depth: Float32Array;
  color: Float32Array;
  normal: Float32Array;
  extra: Float32Array;
}

function sampleTexture(texture: BakeTexture, u: number, v: number, out: number[]): void {
  const { width, height, rgba } = texture;
  const x = u * width - 0.5, y = v * height - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const wrap = (value: number, size: number): number => ((value % size) + size) % size;
  const xa = wrap(x0, width), xb = wrap(x0 + 1, width), ya = wrap(y0, height), yb = wrap(y0 + 1, height);
  // Alpha-weighted: transparent texels do not darken the colour of a cut edge.
  const taps = [(ya * width + xa) * 4, (ya * width + xb) * 4, (yb * width + xa) * 4, (yb * width + xb) * 4];
  const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  let alpha = 0, r = 0, g = 0, b = 0;
  for (let k = 0; k < 4; k++) {
    const tap = taps[k]!, w = weights[k]! * rgba[tap + 3]!;
    alpha += w; r += w * rgba[tap]!; g += w * rgba[tap + 1]!; b += w * rgba[tap + 2]!;
  }
  out[0] = alpha > 0 ? r / alpha : 0; out[1] = alpha > 0 ? g / alpha : 0; out[2] = alpha > 0 ? b / alpha : 0;
  out[3] = alpha;
}

export function rasterize(surfaces: readonly BakeSurface[], camera: BakeCamera, options: RasterOptions): RasterLayer[] {
  const ss = Math.max(1, Math.min(4, Math.floor(options.supersample ?? 2)));
  const width = Math.max(1, Math.floor(options.width)), height = Math.max(1, Math.floor(options.height));
  const sw = width * ss, sh = height * ss, count = sw * sh;
  const layers: SampleLayer[] = Array.from({ length: Math.max(1, options.layers) }, () => ({
    depth: new Float32Array(count).fill(Infinity),
    color: new Float32Array(count * 3),
    normal: new Float32Array(count * 3),
    extra: new Float32Array(count).fill(-1),
  }));
  const { center, right, up, forward, halfWidth, halfHeight, halfDepth } = camera;
  const toX = sw / (2 * halfWidth), toY = sh / (2 * halfHeight);
  const texel = [0, 0, 0, 0];

  for (const surface of surfaces) {
    const target = layers[surface.layer];
    if (!target) continue;
    const { positions, normals, indices } = surface.mesh;
    const vertexCount = positions.length / 3;
    // Project every vertex once: sample-space x / y (y down) and depth.
    const px = new Float64Array(vertexCount), py = new Float64Array(vertexCount), pd = new Float64Array(vertexCount);
    for (let v = 0; v < vertexCount; v++) {
      const dx = positions[v * 3]! - center[0], dy = positions[v * 3 + 1]! - center[1], dz = positions[v * 3 + 2]! - center[2];
      px[v] = (dx * right[0] + dy * right[1] + dz * right[2] + halfWidth) * toX;
      py[v] = (halfHeight - (dx * up[0] + dy * up[1] + dz * up[2])) * toY;
      pd[v] = dx * forward[0] + dy * forward[1] + dz * forward[2];
    }
    const texture = surface.texture ?? null;
    const alphaTest = (surface.alphaTest ?? (texture ? 0.5 : 0)) * 255;
    const tint = surface.color ?? [1, 1, 1];
    const doubleSided = surface.doubleSided ?? true;
    const uvs = surface.uvs, threshold = surface.threshold;

    for (let t = 0; t + 2 < indices.length; t += 3) {
      let a = indices[t]!, b = indices[t + 1]!, c = indices[t + 2]!;
      // In y-down sample space a front (CCW seen from the camera) triangle has a negative area.
      const area = (px[b]! - px[a]!) * (py[c]! - py[a]!) - (py[b]! - py[a]!) * (px[c]! - px[a]!);
      if (area === 0 || !Number.isFinite(area)) continue;
      const back = area > 0;
      if (back && !doubleSided) continue;
      // Orient every triangle the same way (positive area) for the edge functions and the fill rule.
      if (area < 0) { const swap = b; b = c; c = swap; }
      const total = Math.abs(area);
      const ax = px[a]!, ay = py[a]!, bx = px[b]!, by = py[b]!, cx = px[c]!, cy = py[c]!;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 0.5)), maxX = Math.min(sw - 1, Math.ceil(Math.max(ax, bx, cx) - 0.5));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy) - 0.5)), maxY = Math.min(sh - 1, Math.ceil(Math.max(ay, by, cy) - 0.5));
      if (minX > maxX || minY > maxY) continue;
      // Top-left rule: an edge owns its boundary samples when dy < 0, or dy == 0 and dx > 0; the twin edge of a
      // neighbour runs the other way and does not.
      const owns = (x0: number, y0: number, x1: number, y1: number): boolean => y1 - y0 < 0 || (y1 - y0 === 0 && x1 - x0 > 0);
      const ownA = owns(bx, by, cx, cy), ownB = owns(cx, cy, ax, ay), ownC = owns(ax, ay, bx, by);
      const flip = back ? -1 : 1;
      for (let sy = minY; sy <= maxY; sy++) {
        const y = sy + 0.5;
        for (let sx = minX; sx <= maxX; sx++) {
          const x = sx + 0.5;
          const w0 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
          const w1 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
          const w2 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          if ((w0 === 0 && !ownA) || (w1 === 0 && !ownB) || (w2 === 0 && !ownC)) continue;
          const l0 = w0 / total, l1 = w1 / total, l2 = w2 / total;
          const depth = pd[a]! * l0 + pd[b]! * l1 + pd[c]! * l2;
          if (depth < -halfDepth || depth > halfDepth) continue;
          let r = 255, g = 255, bl = 255, alpha = 255;
          if (texture && uvs) {
            const u = uvs[a * 2]! * l0 + uvs[b * 2]! * l1 + uvs[c * 2]! * l2;
            const v = uvs[a * 2 + 1]! * l0 + uvs[b * 2 + 1]! * l1 + uvs[c * 2 + 1]! * l2;
            sampleTexture(texture, u, v, texel);
            r = texel[0]!; g = texel[1]!; bl = texel[2]!; alpha = texel[3]!;
          }
          if (alpha < alphaTest) continue;
          const index = sy * sw + sx;
          if (threshold) {
            const value = threshold[a]! * l0 + threshold[b]! * l1 + threshold[c]! * l2;
            if (value > target.extra[index]!) target.extra[index] = value;
          } else if (target.extra[index]! < 0) {
            target.extra[index] = 0;
          }
          if (!(depth < target.depth[index]!)) continue;
          target.depth[index] = depth;
          target.color[index * 3] = r * tint[0];
          target.color[index * 3 + 1] = g * tint[1];
          target.color[index * 3 + 2] = bl * tint[2];
          let nx = normals[a * 3]! * l0 + normals[b * 3]! * l1 + normals[c * 3]! * l2;
          let ny = normals[a * 3 + 1]! * l0 + normals[b * 3 + 1]! * l1 + normals[c * 3 + 1]! * l2;
          let nz = normals[a * 3 + 2]! * l0 + normals[b * 3 + 2]! * l1 + normals[c * 3 + 2]! * l2;
          const length = Math.hypot(nx, ny, nz) || 1;
          nx = nx / length * flip; ny = ny / length * flip; nz = nz / length * flip;
          target.normal[index * 3] = nx;
          target.normal[index * 3 + 1] = ny;
          target.normal[index * 3 + 2] = nz;
        }
      }
    }
  }
  return layers.map((layer) => resolve(layer, width, height, ss, halfDepth));
}

function resolve(layer: SampleLayer, width: number, height: number, ss: number, halfDepth: number): RasterLayer {
  const albedo = new Uint8Array(width * height * 4), normal = new Uint8Array(width * height * 4);
  const sw = width * ss, samples = ss * ss;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let covered = 0, r = 0, g = 0, b = 0, nx = 0, ny = 0, nz = 0, depth = 0, extra = -1;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const index = (y * ss + j) * sw + x * ss + i;
      if (layer.extra[index]! > extra) extra = layer.extra[index]!;
      const d = layer.depth[index]!;
      if (d === Infinity) continue;
      covered += 1;
      r += layer.color[index * 3]!; g += layer.color[index * 3 + 1]!; b += layer.color[index * 3 + 2]!;
      nx += layer.normal[index * 3]!; ny += layer.normal[index * 3 + 1]!; nz += layer.normal[index * 3 + 2]!;
      depth += d;
    }
    if (covered === 0) continue;
    const out = (y * width + x) * 4;
    albedo[out] = byte(r / covered); albedo[out + 1] = byte(g / covered); albedo[out + 2] = byte(b / covered);
    albedo[out + 3] = Math.max(1, byte(255 * covered / samples));
    const length = Math.hypot(nx, ny, nz) || 1;
    const [u, v] = octEncode([nx / length, ny / length, nz / length]);
    normal[out] = byte(u * 255); normal[out + 1] = byte(v * 255);
    normal[out + 2] = byte((depth / covered + halfDepth) / (2 * halfDepth) * 255);
    normal[out + 3] = byte(Math.max(0, extra) * 255);
  }
  return { albedo, normal };
}

/**
 * Fills uncovered pixels' rgb (albedo and normal) from covered or already filled neighbours, `passes` rings
 * outward, so filtering and mips do not pull in black. Alpha and `extra` of uncovered pixels stay 0; covered
 * pixels are untouched. In place.
 */
export function dilate(layer: RasterLayer, width: number, height: number, passes: number): void {
  const { albedo, normal } = layer;
  const filled = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) filled[i] = albedo[i * 4 + 3]! > 0 ? 1 : 0;
  for (let pass = 0; pass < passes; pass++) {
    const next: number[] = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (filled[y * width + x]) continue;
      let n = 0;
      const sum = [0, 0, 0, 0, 0, 0];
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const xx = x + i, yy = y + j;
        if ((i === 0 && j === 0) || xx < 0 || yy < 0 || xx >= width || yy >= height || filled[yy * width + xx] !== 1) continue;
        const k = (yy * width + xx) * 4;
        sum[0]! += albedo[k]!; sum[1]! += albedo[k + 1]!; sum[2]! += albedo[k + 2]!;
        sum[3]! += normal[k]!; sum[4]! += normal[k + 1]!; sum[5]! += normal[k + 2]!;
        n += 1;
      }
      if (n === 0) continue;
      const k = (y * width + x) * 4;
      albedo[k] = byte(sum[0]! / n); albedo[k + 1] = byte(sum[1]! / n); albedo[k + 2] = byte(sum[2]! / n);
      normal[k] = byte(sum[3]! / n); normal[k + 1] = byte(sum[4]! / n); normal[k + 2] = byte(sum[5]! / n);
      next.push(y * width + x);
    }
    if (next.length === 0) return;
    for (const index of next) filled[index] = 1;
  }
}
