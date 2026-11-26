// Ported from Forge WebGL engine/scene/proceduralFoliage.ts @ forge-webgl-final (04b5fb23); generation-only boundary.
/** Deterministic, render-agnostic foliage generation over resident ground surfaces. */
import {
  terrainHeightAt, terrainSmoothNormalAt, terrainLayerWeightsAt, TerrainTileMap,
  type TerrainQueryDef, type TerrainTileLookup,
} from "../terrain/terrainHeightQuery.ts";
import type { TerrainTileData } from "../terrain/terrainTypes.ts";
import { terrainMaskAt } from "../terrain/terrainMask.ts";
import type { FoliageTypeParams } from "./foliageTypeParams.ts";
import type { TerrainMaskBands } from "../terrain/terrainMask.ts";
import type { TerrainGlobalMap } from "../terrain/terrainGlobalMap.ts";
import { foliageCellSeed } from "./foliageHash.ts";
import { makeFoliageRng, passesFoliageFilters, surfaceSlopeDegrees } from "./foliageRoll.ts";
import { forEachStandSlot, type FoliageStandParams } from "./foliageStand.ts";
import type { Vec3 } from "../../core/schema/fields.ts";

export interface FoliageSurface {
  /** Exact collider height at world X/Z, or null off-surface / not resident. */
  heightAt(x: number, z: number): number | null;
  /** Unit normal for alignment at world X/Z, or null. */
  normalAt(x: number, z: number): Vec3 | null;
  /** Layer paint weight 0..1, or null for an unknown layer / off-surface. */
  layerWeightAt(layerId: string, x: number, z: number): number | null;
  /** World X/Z bounds of the surface. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** World Terrain surface over the resident tiles. */
export function worldTerrainFoliageSurface(
  def: TerrainQueryDef & { layers: readonly { id: string }[] },
  tiles: TerrainTileLookup,
): FoliageSurface {
  return {
    heightAt: (x, z) => terrainHeightAt(def, tiles, x, z),
    normalAt: (x, z) => terrainSmoothNormalAt(def, tiles, x, z),
    layerWeightAt: (layerId, x, z) => {
      const index = def.layers.findIndex((layer) => layer.id === layerId);
      if (index < 0) return null;
      const weights = terrainLayerWeightsAt(def, tiles, x, z);
      return weights === null ? null : weights[index] ?? 0;
    },
    bounds: {
      minX: def.origin[0], maxX: def.origin[0] + def.tilesX * def.tileQuads * def.spacing,
      minZ: def.origin[2], maxZ: def.origin[2] + def.tilesZ * def.tileQuads * def.spacing,
    },
  };
}

/** The global map shape a far surface reads (`TerrainGlobalAttributes` without the render import). */
export interface FoliageGlobalMap {
  /** Heights are world-space, matching this repo's TerrainGlobalMap. */
  map: TerrainGlobalMap;
  /** Per sample: normal X, normal Z, hole flag. */
  normals: Float32Array;
  /** RGBA8 blocks of `width × height` texels, block-major (layer `b*4+c`). */
  weights: Uint8Array;
}

/**
 * A surface over the terrain's global map (one sample per `stride` vertices,
 * always resident), preferring the exact resident tiles where they exist. Far
 * foliage grows on it: away from the camera the tiles are streamed out, near
 * it the plants match the exact ring. `exact` reports whether every query so
 * far was answered from tiles.
 */
export function globalFoliageSurface(
  def: TerrainQueryDef & { layers: readonly { id: string }[] },
  global: FoliageGlobalMap,
  tiles: TerrainTileLookup,
): FoliageSurface & { exact: boolean } {
  const exactSurface = worldTerrainFoliageSurface(def, tiles);
  const { width, height, stride, heights } = global.map;
  const step = stride * def.spacing;
  const texels = width * height;
  const sample = (x: number, z: number): { i: number; fx: number; fz: number } | null => {
    const gx = (x - def.origin[0]) / step, gz = (z - def.origin[2]) / step;
    if (!(gx >= 0 && gz >= 0 && gx <= width - 1 && gz <= height - 1)) return null;
    const ix = Math.min(Math.floor(gx), width - 2), iz = Math.min(Math.floor(gz), height - 2);
    return { i: iz * width + ix, fx: gx - ix, fz: gz - iz };
  };
  const bilinear = (read: (i: number) => number, at: { i: number; fx: number; fz: number }): number | null => {
    const a = read(at.i), b = read(at.i + 1), c = read(at.i + width), d = read(at.i + width + 1);
    if (![a, b, c, d].every(Number.isFinite)) return null;
    return (a + (b - a) * at.fx) * (1 - at.fz) + (c + (d - c) * at.fx) * at.fz;
  };
  const surface: FoliageSurface & { exact: boolean } = {
    exact: true,
    heightAt: (x, z) => {
      const exact = exactSurface.heightAt(x, z);
      if (exact !== null) return exact;
      surface.exact = false;
      const at = sample(x, z);
      const local = at ? bilinear((i) => heights[i]!, at) : null;
      return local;
    },
    normalAt: (x, z) => {
      const exact = exactSurface.normalAt(x, z);
      if (exact !== null) return exact;
      surface.exact = false;
      const at = sample(x, z);
      if (!at) return null;
      const nx = bilinear((i) => global.normals[i * 3]!, at), nz = bilinear((i) => global.normals[i * 3 + 1]!, at);
      if (nx === null || nz === null) return null;
      return [nx, Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz)), nz];
    },
    layerWeightAt: (layerId, x, z) => {
      const exact = exactSurface.layerWeightAt(layerId, x, z);
      if (exact !== null) return exact;
      const layer = def.layers.findIndex((entry) => entry.id === layerId);
      if (layer < 0) return null;
      surface.exact = false;
      const at = sample(x, z);
      if (!at) return null;
      const base = Math.floor(layer / 4) * texels * 4, channel = layer % 4;
      const weight = bilinear((i) => global.weights[base + i * 4 + channel]! / 255, at);
      return weight;
    },
    bounds: exactSurface.bounds,
  };
  return surface;
}

