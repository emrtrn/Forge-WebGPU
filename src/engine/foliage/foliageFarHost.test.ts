// Plan 5c F3: far billboard blocks and the far tint (foliageFarHost.ts).
import { test } from "vitest";
import assert from "node:assert/strict";
import { normalizeFoliageTypeParams } from "./foliageTypeParams.ts";
import { FoliageFar, foliageFarOwner, worldGlobalMap, type FoliageFarRule, type FoliageFarTerrain, type FoliageFarTint } from "./foliageFarHost.ts";
import { generateFoliageCell, worldTerrainFoliageSurface, type FoliageGlobalMap, type FoliageRuleParams } from "./proceduralFoliage.ts";
import { TerrainTileMap } from "../terrain/terrainHeightQuery.ts";
import { buildTerrainGlobalMap } from "../terrain/terrainGlobalMap.ts";
import type { TerrainTileData } from "../terrain/terrainTypes.ts";
import { FOLIAGE_RING_BANDS, foliageRingCellSize } from "../world/foliageRing.ts";

const QUADS = 32, SPACING = 4, TILES = 8, DATUM = 10;
const def = { tileQuads: QUADS, spacing: SPACING, tilesX: TILES, tilesZ: TILES, origin: [0, DATUM, 0] as [number, number, number], layers: [{ id: "grass" }] };
const RULE: FoliageRuleParams = { layerId: "grass", density: 0.004, minWeight: 0.5, seed: 9 };
const TYPE = normalizeFoliageTypeParams({ name: "Tree", meshAssetId: "tree", farTint: 0.5 });

/** Rolling ground, heights relative to the datum as the tiles hold them. */
function tile(x: number, z: number): TerrainTileData {
  const size = QUADS + 1;
  const heights = new Float32Array(size * size);
  for (let j = 0; j < size; j += 1) for (let i = 0; i < size; i += 1) {
    const wx = (x * QUADS + i) * SPACING, wz = (z * QUADS + j) * SPACING;
    heights[j * size + i] = 4 * Math.sin(wx / 37) + 3 * Math.cos(wz / 23);
  }
  return { x, z, size, layerCount: 1, heights, weights: Uint8Array.from({ length: size * size * 4 }, (_, i) => (i % 4 === 0 ? 255 : 0)) };
}

function allTiles(): TerrainTileMap {
  const tiles = new TerrainTileMap();
  for (let z = 0; z < TILES; z += 1) for (let x = 0; x < TILES; x += 1) tiles.set(tile(x, z));
  return tiles;
}

/** The terrain binding's far map: built in the terrain-local frame, heights relative to the datum. */
function relativeGlobal(tiles: TerrainTileMap): FoliageGlobalMap {
  const map = buildTerrainGlobalMap({ ...def, origin: [0, 0, 0] }, tiles, 4);
  return { map, normals: new Float32Array(map.width * map.height * 3), weights: Uint8Array.from({ length: map.width * map.height * 4 }, (_, i) => (i % 4 === 0 ? 255 : 0)) };
}

function recordingSink() {
  const drawn = new Map<string, Float32Array>();
  let sets = 0;
  return {
    drawn,
    sets: () => sets,
    sink: {
      set(owner: string, _type: string, matrices: Float32Array, count: number) { sets += 1; drawn.set(owner, matrices.slice(0, count * 16)); return count; },
      remove(owner: string) { drawn.delete(owner); },
    },
  };
}

const translations = (matrices: Float32Array): string[] =>
  Array.from({ length: matrices.length / 16 }, (_, i) => Array.from(matrices.slice(i * 16 + 12, i * 16 + 15), (v) => v.toFixed(4)).join(","));

function farRule(terrain: FoliageFarTerrain): FoliageFarRule {
  return { id: "trees", typeId: "type-trees", rule: RULE, type: TYPE, cullStart: 150, cullEnd: 200, farDistance: 900, terrain };
}

