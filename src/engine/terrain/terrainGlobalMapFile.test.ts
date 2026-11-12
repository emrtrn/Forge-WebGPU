// Ported from Forge WebGL tests/engine/terrainGlobalMapFile.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 1 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { decodeTerrainGlobalMap, encodeTerrainGlobalMap, validateTerrainGlobalMap } from "./terrainGlobalMapFile.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "./terrainRenderSource.ts";
import { createFlatTerrainTile, type WorldTerrainDef } from "./terrainTypes.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;

function fixture() {
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "Global", tileQuads: 32, spacing: 1, tilesX: 2, tilesZ: 2,
    origin: [7, 100, -3], heightMin: -8, heightMax: 8, collision: true,
    layers: Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, name: `Layer ${i}`, color: "#123456" })),
    tiles: ["0_0", "1_0", "0_1"].map((key) => ({ key, minHeight: 0, maxHeight: 0 })),
  };
  const tiles = new Map(def.tiles.map(({ key }) => {
    const [x, z] = key.split("_").map(Number) as [number, number];
    const tile = createFlatTerrainTile(def, x, z);
    tile.weights.forEach((_, i) => { tile.weights[i] = i % 256; });
    return [key, tile];
  }));
  const attributes = buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles));
  return { def, attributes, bytes: encodeTerrainGlobalMap(def, attributes) };
}

export function registerTerrainGlobalMapFileTests(check: Check): void {
  check("terrain global file: bit-exact multi-tile round trip preserves NaN payloads, signed zero and both weight blocks", () => {
    const { def, attributes } = fixture();
    attributes.map.heights[0] = -0;
    attributes.normals[0] = -0;
    const hole = attributes.map.heights.findIndex(Number.isNaN);
    assert.ok(hole >= 0);
    new Uint32Array(attributes.map.heights.buffer)[hole] = 0x7fc01234;
    const bytes = encodeTerrainGlobalMap(def, attributes);
    assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), "FGLB");
    const padded = new Uint8Array(bytes.length + 1);
    padded.set(bytes, 1); // An unaligned Buffer/subarray must work too.
    const decoded = validateTerrainGlobalMap(def, padded.subarray(1));
    assert.deepEqual(decoded, attributes);
    assert.deepEqual(new Uint8Array(decoded.map.heights.buffer), new Uint8Array(attributes.map.heights.buffer));
    assert.deepEqual(new Uint8Array(decoded.normals.buffer), new Uint8Array(attributes.normals.buffer));
    assert.deepEqual(encodeTerrainGlobalMap(def, decodeTerrainGlobalMap(bytes)), bytes);
    decoded.weights[0] = 99;
    assert.notEqual(decoded.weights[0], attributes.weights[0], "decode owns its data");
  });
}

registerTerrainGlobalMapFileTests(test as unknown as Parameters<typeof registerTerrainGlobalMapFileTests>[0]);