export { foliageCellSeed };
export const MAX_FOLIAGE_CELL_INSTANCES = 4096;

export interface FoliageCellRequest {
  cellX: number;
  cellZ: number;
  /** Covers [cellX*cellSize, (cellX+1)*cellSize) on X, likewise Z; origin 0,0. */
  cellSize: number;
  /** Keep a candidate only when its fixed random value r < keepFraction (0..1). */
  keepFraction: number;
  /** Defaults to MAX_FOLIAGE_CELL_INSTANCES. */
  maxInstances?: number;
}

export interface GeneratedFoliageCell {
  count: number;
  /** Exactly count * 16 floats, column-major per instance. */
  matrices: Float32Array;
}

/** Copied terrain state shared by worker and same-thread foliage generators. */
export class FoliageTerrainStore {
  private readonly terrains = new Map<string, {
    def: TerrainQueryDef & { layers: readonly { id: string }[] };
    tiles: TerrainTileMap;
  }>();

  setTerrain(terrainId: string, def: TerrainQueryDef & { layers: readonly { id: string }[] }): void {
    this.terrains.set(terrainId, { def: {
      ...def, origin: [...def.origin], layers: def.layers.map((layer) => ({ id: layer.id })),
    }, tiles: new TerrainTileMap() });
  }

  setTile(terrainId: string, tile: TerrainTileData): void {
    const terrain = this.terrains.get(terrainId);
    if (!terrain) throw new Error(`Unknown foliage terrain: ${terrainId}`);
    terrain.tiles.set({ ...tile, heights: tile.heights.slice(), weights: tile.weights.slice() });
  }

  removeTile(terrainId: string, x: number, z: number): void {
    this.terrains.get(terrainId)?.tiles.delete(x, z);
  }

  removeTerrain(terrainId: string): void { this.terrains.delete(terrainId); }

