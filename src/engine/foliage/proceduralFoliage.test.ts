// Rewritten from Forge WebGL tests/engine/proceduralFoliage.test.ts @ forge-webgl-final (04b5fb23).
// Pure generation assertions retained; old asset serialization and two three checks omitted.
import { test } from "vitest";
import assert from "node:assert/strict";
import { normalizeFoliageTypeParams } from "./foliageTypeParams.ts";
import type { FoliageRuleParams } from "./proceduralFoliage.ts";
import {
  foliageCellSeed, foliageFarTintMap, generateFoliageBlock, generateFoliageCell, globalFoliageSurface, MAX_FOLIAGE_CELL_INSTANCES,
  worldTerrainFoliageSurface, FoliageTerrainStore, type FoliageCellRequest, type FoliageGlobalMap, type FoliageSurface, type GeneratedFoliageCell,
} from "./proceduralFoliage.ts";
import { TerrainTileMap, terrainHeightAt, terrainSmoothNormalAt } from "../terrain/terrainHeightQuery.ts";
import type { TerrainTileData } from "../terrain/terrainTypes.ts";
import { buildTerrainGlobalMap } from "../terrain/terrainGlobalMap.ts";
const RULE: FoliageRuleParams = {
  layerId: "grass",
  density: 2, minWeight: 0.5, seed: 17,
};
const TYPE = normalizeFoliageTypeParams({ name: "Grass", meshAssetId: "grass" });
const REQUEST: FoliageCellRequest = { cellX: 0, cellZ: 0, cellSize: 16, keepFraction: 1 };
const FLAT: FoliageSurface = {
  heightAt: () => 2, normalAt: () => [0, 1, 0], layerWeightAt: () => 1,
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
};

function translations(cell: GeneratedFoliageCell): string[] {
  return Array.from({ length: cell.count }, (_, i) => Array.from(cell.matrices.slice(i * 16 + 12, i * 16 + 15)).join(","));
}

