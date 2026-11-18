// Ported from Forge WebGL src/scene/proceduralFoliageRing.ts @ forge-webgl-final (04b5fb23); the model ring only — far billboards and far tint are phase 5c F3; drawing goes through a sink instead of Forge's FoliageRenderBinding.
import type { TerrainTileLookup } from "../terrain/terrainHeightQuery.ts";
import { tileKey, type TerrainTileData } from "../terrain/terrainTypes.ts";
import { foliageRingCellSize, foliageRingRadius, planFoliageRing, type FoliageRingBounds } from "../world/foliageRing.ts";
import type { FoliageCellGenerator, FoliageGeneratorTerrainDef } from "./foliageCellGenerator.ts";
import type { FoliageTypeParams } from "./foliageTypeParams.ts";
import type { FoliageRuleParams } from "./proceduralFoliage.ts";

export interface FoliageRingTerrain {
  readonly id: string;
  readonly def: FoliageGeneratorTerrainDef;
  /** Resident tiles (live for a streamed terrain). */
  readonly tiles: TerrainTileLookup;
  /** Tile slots that exist ("x_z"); others are holes, never waited for. Null: every slot. */
  readonly existingTiles: ReadonlySet<string> | null;
}

export interface FoliageRingRule {
  /** The rule's stable id (`forge.landscapeFoliage` rule `id`). */
  readonly id: string;
  /** The `forge.foliageType` GUID the sink draws with. */
  readonly typeId: string;
  readonly rule: FoliageRuleParams;
  readonly type: FoliageTypeParams;
  /** The type's authored cull distances, metres (0 = never culls). */
  readonly cullStart: number;
  readonly cullEnd: number;
  readonly terrain: FoliageRingTerrain;
}

export interface FoliageRingSink {
  /** Replaces what `owner` draws (count instances, 16 column-major floats each); returns the count drawn. */
  set(owner: string, typeId: string, matrices: Float32Array, count: number): number;
  remove(owner: string): void;
}

export interface FoliageRingOptions {
  readonly rules: readonly FoliageRingRule[];
  readonly sink: FoliageRingSink;
  readonly generator: FoliageCellGenerator;
  /** Jobs in flight at once (default 8). */
  readonly maxInFlight?: number;
  /** Defaults to console.warn. */
  readonly warn?: (message: string) => void;
}

export interface FoliageRingSnapshot {
  cells: number;
  instances: number;
  pending: number;
}

interface PendingCell {
  keep: number;
  token: number;
}

interface ReadyCell {
  rule: number;
  key: string;
  keep: number;
  token: number;
  matrices: Float32Array;
  count: number;
}

interface RuleState {
  source: FoliageRingRule;
  /** Ring cell size, metres; fixed per rule for the ring's life. */
  cellSize: number;
  bounds: FoliageRingBounds;
  built: Map<string, { keep: number; count: number }>;
  pending: Map<string, PendingCell>;
  warnedCap: boolean;
}

export function foliageRingOwner(ruleId: string, cellKey: string): string {
  return `ring:${ruleId}:${cellKey}`;
}

export class FoliageRing {
  private readonly options: FoliageRingOptions;
  private readonly rules: RuleState[];
  private readonly terrains = new Map<string, FoliageRingTerrain>();
  /** Per terrain: the tile objects the generator holds a copy of. */
  private readonly synced = new Map<string, Map<string, TerrainTileData>>();
  private readonly ready: ReadyCell[] = [];
  private readonly inFlight = new Set<Promise<void>>();
  private readonly warn: (message: string) => void;
  private nextToken = 1;
  private disposed = false;

  constructor(options: FoliageRingOptions) {
    this.options = options;
    this.warn = options.warn ?? console.warn;
    this.rules = options.rules.map((source) => ({
      source,
      cellSize: foliageRingCellSize(source.cullEnd, source.rule.density),
      bounds: terrainBounds(source.terrain.def),
      built: new Map(),
      pending: new Map(),
      warnedCap: false,
    }));
    for (const { terrain } of options.rules) {
      if (this.terrains.has(terrain.id)) continue;
      this.terrains.set(terrain.id, terrain);
      this.synced.set(terrain.id, new Map());
      options.generator.setTerrain(terrain.id, terrain.def);
    }
  }

  /** Plans the rings, requests new cells and builds at most `budget` finished ones. */
  update(center: readonly [number, number], cullScale: number, density: number, budget = 1): void {
    if (this.disposed) return;
    this.syncTiles();
    this.plan(center, cullScale, density, this.options.maxInFlight ?? 8);
    this.apply(budget);
  }

  /** Generates and builds every cell in range with resident tiles at once. */
  async prepare(center: readonly [number, number], cullScale: number, density: number): Promise<void> {
    if (this.disposed) return;
    this.syncTiles();
    this.plan(center, cullScale, density, Infinity);
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
    if (!this.disposed) this.apply(Infinity);
  }

  /** Mirrors a changed terrain again, keeping the old batches until replaced. */
  replaceTerrain(terrain: FoliageRingTerrain): void {
    if (this.disposed || !this.terrains.has(terrain.id)) return;
    this.terrains.set(terrain.id, terrain);
    this.synced.set(terrain.id, new Map());
    this.options.generator.setTerrain(terrain.id, terrain.def);
    for (const state of this.rules) {
      if (state.source.terrain.id !== terrain.id) continue;
      state.bounds = terrainBounds(terrain.def);
      // NaN matches no keep fraction, so the planner rebuilds every built cell.
      for (const entry of state.built.values()) entry.keep = Number.NaN;
      // In-flight answers read the old tiles; their tokens no longer match.
      state.pending.clear();
    }
  }