  generate(terrainId: string, rule: FoliageRuleParams, type: FoliageTypeParams,
    request: FoliageCellRequest): GeneratedFoliageCell {
    const terrain = this.terrains.get(terrainId);
    if (!terrain) throw new Error(`Unknown foliage terrain: ${terrainId}`);
    return generateFoliageCell(rule, type, worldTerrainFoliageSurface(terrain.def, terrain.tiles), request);
  }

  clear(): void { this.terrains.clear(); }
}

function writeMatrix(matrices: Float32Array, at: number, x: number, y: number, z: number,
  normal: Vec3, align: boolean, yaw: number, scale: number, offset: number): void {
  let [ux, uy, uz]: Vec3 = align ? normal : [0, 1, 0];
  const length = Math.hypot(ux, uy, uz);
  if (length * length < 1e-8) { ux = 0; uy = 1; uz = 0; }
  else { ux = ux / length; uy = uy / length; uz = uz / length; }
  // setFromUnitVectors((0,1,0), up), including three.js's antiparallel branch.
  let ax = uz;
  let ay = 0;
  let az = -ux;
  let aw = uy + 1;
  if (aw < Number.EPSILON) { ax = 0; ay = -uz; az = uy; aw = 0; }
  const inverse = 1 / Math.hypot(ax, ay, az, aw);
  ax *= inverse; ay *= inverse; az *= inverse; aw *= inverse;
  const sy = Math.sin(yaw / 2);
  const cy = Math.cos(yaw / 2);
  const qx = ax * cy - az * sy;
  const qy = ay * cy + aw * sy;
  const qz = az * cy + ax * sy;
  const qw = aw * cy - ay * sy;
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  matrices[at] = (1 - (yy + zz)) * scale;
  matrices[at + 1] = (xy + wz) * scale;
  matrices[at + 2] = (xz - wy) * scale;
  matrices[at + 3] = 0;
  matrices[at + 4] = (xy - wz) * scale;
  matrices[at + 5] = (1 - (xx + zz)) * scale;
  matrices[at + 6] = (yz + wx) * scale;
  matrices[at + 7] = 0;
  matrices[at + 8] = (xz + wy) * scale;
  matrices[at + 9] = (yz - wx) * scale;
  matrices[at + 10] = (1 - (xx + yy)) * scale;
  matrices[at + 11] = 0;
  matrices[at + 12] = x + ux * offset;
  matrices[at + 13] = y + uy * offset;
  matrices[at + 14] = z + uz * offset;
  matrices[at + 15] = 1;
}

/**
 * Generates stable jittered candidates, consuming six random draws before any rejection
 * (a `stand` rule: the stand's slots, foliageStand.ts). The rule's height/slope/noise bands
 * and the ramps of its paint weight give each candidate a 0..1 mask; it stays only while its
 * fixed `r < keepFraction × mask`, so a narrower band or a lower mask only removes plants and
 * never moves the others. `edgeScale` shrinks a plant toward the band edge
 * (`scale × lerp(edgeScale, 1, mask)`).
 */
