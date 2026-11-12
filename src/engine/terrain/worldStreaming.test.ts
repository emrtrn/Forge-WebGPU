/** Streaming execution with manual IO and time, plus worker-ready terrain decoding. */
// Ported from Forge WebGL tests/engine/worldStreaming.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 17 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { encodeTerrainTile } from "./terrainTileCodec.ts";
import { decodeTerrainTileForStreaming } from "./terrainTileStreaming.ts";
import { createFlatTerrainTile, type WorldTerrainDef } from "./terrainTypes.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;

function terrainDefinition(layerCount = 5): WorldTerrainDef {
  return {
    schema: 1, type: "worldTerrain", name: "streaming", tileQuads: 32, spacing: 2,
    tilesX: 1, tilesZ: 1, origin: [10, 100, 20], heightMin: -32, heightMax: 32,
    layers: Array.from({ length: layerCount }, (_, i) => ({ id: `l${i}`, name: `Layer ${i}`, color: "#ffffff" })),
    tiles: [{ key: "0_0", minHeight: -10, maxHeight: 20 }], collision: true,
  };
}

export function registerWorldStreamingTests(check: Check): void {
  check("terrain streaming: codec round-trip in metres, min/max, weight blocks and transferable ownership", () => {
    for (const heightFormat of ["u16", "f32"] as const) {
      for (const layerCount of [0, 1, 5, 8]) {
        const def = terrainDefinition(layerCount);
        const tile = createFlatTerrainTile(def, 0, 0, 3);
        tile.heights[0] = -10;
        tile.heights[1] = 20;
        for (let i = 0; i < tile.weights.length; i += 1) tile.weights[i] = i % 256;
        const bytes = encodeTerrainTile(tile, { heightMin: -32, heightMax: 32, heightFormat });
        const decoded = decodeTerrainTileForStreaming(bytes.buffer as ArrayBuffer, def);
        const tolerance = heightFormat === "u16" ? 64 / 65535 : 0;
        assert.ok(Math.abs(decoded.minHeight + 10) <= tolerance);
        assert.ok(Math.abs(decoded.maxHeight - 20) <= tolerance);
        assert.equal(decoded.heights.length, tile.heights.length);
        for (let i = 0; i < tile.heights.length; i += 1) {
          assert.ok(Math.abs(decoded.heights[i]! - tile.heights[i]!) <= tolerance);
        }
        assert.equal(decoded.weights.length, Math.ceil(layerCount / 4));
        const blockLength = 33 * 33 * 4;
        decoded.weights.forEach((block, i) => assert.deepEqual(block, tile.weights.subarray(i * blockLength, (i + 1) * blockLength)));
        assert.equal(new Set(decoded.transfer).size, decoded.transfer.length);
        assert.equal(decoded.transfer.length, layerCount === 0 ? 1 : 2);
        assert.ok(!decoded.transfer.includes(bytes.buffer as ArrayBuffer));
        const moved = structuredClone(decoded, { transfer: decoded.transfer });
        assert.equal(decoded.heights.byteLength, 0);
        assert.equal(moved.heights.length, tile.heights.length);
        moved.weights.forEach((block) => assert.equal(block.byteLength, blockLength));
        assert.ok(bytes.byteLength > 0);
      }
    }
  });

  check("terrain streaming: rejects mismatched headers, summaries and corrupt samples", () => {
    const def = terrainDefinition();
    const tile = createFlatTerrainTile(def, 0, 0, 3);
    const bytes = encodeTerrainTile(tile, { heightMin: -32, heightMax: 32, heightFormat: "f32" });
    for (const altered of [
      { ...def, tileQuads: 64 }, { ...def, layers: [] }, { ...def, heightMin: -64 },
      { ...def, tiles: [] }, { ...def, tiles: [{ key: "0_0", minHeight: 10, maxHeight: 20 }] },
    ]) assert.throws(() => decodeTerrainTileForStreaming(bytes, altered));
    const wrongKey = bytes.slice();
    new DataView(wrongKey.buffer).setInt32(20, 1, true);
    assert.throws(() => decodeTerrainTileForStreaming(wrongKey, def), /no tile/);
    const nonfinite = bytes.slice();
    new DataView(nonfinite.buffer).setFloat32(32, NaN, true);
    assert.throws(() => decodeTerrainTileForStreaming(nonfinite, def), /non-finite/);
    const outsideBounds = bytes.slice();
    new DataView(outsideBounds.buffer).setFloat32(32, 30, true);
    assert.throws(() => decodeTerrainTileForStreaming(outsideBounds, def), /declared bounds/);
    assert.throws(() => decodeTerrainTileForStreaming(bytes.subarray(1), def));
  });
}

registerWorldStreamingTests(test as unknown as Parameters<typeof registerWorldStreamingTests>[0]);
