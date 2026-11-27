import { DataUtils } from "three/webgpu";
import { LAYER_WEATHER_DEFAULTS } from "../../engine/environment/layerWeather.ts";
import { cavityFromDivergence, smoothstep } from "../../engine/environment/surfaceResponse.ts";
import { terrainSnowCoverAt, terrainSnowShare, type TerrainSnowRay } from "../../engine/environment/terrainSnow.ts";
import { TERRAIN_RENDER_LAYERS, TERRAIN_WEIGHT_BLOCKS } from "../../engine/terrain/terrainRenderData.ts";
import type { TerrainVisualSurface } from "../../engine/terrain/terrainVisualHeight.ts";
import type { SurfaceCoverInput } from "../materials/surfaceCover.ts";
import type { TerrainLayerInput } from "../resources/terrains.ts";

interface SnowGrid {
  readonly width: number;
  readonly height: number;
  readonly spacing: number;
  readonly normals: Uint16Array;
  readonly weights: Uint8Array;
  readonly normalStride: number;
}

function bilinear(x: number, z: number, grid: SnowGrid, at: (index: number) => number): number {
  const sx = Math.max(0, Math.min(grid.width - 1, x));
  const sz = Math.max(0, Math.min(grid.height - 1, z));
  const x0 = Math.floor(sx), x1 = Math.min(grid.width - 1, x0 + 1);
  const z0 = Math.floor(sz), z1 = Math.min(grid.height - 1, z0 + 1);
  const fx = sx - x0, fz = sz - z0;
  const a = at(z0 * grid.width + x0), b = at(z0 * grid.width + x1);
  const c = at(z1 * grid.width + x0), d = at(z1 * grid.width + x1);
  const top = a + (b - a) * fx;
  return top + (c + (d - c) * fx - top) * fz;
}

export interface TerrainSnowSampling {
  readonly origin: readonly [number, number, number];
  readonly tile: Omit<SnowGrid, "normalStride">;
  readonly far: Omit<SnowGrid, "normalStride">;
  readonly tileSlot: (x: number, z: number) => number;
  readonly layers: readonly TerrainLayerInput[];
  readonly cover: SurfaceCoverInput;
  readonly ray?: TerrainSnowRay;
}

/** The height probe's CPU sampler reads the same packed normals and paint as the vertex shader. */
export function terrainSnowOffset(input: TerrainSnowSampling): NonNullable<TerrainVisualSurface["snowOffset"]> {
  const tile = { ...input.tile, normalStride: 2 };
  const far = { ...input.far, normalStride: 4 };
  const acceptance = input.layers.slice(0, TERRAIN_RENDER_LAYERS).map((layer) => layer.weather?.snowAccept ?? LAYER_WEATHER_DEFAULTS.snowAccept);
  const [ox, oy, oz] = input.origin;
  const { snowCoverage, snowDepth } = input.cover.state;
  const cache = new Map<string, number>();
  return (node, x, y, z) => {
    const slot = node.tile ? input.tileSlot(node.tile.x, node.tile.z) : -1;
    const key = `${slot}/${x}/${y}/${z}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const grid = slot < 0 ? far : tile;
    const count = grid.width * grid.height;
    const tileSize = (tile.width - 1) * tile.spacing;
    const gx = (x - (node.tile?.x ?? 0) * tileSize) / grid.spacing;
    const gz = (z - (node.tile?.z ?? 0) * tileSize) / grid.spacing;
    const normalsStart = Math.max(0, slot) * count * grid.normalStride;
    const normal = (sx: number, sz: number, component: number): number => bilinear(sx, sz, grid,
      (i) => DataUtils.fromHalfFloat(grid.normals[normalsStart + i * grid.normalStride + component]!));
    const nx = normal(gx, gz, 0), nz = normal(gx, gz, 1);
    const normalY = Math.sqrt(Math.max(1 - nx * nx - nz * nz, 0));
    const edge = Math.min(gx, gz, tile.width - 1 - gx, tile.height - 1 - gz);
    const cavity = slot < 0 ? 0 : cavityFromDivergence((normal(gx + 1, gz, 0) - nx + normal(gx, gz + 1, 1) - nz) / grid.spacing)
      * smoothstep(0, 1, edge);
    let weighted = 0, total = 0;
    for (const [layer, share] of acceptance.entries()) {
      const block = Math.max(0, slot) * TERRAIN_WEIGHT_BLOCKS + Math.floor(layer / 4);
      const channel = layer % 4;
      const weight = bilinear(gx, gz, grid, (i) => grid.weights[(block * count + i) * 4 + channel]! / 255);
      total += weight;
      weighted += weight * share;
    }
    const position = [ox + x, oy + y, oz + z] as const;
    const covered = input.ray ? terrainSnowCoverAt(position, tile.spacing, input.ray) : 0;
    const snowAccept = total > 0.0001 ? weighted / total : acceptance[0] ?? 1;
    const rise = snowDepth * terrainSnowShare(snowCoverage, input.cover.settings, { position, normalY, cavity, snowAccept, covered });
    cache.set(key, rise);
    return rise;
  };
}