export function generateFoliageCell(
  rule: FoliageRuleParams,
  type: FoliageTypeParams,
  surface: FoliageSurface,
  request: FoliageCellRequest,
): GeneratedFoliageCell {
  const { cellX, cellZ, cellSize, keepFraction } = request;
  if (rule.density <= 0 || keepFraction <= 0 || cellSize <= 0) return { count: 0, matrices: new Float32Array(0) };
  const maxInstances = Math.max(0, Math.floor(request.maxInstances ?? MAX_FOLIAGE_CELL_INSTANCES));
  const bands = landscapeFoliageRuleIsUnbanded(rule) ? null : landscapeFoliageRuleBands(rule);
  const ramped = foliageRuleHasWeightRamps(rule);
  const edgeScale = rule.edgeScale ?? LANDSCAPE_FOLIAGE_RULE_BAND_DEFAULTS.edgeScale;
  const groundRadius = type.alignToNormal ? 0 : rule.groundRadius ?? 0;
  const noiseSeed = rule.seed | 0;
  const minX = cellX * cellSize, minZ = cellZ * cellSize;
  const perSide = Math.max(1, Math.round(cellSize * Math.sqrt(rule.density)));
  // A stand's slots vary a little from cell to cell round the share's count.
  const candidates = rule.stand ? Math.ceil(foliageRuleDensity(rule) * cellSize * cellSize * 2) + 64 : perSide * perSide;
  const limit = Math.min(candidates, maxInstances);
  const matrices = new Float32Array(limit * 16);
  let count = 0;
  const place = (x: number, z: number, r: number, scaleT: number, yawT: number, offsetT: number): void => {
    if (r >= keepFraction) return;
    const weight = surface.layerWeightAt(rule.layerId, x, z);
    if (weight === null || weight + 1e-6 < rule.minWeight) return;
    let mask = ramped ? foliageRuleWeightMask(rule, weight) : 1;
    if (r >= keepFraction * mask) return;
    const y = surface.heightAt(x, z);
    const n = surface.normalAt(x, z);
    if (y === null || n === null || !passesFoliageFilters(type, { position: [x, y, z], normal: n })) return;
    if (bands) {
      mask *= terrainMaskAt(bands, y, surfaceSlopeDegrees(n), x, z, noiseSeed);
      if (r >= keepFraction * mask) return;
    }
    const edge = bands || ramped ? edgeScale + (1 - edgeScale) * mask : 1;
    const scale = (type.scaleMin[0] + (type.scaleMax[0] - type.scaleMin[0]) * scaleT) * edge;
    const yaw = type.randomYaw ? yawT * 2 * Math.PI : 0;
    const offset = type.zOffsetMin + (type.zOffsetMax - type.zOffsetMin) * offsetT;
    // Seat the open trunk base at the downhill rim of its footprint. The
    // normal estimates the local slope without a second, possibly unloaded tile.
    const groundDrop = groundRadius > 0
      ? scale * groundRadius * Math.hypot(n[0], n[2]) / Math.max(n[1], 0.5)
      : 0;
    writeMatrix(matrices, count * 16, x, y - groundDrop, z, n, type.alignToNormal, yaw, scale, offset);
    count += 1;
  };
  if (rule.stand) {
    forEachStandSlot(rule.seed, rule.density, rule.stand, minX, minZ, minX + cellSize, minZ + cellSize, (slot) => {
      place(slot.x, slot.z, slot.r, slot.scaleT, slot.yawT, slot.offsetT);
      return count < limit;
    });
    return { count, matrices: matrices.slice(0, count * 16) };
  }
  const rng = makeFoliageRng(foliageCellSeed(rule.seed, cellX, cellZ));
  const step = cellSize / perSide;
  for (let row = 0; row < perSide && count < limit; row += 1) {
    for (let col = 0; col < perSide && count < limit; col += 1) {
      const jx = rng(), jz = rng(), r = rng(), scaleT = rng(), yawT = rng(), offsetT = rng();
      place(minX + (col + jx) * step, minZ + (row + jz) * step, r, scaleT, yawT, offsetT);
    }
  }
  return { count, matrices: matrices.slice(0, count * 16) };
}

export interface FoliageBlockRequest {
  /** Block grid coordinates; a block covers `cellsPerSide²` ring cells. */
  blockX: number;
  blockZ: number;
  /** The rule's ring cell size: the block is generated cell by cell, so a plant sits where the ring puts it. */
  cellSize: number;
  cellsPerSide: number;
  keepFraction: number;
}

/**
 * The ring cells of one block generated and packed together (far billboards draw
 * a block as one batch). Same seeds and cells as the ring, so at the hand-off a
 * billboard stands exactly where its model stood.
 */
