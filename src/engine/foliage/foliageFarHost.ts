// Ported from Forge WebGL src/scene/proceduralFoliageRing.ts @ forge-webgl-final (04b5fb23): the far billboard
// blocks (`planFar`) and the far tint (`computeTint` / `sendTints`), drawing and tint delivery through a sink
// instead of Forge's impostor batches and TerrainRenderer (plan 5c F3).
//
// Far billboards: a rule whose type has a far distance past its cull distance also grows, from the cull
// start out, in 512 m blocks of the same ring cells at the ring's outermost density. Blocks are generated on
// this thread over the terrain's always-resident global map, or its exact tiles where resident; a block first
// built from the global map is rebuilt from tiles once it nears the hand-off and its tiles are in, so the
// billboard that replaces a model stands where the model stood.
//
// Far tint: rules whose type has a far tint darken their terrain toward the plants' colour with distance
// (`foliageFarTintMap` over the global map), from the models' cull end out; the tint goes to the caller when
// it or its start distance changes.

import { tileKey } from "../terrain/terrainTypes.ts";
import { FOLIAGE_FAR_BLOCK_SIZE, FOLIAGE_RING_BANDS, foliageFullCellSize, foliageRingCellSize, planFarFoliage, type FoliageRingBounds } from "../world/foliageRing.ts";
import { foliageFadeWindow } from "../world/instanceCulling.ts";
import type { FoliageRingRule, FoliageRingSink, FoliageRingTerrain } from "./foliageRingHost.ts";
import {
  foliageFarTintMap, foliageRuleDensity, generateFoliageBlock, globalFoliageSurface,
  type FoliageFarTintMap, type FoliageFarTintSource, type FoliageGlobalMap,
} from "./proceduralFoliage.ts";

export interface FoliageFarTerrain extends FoliageRingTerrain {
  /** The always-resident global map, heights in world space; null: no far billboards, no tint. */
  readonly global: FoliageGlobalMap | null;
}

export interface FoliageFarRule extends FoliageRingRule {
  /** The type's far distance, metres (0 = none); billboards only past `cullEnd`. */
  readonly farDistance: number;
  readonly terrain: FoliageFarTerrain;
}

/** A type's plants as the tint sees them: their mean colour (linear RGB) and crown radius at scale 1, metres. */
export interface FoliageFarLook {
  readonly color: readonly [number, number, number];
  readonly radius: number;
}

/** A terrain's far tint: coverage and colour over its global map, faded in from `start` to `end` metres. */
export interface FoliageFarTint extends FoliageFarTintMap {
  readonly start: number;
  readonly end: number;
}

export interface FoliageFarOptions {
  readonly rules: readonly FoliageFarRule[];
  /** Draws a block's billboards; owners are {@link foliageFarOwner}. */
  readonly sink: FoliageRingSink;
  /** A type's look for the tint; null while unknown (Forge's plain green, 2 m crowns). */
  readonly look?: (typeId: string) => FoliageFarLook | null;
  /** Receives a terrain's tint when it or its start changes (null clears it); absent: no tint. */
  readonly tint?: (terrainId: string, tint: FoliageFarTint | null) => void;
}

export interface FoliageFarSnapshot {
  blocks: number;
  instances: number;
}

interface FarBlock {
  count: number;
  /** The keep fraction it was generated with (NaN after a terrain change: rebuilt). */
  keep: number;
  /** Generated from tiles only: no hand-off rebuild needed. */
  exact: boolean;
}

interface RuleState {
  readonly source: FoliageFarRule;
  readonly cellSize: number;
  bounds: FoliageRingBounds;
  readonly blocks: Map<string, FarBlock>;
}

const DEFAULT_LOOK: FoliageFarLook = { color: [0.03, 0.06, 0.03], radius: 2 };

export function foliageFarOwner(ruleId: string, blockKey: string): string {
  return `far:${ruleId}:${blockKey}`;
}

/** Forge's `foliageTypeHasFarBillboards`: a far distance past a real cull distance. */
export function foliageRuleHasFarBillboards(rule: Pick<FoliageFarRule, "cullEnd" | "farDistance">): boolean {
  return rule.cullEnd > 0 && rule.farDistance > rule.cullEnd;
}

export class FoliageFar {
  private readonly options: FoliageFarOptions;
  private readonly rules: RuleState[];
  private readonly terrains = new Map<string, FoliageFarTerrain>();
  /** Tint map per terrain (null: none), recomputed on a terrain or look change. */
  private readonly tints = new Map<string, FoliageFarTintMap | null>();
  /** What was last sent per terrain. */
  private readonly sent = new Map<string, string>();
  private tintVersion = 0;
  private disposed = false;

