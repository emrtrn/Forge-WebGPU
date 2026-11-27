// The drawn terrain surface on the CPU (plan phase 5a step 5, decision 4: G8
// "terrain = collider"). The twin of the terrain vertex shader
// (render/materials/terrain.ts `position`, spike S2's TSL port of Forge's
// CDLOD vertex stage): a selected node's patch vertex starts on its grid, its
// morph is read from the 3D distance of that start point to the LOD camera,
// odd grid vertices slide onto the parent grid as it morphs, and the height is
// read at the result from the tile (the collider's b-c diagonal) or from the
// far map (bilinear). A point's height is then the drawn triangle's
// (a-c-b / b-c-d) interpolation, as the rasteriser fills it.
//
// Terrain-local frame throughout (X / Z from the terrain origin, heights
// relative to the datum), as the shader reads them. Skirts hang straight down
// and cover no point from above, so they are left out. Used by the G8 tests:
// the twin against Rapier in Node, the GPU's readback against the twin and the
// collider in the render smoke.

import type { TerrainTileLookup } from "./terrainHeightQuery.ts";

/** One drawn node as the patch instance attributes carry it. */
export interface TerrainDrawnNode {
  /** Terrain-local corner and nominal size; the extent clips it. */
  readonly x0: number;
  readonly z0: number;
  readonly size: number;
  /** The tile drawn from its slot at full resolution; null: the far map stands in. */
  readonly tile: { readonly x: number; readonly z: number } | null;
  /** Morph start and end, 3D distance from the LOD camera. */
  readonly morph: readonly [number, number];
}

export interface TerrainVisualSurface {
  readonly tileQuads: number;
  readonly spacing: number;
  /** Terrain-local X / Z that is drawn. */
  readonly extent: readonly [number, number];
  readonly patchQuads: number;
  /** The tiles the slots hold. */
  readonly tiles: TerrainTileLookup;
  /** The far map as the GPU reads it (holes filled), row-major, relative to the datum. */
  readonly global: { readonly width: number; readonly height: number; readonly spacing: number; readonly heights: Float32Array };
  /** Terrain-local LOD camera the morph reads. */
  readonly camera: readonly [number, number, number];
  /** W7: optional render-only snow above the morphed base vertex. */
  readonly snowOffset?: (node: TerrainDrawnNode, x: number, y: number, z: number) => number;
}

