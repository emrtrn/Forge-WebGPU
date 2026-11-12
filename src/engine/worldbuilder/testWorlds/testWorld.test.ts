// Ported from Forge WebGL tests/engine/testWorld.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 1 check of Forge's old level document (`testWorldLevel`) left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { normalizeWorldTerrain } from "../../terrain/terrainDefinition.ts";
import { decodeTerrainGlobalMap } from "../../terrain/terrainGlobalMapFile.ts";
import { decodeTerrainTile } from "../../terrain/terrainTileCodec.ts";
import { terrainTileHeightRange, tileKey } from "../../terrain/terrainTypes.ts";
import { generateTestWorld } from "./testWorld.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;

export function registerTestWorldTests(check: Check): void {
  // Same 4 layers and code path as the 4 km world, at a size a unit test can afford.
  const options = { tiles: 3, tileQuads: 32, spacing: 16 };

  check("test world: valid definition, decodable u16 tiles and global map, summaries from decoded heights", () => {
    const world = generateTestWorld(options);
    assert.deepEqual(normalizeWorldTerrain(JSON.parse(JSON.stringify(world.def))), world.def);
    assert.equal(world.def.tiles.length, 9);
    assert.deepEqual(world.def.origin, [-768, 0, -768]);
    for (const summary of world.def.tiles) {
      const decoded = decodeTerrainTile(world.tileBytes.get(summary.key)!);
      assert.equal(decoded.heightFormat, "u16", "the stock tile format, never widened");
      assert.deepEqual(terrainTileHeightRange(decoded), { min: summary.minHeight, max: summary.maxHeight });
      assert.deepEqual(decoded.heights, world.tiles.get(summary.key)!.heights);
    }
    const global = decodeTerrainGlobalMap(world.globalBytes);
    assert.ok(global.map.width > 0 && global.map.height > 0);
  });

  check("test world: shared tile edges are identical, weights sum to 255, and the terrain has valley and peaks", () => {
    const world = generateTestWorld(options);
    const size = options.tileQuads + 1;
    const tile = (x: number, z: number) => world.tiles.get(tileKey(x, z))!;
    for (let i = 0; i < size; i += 1) {
      assert.equal(tile(0, 0).heights[i * size + size - 1], tile(1, 0).heights[i * size], "east/west seam");
      assert.equal(tile(0, 0).heights[(size - 1) * size + i], tile(0, 1).heights[i], "north/south seam");
    }
    let maxHeight = -Infinity;
    const used = [0, 0, 0, 0];
    for (const data of world.tiles.values()) {
      for (let index = 0; index < size * size; index += 1) {
        const offset = index * 4;
        const sum = data.weights[offset]! + data.weights[offset + 1]! + data.weights[offset + 2]! + data.weights[offset + 3]!;
        assert.equal(sum, 255);
        for (let layer = 0; layer < 4; layer += 1) if (data.weights[offset + layer]! > 128) used[layer]! += 1;
      }
      maxHeight = Math.max(maxHeight, terrainTileHeightRange(data).max);
    }
    assert.ok(maxHeight > 60, `mountains rise (${maxHeight.toFixed(1)} m)`);
    assert.ok(used[0]! > 0 && used[1]! > 0 && used[2]! > 0, `grass, dirt and rock all paint (${used.join("/")})`);
    assert.equal(world.spawn[1] - world.heightAt(world.spawn[0], world.spawn[2])!, 2);
    assert.ok(Math.abs(world.heightAt(world.spawn[0], world.spawn[2])!) < 15, "spawn is on the valley floor");
  });

}

registerTestWorldTests(test as unknown as Parameters<typeof registerTestWorldTests>[0]);
