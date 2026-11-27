// Ported from Forge WebGL tests/engine/terrainRuntimeStreaming.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 4 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { encodeTerrainGlobalMap } from "./terrainGlobalMapFile.ts";
import { loadWorldTerrain, type WorldTerrainDocument } from "./terrainLoader.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "./terrainRenderSource.ts";
import { TerrainRuntimeStreaming, type TerrainColliderTile } from "./terrainRuntimeStreaming.ts";
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

  await checkAsync("terrain streaming activation owns render data and heightfields, physics ring is smaller, release evicts data and holes never block", async () => {
    const full = fixture();
    const doc: WorldTerrainDocument = { ...full, tiles: new Map() };
    const added = new Map<string, TerrainColliderTile>();
    const removed: string[] = [];
    const changed: string[] = [];
    const stream = new TerrainRuntimeStreaming(doc, { id: "actor", name: "World", collision: true }, {
      fetch: async (key) => full.tiles.get(key)!, clock: () => 0, warn: (message) => assert.fail(message),
      changed: (key) => changed.push(key),
      addColliders: (entities) => { for (const entity of entities) { assert.ok(!added.has(entity.id)); added.set(entity.id, entity); } },
      removeColliders: (ids) => { for (const id of ids) { assert.ok(added.delete(id)); removed.push(id); } },
    }, 0);
    const tick = async (position: readonly [number, number]) => {
      for (let i = 0; i < 20; i += 1) { stream.update([{ position }]); await Promise.resolve(); }
    };
    assert.equal(stream.canOccupy([30, 0]), false);
    assert.equal(stream.canOccupy([10 + 3.5 * 64, -20 + 3.5 * 64]), true);
    const ready = stream.world.waitForArea([30, 0], 2);
    await tick([30, 0]);
    await ready;
    assert.equal(stream.canOccupy([30, 0]), true);
    assert.ok(doc.tiles.size > stream.colliders.size);
    assert.ok(stream.colliders.has("0_0"));
    const initialSize = added.size;
    stream.update([{ position: [30, 0] }]);
    assert.equal(added.size, initialSize, "no duplicate collider activation");
    assert.ok(doc.tiles.size < full.tiles.size);
    assert.equal(stream.canOccupy([360, 330]), false, "teleport holds until physics activation");
    await tick([360, 330]);
    assert.equal(stream.canOccupy([360, 330]), true);
    assert.ok(removed.includes("landscape:actor:0_0"));
    assert.ok(!doc.tiles.has("0_0"));
    assert.ok(stream.world.stats().evictions > 0);
    assert.ok(!stream.colliders.has("3_3"));
    assert.ok(changed.filter((key) => key === "0_0").length >= 2);
    stream.dispose();
    assert.equal(added.size, 0);
    assert.equal(doc.tiles.size, 0);
    assert.equal(stream.residentTiles.size, 0);
  });

  await checkAsync("terrain streaming debug grid reports every tile's state row-major for the ?debug map", async () => {
    const full = fixture();
    const doc: WorldTerrainDocument = { ...full, tiles: new Map() };
    const warnings: string[] = [];
    const stream = new TerrainRuntimeStreaming(doc, { id: "actor", name: "World", collision: true }, {
      fetch: (key) => key === "1_2" ? new Promise(() => {})
        : key === "2_0" ? Promise.reject(new Error("broken tile")) : Promise.resolve(full.tiles.get(key)!),
      clock: () => 0, warn: (message) => warnings.push(message), changed: () => {}, addColliders: () => {}, removeColliders: () => {},
    }, 1 << 30);
    const tick = async (position: readonly [number, number]) => {
      for (let i = 0; i < 20; i += 1) { stream.update([{ position }]); await Promise.resolve(); await Promise.resolve(); }
    };
    const at = (x: number, z: number) => stream.debugGrid().cells[z * 6 + x];
    assert.ok(stream.debugGrid().cells.every((state, index) => state === (index === 3 * 6 + 3 ? "undeclared" : "unloaded")));
    await tick([30, 0]);
    const grid = stream.debugGrid();
    assert.deepEqual([grid.tilesX, grid.tilesZ, grid.tileSize, ...grid.origin], [6, 6, 64, 10, -20]);
    assert.equal(at(0, 0), "physics");
    assert.equal(at(1, 1), "active", "inside the render range, outside the physics ring");
    assert.equal(at(1, 2), "fetching");
    assert.equal(at(2, 0), "failed");
    assert.equal(at(3, 3), "undeclared");
    assert.equal(at(5, 5), "unloaded");
    assert.equal(warnings.length, 1);
    await tick([360, 330]);
    assert.equal(at(0, 0), "loaded", "released, still cached under the LRU budget");
    assert.equal(at(1, 2), "unloaded", "an out-of-range fetch is cancelled");
    stream.dispose();
  });
}

await registerTerrainRuntimeStreamingTests(test as unknown as Parameters<typeof registerTerrainRuntimeStreamingTests>[0], test as unknown as Parameters<typeof registerTerrainRuntimeStreamingTests>[1]);
