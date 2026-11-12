// Ported from Forge WebGL tests/engine/terrainRuntimeStreaming.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 6 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { encodeTerrainGlobalMap } from "./terrainGlobalMapFile.ts";
import { loadWorldTerrain } from "./terrainLoader.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "./terrainRenderSource.ts";
import { encodeTerrainTile } from "./terrainTileCodec.ts";
import { createFlatTerrainTile, terrainGlobalMapPath, terrainTilePath, type TerrainTileData, type WorldTerrainDef } from "./terrainTypes.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;
type CheckAsync = (label: string, fn: () => Promise<void>) => Promise<void>;

function fixture() {
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "stream", tileQuads: 64, spacing: 1, tilesX: 6, tilesZ: 6,
    origin: [10, 3, -20], heightMin: 0, heightMax: 20, layers: [{ id: "grass", name: "Grass", color: "#448833" }], tiles: [], collision: true,
  };
  const tiles = new Map<string, TerrainTileData>();
  for (let z = 0; z < 6; z += 1) for (let x = 0; x < 6; x += 1) {
    if (x === 3 && z === 3) continue;
    const tile = createFlatTerrainTile(def, x, z);
    tile.heights.fill(7);
    const key = `${x}_${z}`;
    tiles.set(key, tile);
    def.tiles.push({ key, minHeight: 7, maxHeight: 7 });
  }
  const globalAttributes = buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles));
  return { def, tiles, globalAttributes };
}

export async function registerTerrainRuntimeStreamingTests(check: Check, checkAsync: CheckAsync): Promise<void> {

  await checkAsync("terrain streaming loads only definition/global at boot and preserves the 1x1 eager path", async () => {
    const full = fixture();
    const calls: string[] = [];
    const path = "world.terrain.json";
    const global = encodeTerrainGlobalMap(full.def, full.globalAttributes);
    const doc = await loadWorldTerrain(path, full.def, async (p) => { calls.push(p); return global; }, true);
    assert.deepEqual(calls, [terrainGlobalMapPath(path)]);
    assert.equal(doc.tiles.size, 0);
    await assert.rejects(loadWorldTerrain(path, full.def, async () => { throw new Error("missing"); }, true), /streaming requires a valid global map/);
    const def = { ...full.def, tilesX: 1, tilesZ: 1, tiles: full.def.tiles.slice(0, 1) };
    const bytes = encodeTerrainTile(full.tiles.get("0_0")!, { heightMin: 0, heightMax: 20, heightFormat: "f32" });
    calls.length = 0;
    const single = await loadWorldTerrain(path, def, async (p) => { calls.push(p); return bytes; }, true);
    assert.deepEqual(calls, [terrainTilePath(path, "0_0")]);
    assert.equal(single.tiles.size, 1);
  });
}

registerTerrainRuntimeStreamingTests(test as unknown as Parameters<typeof registerTerrainRuntimeStreamingTests>[0], test as unknown as Parameters<typeof registerTerrainRuntimeStreamingTests>[1]);