  constructor(options: FoliageFarOptions) {
    this.options = options;
    this.rules = options.rules.filter(foliageRuleHasFarBillboards).map((source) => ({
      source,
      // The ring's cell size: a block is ring cells, so a billboard stands where the ring's model stood.
      cellSize: source.full ? foliageFullCellSize(source.cullEnd) : foliageRingCellSize(source.cullEnd, foliageRuleDensity(source.rule)),
      bounds: terrainBounds(source.terrain),
      blocks: new Map(),
    }));
    for (const { terrain } of options.rules) this.terrains.set(terrain.id, terrain);
    this.refreshTint();
  }

  /** Plans, builds (at most `budget` blocks per rule) and unloads the blocks; sends changed tints. */
  update(center: readonly [number, number], cullScale: number, density: number, budget = 1): void {
    if (this.disposed) return;
    this.plan(center, cullScale, density, budget);
    this.sendTints(cullScale);
  }

  /** The looks changed (an atlas finished): every tint is computed and sent again. */
  refreshTint(): void {
    if (this.disposed) return;
    for (const id of this.terrains.keys()) this.tints.set(id, this.computeTint(id));
    this.tintVersion += 1;
  }

  /** A changed terrain: blocks are rebuilt on it, its tint computed again. */
  replaceTerrain(terrain: FoliageFarTerrain): void {
    if (this.disposed || !this.terrains.has(terrain.id)) return;
    this.terrains.set(terrain.id, terrain);
    for (const state of this.rules) {
      if (state.source.terrain.id !== terrain.id) continue;
      state.bounds = terrainBounds(terrain);
      for (const block of state.blocks.values()) block.keep = Number.NaN;
    }
    this.tints.set(terrain.id, this.computeTint(terrain.id));
    this.tintVersion += 1;
  }