export function generateFoliageBlock(
  rule: FoliageRuleParams,
  type: FoliageTypeParams,
  surface: FoliageSurface,
  request: FoliageBlockRequest,
): GeneratedFoliageCell {
  const { blockX, blockZ, cellSize, cellsPerSide, keepFraction } = request;
  const parts: GeneratedFoliageCell[] = [];
  let count = 0;
  for (let z = 0; z < cellsPerSide; z += 1) {
    for (let x = 0; x < cellsPerSide; x += 1) {
      const cell = generateFoliageCell(rule, type, surface, {
        cellX: blockX * cellsPerSide + x, cellZ: blockZ * cellsPerSide + z, cellSize, keepFraction,
      });
      if (cell.count === 0) continue;
      parts.push(cell);
      count += cell.count;
    }
  }
  const matrices = new Float32Array(count * 16);
  let at = 0;
  for (const part of parts) { matrices.set(part.matrices, at); at += part.matrices.length; }
  return { count, matrices };
}

export interface FoliageFarTintSource {
  rule: FoliageRuleParams;
  type: FoliageTypeParams;
  /** The plants' mean colour, linear RGB 0..1. */
  color: readonly [number, number, number];
  /** Ground one plant's crown covers at scale 1, m². */
  footprint: number;
}

/** Seen low and from far, crowns hide far more ground than they cover from above. */
const FAR_TINT_OVERLAP = 4;

export interface FoliageFarTintMap {
  /** Per global map sample, 0..1: how much ground the plants hide. */
  coverage: Float32Array;
  /** The plants' colour, coverage-weighted over the map (linear RGB). */
  color: [number, number, number];
}

/**
 * Far foliage tint over a terrain's global map: per sample, how much ground
 * the rules' plants hide — `farTint × (1 − e^(−4 · density · footprint · scale²))`
 * where the rule's layer, bands and the type's own limits hold, rules combined
 * as layers over each other — and their mean colour. Null when no rule's type
 * has a far tint.
 */
export function foliageFarTintMap(
  def: TerrainQueryDef & { layers: readonly { id: string }[] },
  global: FoliageGlobalMap,
  sources: readonly FoliageFarTintSource[],
): FoliageFarTintMap | null {
  const active = sources
    .map((source) => ({
      ...source,
      layer: def.layers.findIndex((layer) => layer.id === source.rule.layerId),
      strength: Math.min(1, Math.max(0, source.type.farTint ?? 0)),
      bands: landscapeFoliageRuleIsUnbanded(source.rule) ? null : landscapeFoliageRuleBands(source.rule),
      scale: (source.type.scaleMin[0] + source.type.scaleMax[0]) / 2,
    }))
    .filter((source) => source.strength > 0 && source.layer >= 0);
  if (active.length === 0) return null;
  const { width, height, stride, heights } = global.map;
  const step = stride * def.spacing;
  const texels = width * height;
  const coverage = new Float32Array(texels);
  let r = 0, g = 0, b = 0, sum = 0;
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const i = iz * width + ix;
      const local = heights[i]!;
      if (!Number.isFinite(local)) continue;
      const x = def.origin[0] + ix * step, z = def.origin[2] + iz * step, y = local;
      const nx = global.normals[i * 3]!, nz = global.normals[i * 3 + 1]!;
      const normal: Vec3 = [nx, Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz)), nz];
      const slope = surfaceSlopeDegrees(normal);
      let clear = 1;
      for (const source of active) {
        const weight = global.weights[(Math.floor(source.layer / 4) * texels + i) * 4 + source.layer % 4]! / 255;
        if (weight + 1e-6 < source.rule.minWeight) continue;
        if (!passesFoliageFilters(source.type, { position: [x, y, z], normal })) continue;
        const mask = (source.bands ? terrainMaskAt(source.bands, y, slope, x, z, source.rule.seed | 0) : 1) * foliageRuleWeightMask(source.rule, weight);
        const cover = 1 - Math.exp(-FAR_TINT_OVERLAP * foliageRuleDensity(source.rule) * source.footprint * source.scale * source.scale);
        const alpha = source.strength * cover * mask;
        if (!(alpha > 0)) continue;
        clear *= 1 - alpha;
        r += source.color[0] * alpha; g += source.color[1] * alpha; b += source.color[2] * alpha; sum += alpha;
      }
      coverage[i] = 1 - clear;
    }
  }
  const first = active[0]!.color;
  return { coverage, color: sum > 0 ? [r / sum, g / sum, b / sum] : [first[0], first[1], first[2]] };
}

