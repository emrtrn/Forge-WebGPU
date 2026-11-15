import assert from "node:assert/strict";
import { test } from "vitest";
import { puddleBedHeight, puddleBedTileKeys, puddleMaxSize, puddleRegionAroundSeed, terrainContainsSeed } from "./puddleBed.ts";
import { buildTerrainPuddle } from "./terrainPuddle.ts";
import { createFlatTerrainTile, tileKey, type TerrainTileData, type WorldTerrainDef } from "./terrainTypes.ts";

function bowl(tilesX: number, tilesZ: number, spacing = 1): { def: WorldTerrainDef; tiles: Map<string, TerrainTileData> } {
  const q = 32;
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "Bowl", tileQuads: q, spacing, tilesX, tilesZ,
    origin: [-(tilesX * q * spacing) / 2, 4, -(tilesZ * q * spacing) / 2], heightMin: -50, heightMax: 50, collision: true,
    layers: [], tiles: [],
  };
  const tiles = new Map<string, TerrainTileData>();
  for (let tz = 0; tz < tilesZ; tz += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const tile = createFlatTerrainTile(def, tx, tz);
      for (let z = 0; z <= q; z += 1) {
        for (let x = 0; x <= q; x += 1) {
          const wx = def.origin[0] + (tx * q + x) * spacing;
          const wz = def.origin[2] + (tz * q + z) * spacing;
          tile.heights[z * (q + 1) + x] = 0.01 * (wx * wx + wz * wz);
        }
      }
      tiles.set(tileKey(tx, tz), tile);
      def.tiles.push({ key: tileKey(tx, tz), minHeight: 0, maxHeight: 50 });
    }
  }
  return { def, tiles };
}

test("puddle bed: the working area is Forge's square around the seed, on the terrain grid, within its budget", () => {
  const { def } = bowl(2, 2);
  const region = puddleRegionAroundSeed(def, [0.3, -0.2], 12, 4.3);
  assert.deepEqual(region, { minX: -6, minZ: -7, size: 12, cellSize: 1, level: 4.3, seed: [0.3, -0.2] });
  assert.equal(puddleMaxSize(def), 128);
  assert.equal(puddleMaxSize({ spacing: 0.5 }), 64);
  assert.throws(() => puddleRegionAroundSeed(def, [0, 0], 200, 0), /budget/);
  assert.ok(terrainContainsSeed(def, [0, 0]));
  assert.ok(!terrainContainsSeed(def, [40, 0]));
});

test("puddle bed: the tiles under the area are listed, and the fill reads the terrain's own surface", () => {
  const { def, tiles } = bowl(2, 2);
  const region = puddleRegionAroundSeed(def, [0, 0], 12, 4.3);
  // The seed sits on the corner shared by all four tiles.
  assert.deepEqual(puddleBedTileKeys(def, region), ["0_0", "1_0", "0_1", "1_1"]);
  const data = buildTerrainPuddle(region, puddleBedHeight(def, tiles));
  assert.equal(data.status, "ready");
  // Water 0.3 m above the bowl's bottom (datum 4): a disc of radius sqrt(30).
  assert.ok(Math.abs(data.area - Math.PI * 30) < 3, `area ${data.area}`);
  for (let i = 1; i < data.positions.length; i += 3) assert.equal(data.positions[i], Math.fround(4.3));
  // Raised past the working area's edge: Forge's open boundary.
  assert.equal(buildTerrainPuddle({ ...region, level: 4.5 }, puddleBedHeight(def, tiles)).status, "open-boundary");
  // A tile not read is unknown terrain, never flooded.
  assert.equal(buildTerrainPuddle(region, puddleBedHeight(def, new Map([["0_0", tiles.get("0_0")!]]))).status, "missing-terrain");
});