test("far foliage: a block built from the global map is rebuilt from the tiles at the hand-off, where the ring's models stand", () => {
  const resident = new TerrainTileMap();
  const full = allTiles();
  const global = worldGlobalMap(relativeGlobal(full), DATUM);
  const existing = new Set(Array.from({ length: TILES * TILES }, (_, i) => `${i % TILES}_${Math.floor(i / TILES)}`));
  const terrain: FoliageFarTerrain = { id: "ground", def, tiles: resident, existingTiles: existing, global };
  const { drawn, sink, sets } = recordingSink();
  const far = new FoliageFar({ rules: [farRule(terrain)], sink });
  const center: [number, number] = [100, 100];
  far.update(center, 1, 1, Infinity);
  const owner = foliageFarOwner("trees", "0_0");
  const fromGlobal = drawn.get(owner);
  assert.ok(fromGlobal && fromGlobal.length > 0, "block 0_0 built from the global map");
  const before = sets();

  // No tiles yet: the block stays as it is.
  far.update(center, 1, 1, Infinity);
  assert.equal(sets(), before);

  // The tiles stream in: the block near the hand-off is rebuilt from them, once.
  for (let z = 0; z < TILES; z += 1) for (let x = 0; x < TILES; x += 1) resident.set(full.tile(x, z)!);
  far.update(center, 1, 1, Infinity);
  assert.ok(sets() > before, "rebuilt from the tiles");
  const rebuilt = sets();
  far.update(center, 1, 1, Infinity);
  assert.equal(sets(), rebuilt, "an exact block is not rebuilt again");

  // Every model the ring's outermost band grows in the block's cells has its billboard at the same place.
  const exact = new Set(translations(drawn.get(owner)!));
  const cellSize = foliageRingCellSize(200, RULE.density);
  const keep = FOLIAGE_RING_BANDS[FOLIAGE_RING_BANDS.length - 1]!.keep;
  const surface = worldTerrainFoliageSurface(def, resident);
  let models = 0;
  for (let cz = 0; cz < 512 / cellSize; cz += 1) for (let cx = 0; cx < 512 / cellSize; cx += 1) {
    const cell = generateFoliageCell(RULE, TYPE, surface, { cellX: cx, cellZ: cz, cellSize, keepFraction: keep });
    for (const at of translations(cell.matrices)) { models += 1; assert.ok(exact.has(at), `model at ${at} has its billboard`); }
  }
  assert.equal(models, exact.size);
  // The global map's billboards stood on the same plants, within the far map's height error.
  assert.equal(fromGlobal.length, drawn.get(owner)!.length);
  far.dispose();
  assert.equal(drawn.size, 0);
});

test("far foliage: blocks build within the budget, nearest first, and unload past the far distance", () => {
  const tiles = allTiles();
  const terrain: FoliageFarTerrain = { id: "ground", def, tiles, existingTiles: null, global: worldGlobalMap(relativeGlobal(tiles), DATUM) };
  const { drawn, sink } = recordingSink();
  const far = new FoliageFar({ rules: [{ ...farRule(terrain), farDistance: 600 }], sink });
  far.update([10, 10], 1, 1, 1);
  assert.deepEqual([...drawn.keys()], [foliageFarOwner("trees", "0_0")]);
  far.update([10, 10], 1, 1, Infinity);
  assert.equal(far.snapshot().blocks, 3, "the fourth block lies past the far distance");
  // The far distance scales with the quality: a third of it reaches no block beyond the first.
  far.update([10, 10], 0.3, 1, Infinity);
  assert.deepEqual([...drawn.keys()], [foliageFarOwner("trees", "0_0")]);
  far.dispose();
});

test("far foliage: no billboards without a far distance past the cull end; the tint reaches the terrain and clears", () => {
  const tiles = allTiles();
  const global = worldGlobalMap(relativeGlobal(tiles), DATUM);
  const terrain: FoliageFarTerrain = { id: "ground", def, tiles, existingTiles: null, global };
  const { drawn, sink } = recordingSink();
  const tints: (FoliageFarTint | null)[] = [];
  const far = new FoliageFar({
    rules: [{ ...farRule(terrain), farDistance: 150 }], sink,
    look: () => ({ color: [0.1, 0.3, 0.1], radius: 3 }),
    tint: (_id, tint) => tints.push(tint),
  });
  far.update([10, 10], 1, 1, Infinity);
  assert.equal(drawn.size, 0);
  assert.equal(tints.length, 1);
  const tint = tints[0]!;
  assert.equal(tint.start, 200);
  assert.equal(tint.end, 400);
  assert.equal(tint.coverage.length, global.map.width * global.map.height);
  assert.ok(tint.coverage.every((value) => value > 0 && value <= 0.5));
  assert.deepEqual(tint.color.map((value) => Number(value.toFixed(3))), [0.1, 0.3, 0.1]);
  far.update([10, 10], 1, 1, Infinity);
  assert.equal(tints.length, 1, "unchanged: not sent again");
  far.update([10, 10], 2, 1, Infinity);
  assert.equal(tints[1]!.start, 400, "the quality's cull scale moves the start");
  far.dispose();
  assert.equal(tints.at(-1), null);
});