/** Only generation inputs; asset and landscape identities belong to the caller. */
export interface FoliageRuleParams {
  layerId: string;
  density: number;
  minWeight: number;
  seed: number;
  heightMin?: number;
  heightMax?: number;
  heightFalloff?: number;
  slopeMin?: number;
  slopeMax?: number;
  slopeFalloff?: number;
  noiseAmount?: number;
  noiseScale?: number;
  edgeScale?: number;
  /** Model-space base radius (metres) of upright trunks to seat on slopes. */
  groundRadius?: number;
  /** Paint weight over `minWeight` at which the rule has its full density (absent: at once). */
  fadeIn?: number;
  /** Paint weight above which the rule thins out over `fadeOut` (absent: never). */
  maxWeight?: number;
  fadeOut?: number;
  /** The rule is a share of a stand; `density` is then the whole stand's. */
  stand?: FoliageStandParams;
}

/** Instances per m² the rule places at full paint. */
export function foliageRuleDensity(rule: Pick<FoliageRuleParams, "density" | "stand">): number {
  return rule.stand ? rule.density * Math.max(0, rule.stand.to - rule.stand.from) : rule.density;
}

function foliageRuleHasWeightRamps(rule: FoliageRuleParams): boolean {
  return (rule.fadeIn ?? 0) > 0 || (rule.maxWeight ?? 1) < 1;
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

/** 0..1: how much of the rule's density a paint weight (at or over `minWeight`) has. */
export function foliageRuleWeightMask(rule: Pick<FoliageRuleParams, "minWeight" | "fadeIn" | "maxWeight" | "fadeOut">, weight: number): number {
  const fadeIn = rule.fadeIn ?? 0, maxWeight = rule.maxWeight ?? 1, fadeOut = rule.fadeOut ?? 0;
  const into = fadeIn > 0 ? smoothstep((weight - rule.minWeight) / fadeIn) : 1;
  if (maxWeight >= 1 || weight <= maxWeight) return into;
  return fadeOut > 0 ? into * (1 - smoothstep((weight - maxWeight) / fadeOut)) : 0;
}

/** Values an absent {@link FoliageRuleParams} band field stands for. */
export const LANDSCAPE_FOLIAGE_RULE_BAND_DEFAULTS = {
  heightFalloff: 0, slopeMin: 0, slopeMax: 90, slopeFalloff: 0, noiseAmount: 0, noiseScale: 20, edgeScale: 1,
} as const;

/** The rule's bands with every default filled in (open heights are `±Infinity`). */
export function landscapeFoliageRuleBands(rule: FoliageRuleParams): TerrainMaskBands & { edgeScale: number } {
  const d = LANDSCAPE_FOLIAGE_RULE_BAND_DEFAULTS;
  return {
    heightMin: rule.heightMin ?? -Infinity,
    heightMax: rule.heightMax ?? Infinity,
    heightFalloff: rule.heightFalloff ?? d.heightFalloff,
    slopeMin: rule.slopeMin ?? d.slopeMin,
    slopeMax: rule.slopeMax ?? d.slopeMax,
    slopeFalloff: rule.slopeFalloff ?? d.slopeFalloff,
    noiseAmount: rule.noiseAmount ?? d.noiseAmount,
    noiseScale: rule.noiseScale ?? d.noiseScale,
    edgeScale: rule.edgeScale ?? d.edgeScale,
  };
}

/** True when the rule narrows nothing: every candidate keeps full density and scale. */
export function landscapeFoliageRuleIsUnbanded(rule: FoliageRuleParams): boolean {
  const d = LANDSCAPE_FOLIAGE_RULE_BAND_DEFAULTS;
  return rule.heightMin === undefined && rule.heightMax === undefined
    && (rule.slopeMin ?? d.slopeMin) <= 0 && (rule.slopeMax ?? d.slopeMax) >= 90
    && !((rule.noiseAmount ?? 0) > 0);
}