function near(actual: number | null, expected: number, epsilon = 1e-5): void {
  assert.ok(actual !== null && Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

const check = test;
  check("procedural foliage: deterministic matrices and nested density subsets keep exact translations", () => {
    assert.deepEqual(generateFoliageCell(RULE, TYPE, FLAT, REQUEST), generateFoliageCell(RULE, TYPE, FLAT, REQUEST));
    const results = [0.25, 0.5, 1].map((keepFraction) => generateFoliageCell(RULE, TYPE, FLAT, { ...REQUEST, keepFraction }));
    assert.ok(results[0]!.count > 0);
    assert.ok(results[0]!.count < results[1]!.count && results[1]!.count < results[2]!.count);
    for (let i = 0; i < 2; i += 1) {
      const larger = new Set(translations(results[i + 1]!));
      for (const translation of translations(results[i]!)) assert.ok(larger.has(translation));
      const matrices = new Set(Array.from({ length: results[i + 1]!.count }, (_, j) =>
        Array.from(results[i + 1]!.matrices.slice(j * 16, (j + 1) * 16)).join(",")));
      for (let j = 0; j < results[i]!.count; j += 1) {
        assert.ok(matrices.has(Array.from(results[i]!.matrices.slice(j * 16, (j + 1) * 16)).join(",")));
      }
    }
  });

  check("procedural foliage: layer, slope, height and unavailable surface filters reject candidates", () => {
    const half: FoliageSurface = { ...FLAT, layerWeightAt: (_id, x) => x < 8 ? 0 : 1 };
    const weighted = generateFoliageCell(RULE, TYPE, half, REQUEST);
    assert.ok(weighted.count > 0);
    for (let i = 0; i < weighted.count; i += 1) assert.ok(weighted.matrices[i * 16 + 12]! >= 8);
    const plane: FoliageSurface = { ...FLAT, normalAt: () => [Math.SQRT1_2, Math.SQRT1_2, 0] };
    assert.equal(generateFoliageCell(RULE, { ...TYPE, slopeMax: 10 }, plane, REQUEST).count, 0);
    assert.equal(generateFoliageCell(RULE, { ...TYPE, heightMin: 3 }, FLAT, REQUEST).count, 0);
    assert.equal(generateFoliageCell(RULE, { ...TYPE, heightMax: 1 }, FLAT, REQUEST).count, 0);
    for (const surface of [{ ...FLAT, layerWeightAt: () => null }, { ...FLAT, normalAt: () => null },
      { ...FLAT, heightAt: () => null }]) assert.equal(generateFoliageCell(RULE, TYPE, surface, REQUEST).count, 0);
    const bounded: FoliageSurface = { ...FLAT, bounds: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 },
      heightAt: (x, z) => x < 8 && z < 8 ? 2 : null };
    const result = generateFoliageCell(RULE, TYPE, bounded, REQUEST);
    assert.ok(result.count > 0);
    for (let i = 0; i < result.count; i += 1) {
      assert.ok(result.matrices[i * 16 + 12]! < 8 && result.matrices[i * 16 + 14]! < 8);
    }
    assert.equal(generateFoliageCell(RULE, TYPE, { ...FLAT, layerWeightAt: () => RULE.minWeight - 0.5e-6 }, REQUEST).count,
      generateFoliageCell(RULE, TYPE, FLAT, REQUEST).count);
  });

  check("procedural foliage: the scaled base of an upright trunk seats at the downhill edge", () => {
    const slope: FoliageSurface = {
      ...FLAT,
      heightAt: (x) => 2 + 0.5 * x,
      normalAt: () => [-1 / Math.sqrt(5), 2 / Math.sqrt(5), 0],
    };
    const rule = { ...RULE, groundRadius: 0.4 };
    const upright: typeof TYPE = { ...TYPE, scaleMin: [2, 2, 2], scaleMax: [2, 2, 2], alignToNormal: false };
    const request = { ...REQUEST, maxInstances: 1 };
    const at = generateFoliageCell(rule, upright, slope, request).matrices;
    const original = generateFoliageCell(RULE, upright, slope, request).matrices;
    near(at[13]!, slope.heightAt(at[12]! - 0.8, at[14]!)!);
    assert.equal(at[12], original[12]);
    assert.equal(at[14], original[14]);
    assert.deepEqual(generateFoliageCell(rule, upright, FLAT, request), generateFoliageCell(RULE, upright, FLAT, request));
    assert.deepEqual(generateFoliageCell(rule, TYPE, slope, request), generateFoliageCell(RULE, TYPE, slope, request));
  });

  check("procedural foliage: caps and disabled requests return exactly sized buffers", () => {
    for (const maxInstances of [0, 1, 7]) {
      const result = generateFoliageCell(RULE, TYPE, FLAT, { ...REQUEST, maxInstances });
      assert.equal(result.count, maxInstances);
      assert.equal(result.matrices.length, result.count * 16);
    }
    const capped = generateFoliageCell({ ...RULE, density: 8 }, TYPE, FLAT, { ...REQUEST, cellSize: 32 });
    assert.equal(capped.count, MAX_FOLIAGE_CELL_INSTANCES);
    assert.equal(capped.matrices.length, MAX_FOLIAGE_CELL_INSTANCES * 16);
    for (const request of [{ ...REQUEST, cellSize: 0 }, { ...REQUEST, cellSize: -1 },
      { ...REQUEST, keepFraction: 0 }, { ...REQUEST, keepFraction: -1 }]) {
      assert.deepEqual(generateFoliageCell(RULE, TYPE, FLAT, request), { count: 0, matrices: new Float32Array(0) });
    }
    assert.equal(generateFoliageCell({ ...RULE, density: 0 }, TYPE, FLAT, REQUEST).matrices.length, 0);
    assert.equal(generateFoliageCell({ ...RULE, density: -1 }, TYPE, FLAT, REQUEST).count, 0);
  });

  check("procedural foliage: cell seeds are unsigned, distinct nearby and support negative layouts", () => {
    // Frozen outputs read from forge-webgl-final, independent of the port.
    assert.equal(foliageCellSeed(17, 0, 0), 2463138948);
    assert.equal(foliageCellSeed(-1, -2, 3), 1998458221);
    assert.equal(foliageCellSeed(1, 1, -1), 2266386124);
    const seeds = new Set<number>();
    for (let z = -10; z <= 10; z += 1) {
      for (let x = -10; x <= 10; x += 1) {
        const seed = foliageCellSeed(1, x, z);
        assert.equal(seed, seed >>> 0);
        seeds.add(seed);
      }
    }
    assert.equal(seeds.size, 441);
    assert.equal(foliageCellSeed(-1, -2, 3), foliageCellSeed(0xffffffff, -2, 3));
    const negative = generateFoliageCell(RULE, TYPE, FLAT, { ...REQUEST, cellX: -1, cellZ: -1 });
    assert.ok(negative.count > 0);
    assert.notDeepEqual(negative.matrices, generateFoliageCell(RULE, TYPE, FLAT, REQUEST).matrices);
    const adjacent = generateFoliageCell(RULE, TYPE, FLAT, { ...REQUEST, cellX: 1 });
    assert.notEqual(negative.matrices[12]! + 16, adjacent.matrices[12]! - 16);
    for (let i = 0; i < negative.count; i += 1) {
      assert.ok(negative.matrices[i * 16 + 12]! >= -16 && negative.matrices[i * 16 + 12]! < 0);
      assert.ok(negative.matrices[i * 16 + 14]! >= -16 && negative.matrices[i * 16 + 14]! < 0);
    }
  });

  check("procedural foliage: world surface uses exact resident tile heights, seam normals and layer ids", () => {
    const def = { tileQuads: 2, spacing: 2, tilesX: 2, tilesZ: 1,
      origin: [10, 5, -4] as [number, number, number], layers: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    const tiles = new TerrainTileMap();
    for (let x = 0; x < 2; x += 1) {
      const tile: TerrainTileData = { x, z: 0, size: 3, layerCount: 2,
        heights: Float32Array.from({ length: 9 }, (_, i) => x * 2 + i % 3 + Math.floor(i / 3)),
        weights: new Uint8Array(9 * 4) };
      for (let i = 0; i < 9; i += 1) { tile.weights[i * 4] = 51; tile.weights[i * 4 + 1] = 204; }
      tiles.set(tile);
    }
    const surface = worldTerrainFoliageSurface(def, tiles);
    assert.deepEqual(surface.bounds, { minX: 10, maxX: 18, minZ: -4, maxZ: 0 });
    for (const x of [10, 13.9, 14, 14.1, 18]) {
      assert.equal(surface.heightAt(x, -2), terrainHeightAt(def, tiles, x, -2));
      assert.deepEqual(surface.normalAt(x, -2), terrainSmoothNormalAt(def, tiles, x, -2));
      near(surface.layerWeightAt("a", x, -2), 0.2);
      near(surface.layerWeightAt("b", x, -2), 0.8);
      assert.equal(surface.layerWeightAt("c", x, -2), 0);
    }
    assert.equal(surface.layerWeightAt("unknown", 14, -2), null);
    assert.equal(surface.heightAt(9, -2), null);
    assert.equal(surface.layerWeightAt("b", 9, -2), null);
    tiles.delete(1, 0);
    assert.equal(surface.heightAt(15, -2), null);
    assert.equal(surface.normalAt(15, -2), null);
    assert.equal(surface.layerWeightAt("b", 15, -2), null);
    assert.equal(surface.heightAt(14, -2), terrainHeightAt(def, tiles, 14, -2));
  });

  // Ground rises with X (height = x), so a height band cuts the cell along X.
  const RAMP: FoliageSurface = { ...FLAT, heightAt: (x) => x };
  const heights = (cell: GeneratedFoliageCell): number[] =>
    Array.from({ length: cell.count }, (_, i) => cell.matrices[i * 16 + 13]!);
  const scales = (cell: GeneratedFoliageCell): number[] =>
    Array.from({ length: cell.count }, (_, i) => Math.hypot(cell.matrices[i * 16]!, cell.matrices[i * 16 + 1]!, cell.matrices[i * 16 + 2]!));
  const subset = (small: GeneratedFoliageCell, large: GeneratedFoliageCell): void => {
    const all = new Set(translations(large));
    for (const translation of translations(small)) assert.ok(all.has(translation), `${translation} missing`);
  };

  check("procedural foliage rule bands: Height Min/Max cut hard, an open side and the type limits still apply", () => {
    const full = generateFoliageCell(RULE, TYPE, RAMP, REQUEST);
    const capped = generateFoliageCell({ ...RULE, heightMax: 8 }, TYPE, RAMP, REQUEST);
    assert.ok(capped.count > 0 && capped.count < full.count);
    assert.ok(heights(capped).every((y) => y <= 8));
    subset(capped, full);
    const band = generateFoliageCell({ ...RULE, heightMin: 4, heightMax: 8 }, TYPE, RAMP, REQUEST);
    assert.ok(heights(band).every((y) => y >= 4 && y <= 8) && band.count < capped.count);
    // The type's own Height Max is a hard limit on top of the rule's band.
    const typeCapped = generateFoliageCell({ ...RULE, heightMax: 8 }, { ...TYPE, heightMax: 6 }, RAMP, REQUEST);
    assert.ok(heights(typeCapped).every((y) => y <= 6));
  });

  check("procedural foliage rule bands: falloff thins the edge as a nested subset, never moves a plant", () => {
    const hard8 = generateFoliageCell({ ...RULE, heightMax: 8 }, TYPE, RAMP, REQUEST);
    const soft = generateFoliageCell({ ...RULE, heightMax: 8, heightFalloff: 4 }, TYPE, RAMP, REQUEST);
    const hard12 = generateFoliageCell({ ...RULE, heightMax: 12 }, TYPE, RAMP, REQUEST);
    assert.ok(hard8.count < soft.count && soft.count < hard12.count);
    assert.ok(heights(soft).every((y) => y < 12));
    subset(hard8, soft);
    subset(soft, hard12);
    // Thinning grows toward the outer edge of the falloff.
    const inBand = (lo: number, hi: number) => heights(soft).filter((y) => y >= lo && y < hi).length;
    assert.ok(inBand(8, 10) > inBand(10, 12));
  });

  check("procedural foliage rule bands: Edge Scale shrinks plants in the falloff only", () => {
    const rule = { ...RULE, heightMax: 8, heightFalloff: 4 };
    const plain = generateFoliageCell(rule, TYPE, RAMP, REQUEST);
    const shrunk = generateFoliageCell({ ...rule, edgeScale: 0.25 }, TYPE, RAMP, REQUEST);
    assert.deepEqual(translations(shrunk), translations(plain));
    const ys = heights(shrunk), ss = scales(shrunk);
    assert.ok(scales(plain).every((scale) => Math.abs(scale - 1) < 1e-5));
    ys.forEach((y, i) => {
      if (y <= 8) near(ss[i]!, 1);
      else assert.ok(ss[i]! < 1 && ss[i]! >= 0.25 - 1e-5);
    });
    assert.ok(ys.some((y) => y > 8));
  });

  check("procedural foliage rule bands: a band that covers everything matches an unbanded rule bit for bit", () => {
    assert.deepEqual(
      generateFoliageCell({ ...RULE, heightMin: -1e4, heightMax: 1e4, heightFalloff: 5, edgeScale: 0.2 }, TYPE, RAMP, REQUEST),
      generateFoliageCell(RULE, TYPE, RAMP, REQUEST),
    );
  });

  check("far foliage surface: exact tiles where resident, the global map elsewhere", () => {
    const def = { tileQuads: 4, spacing: 2, tilesX: 2, tilesZ: 1,
      origin: [0, 10, 0] as [number, number, number], layers: [{ id: "a" }, { id: "b" }] };
    // Global map: stride 2 vertices (4 m); height = 10 + 0.5 * x (world-space), layer b weight 255.
    const width = 5, height = 3;
    const global: FoliageGlobalMap = {
      map: { width, height, stride: 2, heights: Float32Array.from({ length: width * height }, (_, i) => 10 + (i % width) * 4 * 0.5) },
      normals: new Float32Array(width * height * 3),
      weights: Uint8Array.from({ length: width * height * 4 * 2 }, (_, i) => (i % 4 === 1 && i < width * height * 4 ? 255 : 0)),
    };
    const tiles = new TerrainTileMap();
    const surface = globalFoliageSurface(def, global, tiles);
    near(surface.heightAt(6, 3), 10 + 3);
    near(surface.layerWeightAt("b", 6, 3), 1);
    near(surface.layerWeightAt("a", 6, 3), 0);
    assert.deepEqual(surface.normalAt(6, 3), [0, 1, 0]);
    assert.equal(surface.exact, false);
    assert.equal(surface.heightAt(20, 3), null, "off the map");
    assert.equal(surface.layerWeightAt("missing", 6, 3), null);
    const tile: TerrainTileData = { x: 0, z: 0, size: 5, layerCount: 2,
      heights: new Float32Array(25).fill(7), weights: new Uint8Array(25 * 4) };
    tiles.set(tile);
    const mixed = globalFoliageSurface(def, global, tiles);
    assert.equal(mixed.heightAt(3, 3), terrainHeightAt(def, tiles, 3, 3));
    assert.equal(mixed.exact, true);
    near(mixed.heightAt(12, 3), 16);
    assert.equal(mixed.exact, false);
  });

  check("far foliage block: the ring cells of a block, packed, at the same positions", () => {
    const block = generateFoliageBlock(RULE, TYPE, RAMP, { blockX: -1, blockZ: 1, cellSize: 8, cellsPerSide: 2, keepFraction: 0.5 });
    const cells = [[-2, 2], [-1, 2], [-2, 3], [-1, 3]].map(([cellX, cellZ]) =>
      generateFoliageCell(RULE, TYPE, RAMP, { cellX: cellX!, cellZ: cellZ!, cellSize: 8, keepFraction: 0.5 }));
    assert.equal(block.count, cells.reduce((sum, cell) => sum + cell.count, 0));
    assert.deepEqual(translations(block).sort(), cells.flatMap(translations).sort());
  });

  check("far foliage tint: coverage where the rule grows, nothing elsewhere, and the plants' colour", () => {
    const def = { tileQuads: 4, spacing: 2, tilesX: 1, tilesZ: 1, origin: [0, 0, 0] as [number, number, number], layers: [{ id: "grass" }] };
    const width = 3, height = 3;
    // Heights 0, 10, 20 along X; grass weight 255 except the last column (0).
    const global: FoliageGlobalMap = {
      map: { width, height, stride: 2, heights: Float32Array.from({ length: 9 }, (_, i) => (i % 3) * 10) },
      normals: new Float32Array(27),
      weights: Uint8Array.from({ length: 9 * 4 * 2 }, (_, i) => (i < 36 && i % 4 === 0 && Math.floor(i / 4) % 3 !== 2 ? 255 : 0)),
    };
    const type = normalizeFoliageTypeParams({ name: "Tree", meshAssetId: "tree", farTint: 0.5 });
    const rule = { ...RULE, layerId: "grass", density: 0.01, minWeight: 0.5 };
    const source = { rule, type, color: [0.02, 0.05, 0.02] as const, footprint: 30 };
    const tint = foliageFarTintMap(def, global, [source])!;
    const cover = 0.5 * (1 - Math.exp(-4 * 0.01 * 30));
    near(tint.coverage[0]!, cover);
    near(tint.coverage[1]!, cover);
    assert.equal(tint.coverage[2], 0, "no grass, no tint");
    tint.color.forEach((channel, i) => near(channel, [0.02, 0.05, 0.02][i]!));
    const capped = foliageFarTintMap(def, global, [{ ...source, rule: { ...rule, heightMax: 5 } }])!;
    near(capped.coverage[0]!, cover);
    assert.equal(capped.coverage[1], 0, "above the rule's Height Max");
    assert.equal(foliageFarTintMap(def, global, [{ ...source, type: { ...type, farTint: 0 } }]), null);
  });


check("foliage terrain store: snapshots inputs, removes tiles, replaces terrains and clears ownership", () => {
  const def = { tileQuads: 2, spacing: 2, tilesX: 1, tilesZ: 1,
    origin: [0, 10, 0] as [number, number, number], layers: [{ id: "grass" }] };
  const tile: TerrainTileData = { x: 0, z: 0, size: 3, layerCount: 1,
    heights: new Float32Array(9).fill(3), weights: new Uint8Array(36) };
  for (let i = 0; i < 9; i += 1) tile.weights[i * 4] = 255;
  const store = new FoliageTerrainStore();
  const request = { ...REQUEST, cellSize: 2 };
  assert.throws(() => store.setTile("missing", tile), /Unknown foliage terrain: missing/);
  assert.throws(() => store.generate("missing", RULE, TYPE, request), /Unknown foliage terrain: missing/);
  store.setTerrain("ground", def);
  store.setTile("ground", tile);
  const before = store.generate("ground", RULE, TYPE, request);
  assert.equal(before.count, 9);
  for (let i = 0; i < before.count; i += 1) assert.equal(before.matrices[i * 16 + 13], 13);
  def.origin[1] = 100;
  def.layers[0]!.id = "changed";
  tile.heights.fill(100);
  tile.weights.fill(0);
  assert.deepEqual(store.generate("ground", RULE, TYPE, request), before);
  store.removeTile("ground", 0, 0);
  assert.equal(store.generate("ground", RULE, TYPE, request).count, 0);
  store.removeTile("missing", 0, 0);
  store.setTile("ground", tile);
  store.setTerrain("ground", def);
  assert.equal(store.generate("ground", RULE, TYPE, request).count, 0);
  store.removeTerrain("ground");
  assert.throws(() => store.generate("ground", RULE, TYPE, request), /Unknown foliage terrain/);
  store.setTerrain("other", def);
  store.clear();
  assert.throws(() => store.generate("other", RULE, TYPE, request), /Unknown foliage terrain/);
});

check("far foliage: existing global map keeps world heights and height filters with a nonzero datum", () => {
  const def = { tileQuads: 4, spacing: 2, tilesX: 1, tilesZ: 1,
    origin: [0, 10, 0] as [number, number, number], layers: [{ id: "grass" }] };
  const tiles = new TerrainTileMap();
  tiles.set({ x: 0, z: 0, size: 5, layerCount: 1,
    heights: new Float32Array(25).fill(3), weights: new Uint8Array(100) });
  const map = buildTerrainGlobalMap(def, tiles, 2);
  const global: FoliageGlobalMap = { map, normals: new Float32Array(12),
    weights: Uint8Array.from({ length: 16 }, (_, i) => i % 4 === 0 ? 255 : 0) };
  tiles.delete(0, 0);
  const surface = globalFoliageSurface(def, global, tiles);
  assert.equal(surface.heightAt(3, 3), 13);
  assert.equal(surface.exact, false);
  const source = { rule: RULE, type: { ...TYPE, farTint: 1, heightMax: 14 }, color: [0.1, 0.2, 0.3] as const, footprint: 1 };
  const tint = foliageFarTintMap(def, global, [source])!;
  assert.ok(tint.coverage.every((value) => value > 0));
  const rejected = foliageFarTintMap(def, global, [{ ...source, type: { ...source.type, heightMin: 14 } }])!;
  assert.ok(rejected.coverage.every((value) => value === 0));
});