  snapshot(): FoliageRingSnapshot {
    let cells = 0;
    let instances = 0;
    let pending = 0;
    for (const state of this.rules) {
      cells += state.built.size;
      pending += state.pending.size;
      for (const { count } of state.built.values()) instances += count;
    }
    return { cells, instances, pending };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const state of this.rules) {
      for (const key of state.built.keys()) this.options.sink.remove(foliageRingOwner(state.source.id, key));
      state.built.clear();
      state.pending.clear();
    }
    this.ready.length = 0;
    for (const id of this.terrains.keys()) this.options.generator.removeTerrain(id);
  }

  private plan(center: readonly [number, number], cullScale: number, density: number, maxInFlight: number): void {
    for (const [index, state] of this.rules.entries()) {
      const { id, typeId, rule, type, cullEnd } = state.source;
      const terrain = this.terrains.get(state.source.terrain.id)!;
      const { radius, capped } = foliageRingRadius(cullEnd, cullScale, state.bounds);
      if (capped && !state.warnedCap) {
        state.warnedCap = true;
        this.warn(`[foliage] rule ${id}: "${typeId}" never culls; its ring is capped at ${radius} m on this terrain. Set a cull distance.`);
      }
      const known = new Map<string, number>();
      for (const [key, { keep }] of state.built) known.set(key, keep);
      for (const [key, { keep }] of state.pending) known.set(key, keep);
      const plan = planFoliageRing({ center, radius, density, bounds: state.bounds, built: known, cellSize: state.cellSize });
      for (const key of plan.unload) {
        state.pending.delete(key);
        if (state.built.delete(key)) this.options.sink.remove(foliageRingOwner(id, key));
      }
      for (const cell of plan.build) {
        if (this.inFlight.size >= maxInFlight) return;
        if (!this.cellTilesReady(terrain, cell.cellX, cell.cellZ, state.cellSize)) continue;
        const token = this.nextToken++;
        state.pending.set(cell.key, { keep: cell.keepFraction, token });
        const job = this.options.generator.generate({
          terrainId: terrain.id,
          rule,
          type,
          request: { cellX: cell.cellX, cellZ: cell.cellZ, cellSize: state.cellSize, keepFraction: cell.keepFraction },
        }).then(
          ({ count, matrices }) => {
            if (this.disposed) return;
            this.ready.push({ rule: index, key: cell.key, keep: cell.keepFraction, token, matrices, count });
          },
          (error: unknown) => {
            if (this.disposed) return;
            this.warn(`[foliage] rule ${id} cell ${cell.key}: ${error instanceof Error ? error.message : String(error)}`);
            // Built empty, so a failing cell is not retried every frame.
            this.ready.push({ rule: index, key: cell.key, keep: cell.keepFraction, token, matrices: new Float32Array(0), count: 0 });
          },
        ).finally(() => this.inFlight.delete(job));
        this.inFlight.add(job);
      }
    }
  }

  private apply(budget: number): void {
    let applied = 0;
    while (applied < budget && this.ready.length > 0) {
      const result = this.ready.shift()!;
      const state = this.rules[result.rule]!;
      // Unloaded or re-requested since: drop this answer.
      if (state.pending.get(result.key)?.token !== result.token) continue;
      state.pending.delete(result.key);
      const count = this.options.sink.set(
        foliageRingOwner(state.source.id, result.key), state.source.typeId, result.matrices, result.count);
      state.built.set(result.key, { keep: result.keep, count });
      applied += 1;
    }
  }

  /** Forgets mirrored tiles that streamed out or were replaced. */
  private syncTiles(): void {
    for (const [id, synced] of this.synced) {
      const terrain = this.terrains.get(id)!;
      for (const [key, tile] of synced) {
        if (terrain.tiles.tile(tile.x, tile.z) === tile) continue;
        synced.delete(key);
        this.options.generator.removeTile(id, tile.x, tile.z);
      }
    }
  }

  /** True once every existing tile under the cell (plus a two-vertex margin for normals) is mirrored. */
  private cellTilesReady(terrain: FoliageRingTerrain, cellX: number, cellZ: number, cellSize: number): boolean {
    const { def } = terrain;
    const tileSize = def.tileQuads * def.spacing;
    const margin = 2 * def.spacing;
    const range = (min: number, max: number, origin: number, tiles: number) => [
      Math.max(0, Math.floor((min - margin - origin) / tileSize)),
      Math.min(tiles - 1, Math.floor((max + margin - origin) / tileSize)),
    ] as const;
    const [x0, x1] = range(cellX * cellSize, (cellX + 1) * cellSize, def.origin[0], def.tilesX);
    const [z0, z1] = range(cellZ * cellSize, (cellZ + 1) * cellSize, def.origin[2], def.tilesZ);
    const synced = this.synced.get(terrain.id)!;
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const key = tileKey(x, z);
        if (terrain.existingTiles && !terrain.existingTiles.has(key)) continue;
        const tile = terrain.tiles.tile(x, z);
        if (!tile) return false;
        if (synced.get(key) !== tile) {
          this.options.generator.setTile(terrain.id, tile);
          synced.set(key, tile);
        }
      }
    }
    return true;
  }
}

function terrainBounds(def: FoliageGeneratorTerrainDef): FoliageRingBounds {
  return {
    minX: def.origin[0],
    maxX: def.origin[0] + def.tilesX * def.tileQuads * def.spacing,
    minZ: def.origin[2],
    maxZ: def.origin[2] + def.tilesZ * def.tileQuads * def.spacing,
  };
}
