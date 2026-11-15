// Forge WebGL's static terrain detail (engine/render-three/terrain/
// terrainStaticDetail.ts @ forge-webgl-final, GLSL) in TSL, plan phase 5a
// step 3: seeded, static normal stamps. Long overlapping patches preserve
// directional patterns while varying coverage, phase, orientation, variant
// and wear; atlas variants are separate array slices (terrainLayerArray.ts),
// so repeat / mip filtering is safe. Every choice depends on the terrain
// position and the seed only: never the tile slot, the camera, the frame or
// the paint rebuild order.
//
// GLSL's `mat2(c, -s, s, c) * v` (column-major) is `rotate(v, a)` here:
// (c·x + s·y, -s·x + c·y). The stamp is chosen without branching (selects),
// so the texture read and its derivatives stay in uniform control flow.

import * as TSLTyped from "three/tsl";
import type { DataArrayTexture } from "three/webgpu";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>;
const { abs, cos, dot, float, floor, fract, length, max, mix, normalize, select, sin, smoothstep, texture, vec2, vec3, vec4 } = TSL;

/** One layer's detail (Forge's uLayerDetail* uniforms, constant per terrain). */
export interface TerrainDetailParams {
  /** Array slice of the (first) variant. */
  readonly index: number;
  /** 1 or 2: variants are `grid²` consecutive slices. */
  readonly grid: number;
  /** Detail repeat over the layer's UV (x, y). */
  readonly uv: readonly [number, number];
  readonly strength: number;
  readonly coverage: number;
  /** Metres. */
  readonly patchSize: number;
  readonly seed: number;
  /** Radians. */
  readonly direction: number;
  /** Radians. */
  readonly directionVariation: number;
}

/** Forge's forgeDetailHash: a 2D -> [0, 1) hash. */
export function detailHash(p: AnyNode): AnyNode {
  let q = fract(vec3(p.x, p.y, p.x).mul(0.1031));
  q = q.add(dot(q, vec3(q.y, q.z, q.x).add(33.33)));
  return fract(q.x.add(q.y).mul(q.z));
}

function detailNoise(p: AnyNode): AnyNode {
  const i = floor(p);
  const f0 = fract(p);
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(
    mix(detailHash(i), detailHash(i.add(vec2(1, 0))), f.x),
    mix(detailHash(i.add(vec2(0, 1))), detailHash(i.add(vec2(1, 1))), f.x),
    f.y,
  );
}

/** GLSL `mat2(c, -s, s, c) * v` for angle `a`. */
function rotate(v: AnyNode, c: AnyNode, s: AnyNode): AnyNode {
  return vec2(v.x.mul(c).add(v.y.mul(s)), v.x.mul(s).negate().add(v.y.mul(c)));
}

/**
 * A layer's detail at terrain-local `p` (`dx` / `dy` its screen derivatives,
 * `uvScale` the layer's UV per metre times the detail repeat): xyz the stamp
 * normal (tangent space, z up), w its relief (blends the layer's roughness
 * toward the detail's). Flat (0, 0, 1, 0) where no stamp covers `p`.
 */
export function terrainStaticDetail(normals: DataArrayTexture, p: AnyNode, dx: AnyNode, dy: AnyNode, uvScale: AnyNode, detail: TerrainDetailParams): AnyNode {
  const flat = vec4(0, 0, 1, 0);
  if (detail.index < 0 || detail.strength <= 0 || detail.coverage <= 0) return flat;
  const dc = float(Math.cos(detail.direction));
  const ds = float(Math.sin(detail.direction));
  const oriented = rotate(p, dc, ds);
  const span = vec2(detail.patchSize, detail.patchSize * 3);
  const cell = floor(oriented.div(span));
  let bestWeight: AnyNode = float(0);
  let bestKey: AnyNode = vec2(0, 0);
  let bestLocal: AnyNode = vec2(0, 0);
  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      const id = cell.add(vec2(x, y));
      const key = id.add(vec2(detail.seed, detail.seed * 0.37));
      const jitter = vec2(detailHash(key.add(17)), detailHash(key.add(31))).sub(0.5);
      const local = oriented.sub(id.add(jitter.mul(0.2)).mul(span));
      const edge = float(1).sub(smoothstep(vec2(0.25, 0.25), vec2(0.85, 0.85), abs(local.div(span))));
      const covered = detailHash(key).lessThan(detail.coverage);
      const weight = select(covered, edge.x.mul(edge.y), float(0));
      const better = weight.greaterThan(bestWeight);
      bestKey = select(better, key, bestKey);
      bestLocal = select(better, local, bestLocal);
      bestWeight = select(better, weight, bestWeight);
    }
  }
  const key = bestKey;
  const angle = detailHash(key.add(9)).mul(2).sub(1).mul(detail.directionVariation);
  const tc = cos(angle);
  const ts = sin(angle);
  // rotation = turn · direction; transpose(rotation) = direction^T · turn^T.
  const rotation = (v: AnyNode): AnyNode => rotate(rotate(v, dc, ds), tc, ts);
  const rotationT = (v: AnyNode): AnyNode => rotate(rotate(v, tc, ts.negate()), dc, ds.negate());
  const sizeVariation = mix(float(0.9), float(1.1), detailHash(key.add(43)));
  const scale = uvScale.mul(sizeVariation);
  const uv = rotate(bestLocal, tc, ts).mul(scale).add(vec2(detailHash(key.add(51)), detailHash(key.add(73))));
  const variant = floor(detailHash(key.add(101)).mul(detail.grid * detail.grid));
  const sample = texture(normals, uv).depth(variant.add(detail.index)).grad(rotation(dx).mul(scale), rotation(dy).mul(scale));
  const n = normalize(sample.xyz.mul(2).sub(1));
  // Rotate normal directions as well as UVs, or highlights rotate incorrectly.
  const slope = rotationT(n.xy);
  const wear = mix(float(0.5), float(1), detailNoise(oriented.div(vec2(1.7, 3.1)).add(key)));
  const fade = smoothstep(float(0), float(0.25), bestWeight);
  const slopes = slope.div(max(n.z, float(0.2))).mul(detail.strength).mul(wear).mul(fade);
  const relief = smoothstep(float(0.025), float(0.15), length(n.xy)).mul(wear).mul(fade);
  const stamped = vec4(normalize(vec3(slopes, 1)), relief);
  return select(bestWeight.greaterThan(0.001), stamped, flat);
}
