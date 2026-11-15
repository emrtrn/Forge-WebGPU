// Ported from Forge WebGL engine/terrain/terrainPuddlePreparation.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Adapted (plan phase 5a step 6): a puddle is a component placed by its seed
// and level, its region the working area around the seed (Forge's
// puddleRegionAroundSeed, unchanged); the tiles it needs are listed here and
// read by the caller (the render binding reads them through the terrain's
// reader), then the bed is the terrain's own surface (terrainHeightAt) over
// that bounded set. Forge's per-body tile budget is kept. No authored height
// or paint is changed.
import { terrainHeightAt } from "./terrainHeightQuery.ts";
import type { TerrainPuddleRegion } from "./terrainPuddle.ts";
import { PUDDLE_LIMITS } from "./puddleWater.ts";
import { tileKey, type TerrainTileData, type WorldTerrainDef } from "./terrainTypes.ts";

export function puddleRegionAroundSeed(def: WorldTerrainDef, seed: readonly [number, number], size: number, level: number): TerrainPuddleRegion {
  const s = def.spacing, cells = Math.max(2, Math.ceil(size / s));
  if (!Number.isFinite(size) || size <= 0 || cells > 128 || cells * s > PUDDLE_LIMITS.extent) throw new Error("Puddle working area exceeds its budget");
  return { minX: def.origin[0] + Math.floor((seed[0] - cells * s / 2 - def.origin[0]) / s) * s,
    minZ: def.origin[2] + Math.floor((seed[1] - cells * s / 2 - def.origin[2]) / s) * s,
    size: cells * s, cellSize: s, level, seed };
}

/** The largest working area a terrain allows: 128 cells and 128 m. */
export function puddleMaxSize(def: Pick<WorldTerrainDef, "spacing">): number {
  return Math.min(128 * def.spacing, PUDDLE_LIMITS.extent);
}

/** True when the seed lies on the terrain's tile grid (holes included: the fill reports them). */
export function terrainContainsSeed(def: WorldTerrainDef, seed: readonly [number, number]): boolean {
  const span = def.tileQuads * def.spacing;
  const x = seed[0] - def.origin[0];
  const z = seed[1] - def.origin[2];
  return x >= 0 && z >= 0 && x < def.tilesX * span && z < def.tilesZ * span;
}

/** The declared tiles under `region` (Forge's per-body read budget: 16). */
export function puddleBedTileKeys(def: WorldTerrainDef, region: TerrainPuddleRegion): string[] {
  const s = def.spacing, span = def.tileQuads * s, keys: string[] = [];
  const known = new Set(def.tiles.map((tile) => tile.key));
  for (let z = Math.max(0, Math.floor((region.minZ - def.origin[2]) / span)); z <= Math.min(def.tilesZ - 1, Math.floor((region.minZ + region.size - def.origin[2]) / span)); z++) {
    for (let x = Math.max(0, Math.floor((region.minX - def.origin[0]) / span)); x <= Math.min(def.tilesX - 1, Math.floor((region.minX + region.size - def.origin[0]) / span)); x++) {
      const key = tileKey(x, z);
      if (known.has(key)) keys.push(key);
    }
  }
  if (keys.length > PUDDLE_LIMITS.tiles) throw new Error("Puddle tile read budget exceeded");
  return keys;
}

/** The bed: the terrain's surface (the collider's triangles) over the tiles read for it; null outside them. */
export function puddleBedHeight(def: WorldTerrainDef, tiles: ReadonlyMap<string, TerrainTileData>): (x: number, z: number) => number | null {
  return (x, z) => terrainHeightAt(def, { tile: (tx, tz) => tiles.get(tileKey(tx, tz)) }, x, z);
}