  snapshot(): FoliageFarSnapshot {
    let blocks = 0, instances = 0;
    for (const state of this.rules) for (const block of state.blocks.values()) { blocks += 1; instances += block.count; }
    return { blocks, instances };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const state of this.rules) {
      for (const key of state.blocks.keys()) this.options.sink.remove(foliageFarOwner(state.source.id, key));
      state.blocks.clear();
    }
    for (const id of this.sent.keys()) if (this.sent.get(id) !== "none") this.options.tint?.(id, null);
    this.sent.clear();
  }

  private plan(center: readonly [number, number], cullScale: number, density: number, budget: number): void {
    // Every species of a stand has its own blocks: together they get one rule's budget.
    let standBudget = budget;
    for (const state of this.rules) {
      const { id, typeId, rule, type, cullStart, cullEnd, farDistance, full } = state.source;
      // The live terrain (replaceTerrain swaps it), not the one the rule started with.
      const terrain = this.terrains.get(state.source.terrain.id)!;
      const global = terrain.global;
      if (!global) continue;
      const window = foliageFadeWindow(cullStart, cullEnd, cullScale);
      if (!window) continue;
      const farEnd = farDistance * (cullScale > 0 ? cullScale : 1);
      // The ring's outermost band: a billboard shows exactly the plants the last models showed.
      const quality = Math.min(1, Math.max(0, density));
      const keep = full ? Math.ceil(quality) : FOLIAGE_RING_BANDS[FOLIAGE_RING_BANDS.length - 1]!.keep * quality;
      const plan = planFarFoliage({ center, nearRadius: window[0], farRadius: farEnd, bounds: state.bounds, built: new Set(state.blocks.keys()) });
      for (const key of plan.unload) {
        state.blocks.delete(key);
        this.options.sink.remove(foliageFarOwner(id, key));
      }
      const size = FOLIAGE_FAR_BLOCK_SIZE;
      const handOff = window[1] * 1.25 + size;
      const stale: { key: string; blockX: number; blockZ: number }[] = [];
      for (const [key, block] of state.blocks) {
        const [blockX, blockZ] = key.split("_").map(Number) as [number, number];
        if (block.keep !== keep) { stale.push({ key, blockX, blockZ }); continue; }
        if (block.exact) continue;
        const dx = Math.max(blockX * size - center[0], 0, center[0] - (blockX + 1) * size);
        const dz = Math.max(blockZ * size - center[1], 0, center[1] - (blockZ + 1) * size);
        if (Math.hypot(dx, dz) < handOff && blockTilesResident(terrain, blockX, blockZ)) stale.push({ key, blockX, blockZ });
      }
      // Hand-off rebuilds first: a stale block near the models shows in the wrong place.
      let built = 0;
      for (const block of [...stale, ...plan.build]) {
        if (built >= (full ? standBudget : budget)) break;
        const resident = blockTilesResident(terrain, block.blockX, block.blockZ);
        const surface = globalFoliageSurface(terrain.def, global, terrain.tiles);
        const generated = generateFoliageBlock(rule, type, surface, {
          blockX: block.blockX, blockZ: block.blockZ, cellSize: state.cellSize,
          cellsPerSide: Math.max(1, Math.round(size / state.cellSize)), keepFraction: keep,
        });
        const owner = foliageFarOwner(id, block.key);
        const count = generated.count > 0 ? this.options.sink.set(owner, typeId, generated.matrices, generated.count) : 0;
        if (generated.count === 0) this.options.sink.remove(owner);
        state.blocks.set(block.key, { count, keep, exact: surface.exact || resident });
        built += 1;
      }
      if (full) standBudget -= built;
    }
  }

  /** The far tint of one terrain from every rule on it whose type has a far tint. */
  private computeTint(terrainId: string): FoliageFarTintMap | null {
    const terrain = this.terrains.get(terrainId);
    if (!terrain?.global || !this.options.tint) return null;
    const sources: FoliageFarTintSource[] = [];
    for (const { terrain: of, rule, type, typeId } of this.options.rules) {
      if (of.id !== terrainId || !((type.farTint ?? 0) > 0)) continue;
      const look = this.options.look?.(typeId) ?? DEFAULT_LOOK;
      sources.push({ rule, type, color: look.color, footprint: Math.PI * look.radius * look.radius });
    }
    return sources.length > 0 ? foliageFarTintMap(terrain.def, terrain.global, sources) : null;
  }

  /** Hands each terrain's tint over when it or its start distance changed. */
  private sendTints(cullScale: number): void {
    const hook = this.options.tint;
    if (!hook) return;
    for (const [id, data] of this.tints) {
      let start = Infinity;
      for (const rule of this.options.rules) {
        if (rule.terrain.id !== id || !((rule.type.farTint ?? 0) > 0)) continue;
        const window = foliageFadeWindow(rule.cullStart, rule.cullEnd, cullScale);
        start = Math.min(start, window ? window[1] : 0);
      }
      const tint = data && Number.isFinite(start) ? { ...data, start, end: Math.max(start * 2, start + 100) } : null;
      const signature = tint ? `${this.tintVersion}|${tint.start}` : "none";
      if (this.sent.get(id) === signature) continue;
      const before = this.sent.get(id);
      this.sent.set(id, signature);
      // Nothing was ever sent: no need to clear.
      if (!tint && (before === undefined || before === "none")) continue;
      hook(id, tint);
    }
  }
}

/** True when every existing tile under the block (plus a two-vertex margin for normals) is resident. */
function blockTilesResident(terrain: FoliageFarTerrain, blockX: number, blockZ: number): boolean {
  const { def } = terrain;
  const tileSize = def.tileQuads * def.spacing;
  const margin = 2 * def.spacing;
  const range = (min: number, max: number, origin: number, tiles: number) => [
    Math.max(0, Math.floor((min - margin - origin) / tileSize)),
    Math.min(tiles - 1, Math.floor((max + margin - origin) / tileSize)),
  ] as const;
  const size = FOLIAGE_FAR_BLOCK_SIZE;
  const [x0, x1] = range(blockX * size, (blockX + 1) * size, def.origin[0], def.tilesX);
  const [z0, z1] = range(blockZ * size, (blockZ + 1) * size, def.origin[2], def.tilesZ);
  for (let z = z0; z <= z1; z += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (terrain.existingTiles && !terrain.existingTiles.has(tileKey(x, z))) continue;
      if (!terrain.tiles.tile(x, z)) return false;
    }
  }
  return true;
}

function terrainBounds({ def }: { def: FoliageFarTerrain["def"] }): FoliageRingBounds {
  return {
    minX: def.origin[0],
    maxX: def.origin[0] + def.tilesX * def.tileQuads * def.spacing,
    minZ: def.origin[2],
    maxZ: def.origin[2] + def.tilesZ * def.tileQuads * def.spacing,
  };
}

/** A global map whose heights are relative to the terrain's datum, as world heights (the far surface reads those). */
export function worldGlobalMap(global: FoliageGlobalMap, datum: number): FoliageGlobalMap {
  if (datum === 0) return global;
  const heights = Float32Array.from(global.map.heights, (height) => height + datum);
  return { ...global, map: { ...global.map, heights } };
}