export interface TerrainVisualSample {
  /** Height relative to the datum. */
  readonly height: number;
  readonly node: TerrainDrawnNode;
  /** Largest morph of the drawn triangle's three vertices (0: on the node's own grid). */
  readonly morph: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** The shader's terrainHeight: the tile's triangle (b-c diagonal) or the far map's bilinear sample. */
export function terrainShaderHeight(surface: TerrainVisualSurface, node: TerrainDrawnNode, x: number, z: number): number {
  if (node.tile) {
    const tile = surface.tiles.tile(node.tile.x, node.tile.z);
    if (!tile) throw new Error(`terrain visual height: tile ${node.tile.x}_${node.tile.z} is not resident`);
    const tileSize = surface.tileQuads * surface.spacing;
    const gx = (x - node.tile.x * tileSize) / surface.spacing;
    const gz = (z - node.tile.z * tileSize) / surface.spacing;
    const bx = Math.floor(gx);
    const bz = Math.floor(gz);
    const fx = gx - bx;
    const fz = gz - bz;
    const last = tile.size - 1;
    const texel = (cx: number, cz: number) => tile.heights[clamp(cz, 0, last) * tile.size + clamp(cx, 0, last)]!;
    const ha = texel(bx, bz);
    const hb = texel(bx + 1, bz);
    const hc = texel(bx, bz + 1);
    const hd = texel(bx + 1, bz + 1);
    return fx + fz <= 1 ? ha + (hb - ha) * fx + (hc - ha) * fz : hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }
  const { global } = surface;
  const gx = x / global.spacing;
  const gz = z / global.spacing;
  const bx = Math.floor(gx);
  const bz = Math.floor(gz);
  const fx = gx - bx;
  const fz = gz - bz;
  const texel = (cx: number, cz: number) => global.heights[clamp(cz, 0, global.height - 1) * global.width + clamp(cx, 0, global.width - 1)]!;
  const top = texel(bx, bz) + (texel(bx + 1, bz) - texel(bx, bz)) * fx;
  const bottom = texel(bx, bz + 1) + (texel(bx + 1, bz + 1) - texel(bx, bz + 1)) * fx;
  return top + (bottom - top) * fz;
}

/** The shader's vertex for patch grid point (`ix`, `iz`) of `node`: terrain-local X, height, Z and its morph. */
export function terrainVisualVertex(surface: TerrainVisualSurface, node: TerrainDrawnNode, ix: number, iz: number): { x: number; y: number; z: number; morph: number } {
  const [width, depth] = surface.extent;
  const q = surface.patchQuads;
  const sx = node.x0 + (ix / q) * node.size;
  const sz = node.z0 + (iz / q) * node.size;
  const h0 = terrainShaderHeight(surface, node, clamp(sx, 0, width), clamp(sz, 0, depth));
  const [cx, cy, cz] = surface.camera;
  const span = node.morph[1] - node.morph[0];
  const morph = clamp((Math.hypot(sx - cx, h0 - cy, sz - cz) - node.morph[0]) / span, 0, 1);
  // Odd grid vertices slide onto the even (parent) grid as morph -> 1.
  const x = clamp(sx - (ix % 2) * (node.size / q) * morph, 0, width);
  const z = clamp(sz - (iz % 2) * (node.size / q) * morph, 0, depth);
  const baseY = terrainShaderHeight(surface, node, x, z);
  return { x, y: baseY + (surface.snowOffset?.(node, x, baseY, z) ?? 0), z, morph };
}

/** The drawn node covering terrain-local (`x`, `z`); null outside the drawn extent or in a hole. */
export function terrainDrawnNodeAt(nodes: readonly TerrainDrawnNode[], x: number, z: number): TerrainDrawnNode | null {
  for (const node of nodes) {
    if (x >= node.x0 && x < node.x0 + node.size && z >= node.z0 && z < node.z0 + node.size) return node;
  }
  return null;
}

/**
 * The drawn height at terrain-local (`x`, `z`): the triangle of the covering
 * node's morphed patch that holds the point, interpolated. Null where no node
 * draws (a hole, outside the extent).
 */
export function terrainVisualSample(surface: TerrainVisualSurface, nodes: readonly TerrainDrawnNode[], x: number, z: number): TerrainVisualSample | null {
  const [width, depth] = surface.extent;
  if (x < 0 || z < 0 || x > width || z > depth) return null;
  const node = terrainDrawnNodeAt(nodes, x, z);
  if (!node) return null;
  const q = surface.patchQuads;
  const gx = Math.floor(((x - node.x0) / node.size) * q);
  const gz = Math.floor(((z - node.z0) / node.size) * q);
  // A morph moves a vertex at most one cell towards -X / -Z: the point's triangle is in this cell or the next.
  for (let cz = Math.max(0, gz - 1); cz <= Math.min(q - 1, gz + 1); cz += 1) {
    for (let cx = Math.max(0, gx - 1); cx <= Math.min(q - 1, gx + 1); cx += 1) {
      const a = terrainVisualVertex(surface, node, cx, cz);
      const b = terrainVisualVertex(surface, node, cx + 1, cz);
      const c = terrainVisualVertex(surface, node, cx, cz + 1);
      const d = terrainVisualVertex(surface, node, cx + 1, cz + 1);
      for (const [p, r, s] of [[a, c, b], [b, c, d]] as const) {
        const area = (r.x - p.x) * (s.z - p.z) - (s.x - p.x) * (r.z - p.z);
        if (Math.abs(area) < 1e-12) continue;
        const u = ((x - p.x) * (s.z - p.z) - (s.x - p.x) * (z - p.z)) / area;
        const v = ((r.x - p.x) * (z - p.z) - (x - p.x) * (r.z - p.z)) / area;
        if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
        return { height: p.y + (r.y - p.y) * u + (s.y - p.y) * v, node, morph: Math.max(p.morph, r.morph, s.morph) };
      }
    }
  }
  return null;
}
