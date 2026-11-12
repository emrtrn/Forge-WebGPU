// Ported from Forge WebGL tests/engine/terrainDocument.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 6 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { type LayoutLandscape } from "../legacy/layout.ts";
import { normalizeWorldTerrain } from "./terrainDefinition.ts";
import { encodeTerrainGlobalMap } from "./terrainGlobalMapFile.ts";
import { loadWorldTerrain, validateTerrainTile } from "./terrainLoader.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "./terrainRenderSource.ts";
import { encodeTerrainTile } from "./terrainTileCodec.ts";
import { terrainGlobalMapPath, terrainTileHeightRange, terrainTilePath, type TerrainSpline } from "./terrainTypes.ts";
import { createFlatWorldTerrain } from "./worldTerrainCreate.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;
type CheckAsync = (label: string, fn: () => Promise<void>) => Promise<void>;
const path = "landscapes/test.terrain.json";
const actor: LayoutLandscape = { id: "l", name: "Terrain", position: [10, 2, -3], dataRef: path };

/** A one-tile World Terrain centred on `actor`, with a world-space road on it. */
function fixture() {
  const { def, tiles } = createFlatWorldTerrain({ name: "Terrain", tilesX: 1, tilesZ: 1, tileQuads: 64, spacing: 1, baseHeight: 2 });
  def.origin = [-22, 2, -35];
  const tile = tiles.get("0_0")!;
  tile.heights[0] = 3.25;
  const range = terrainTileHeightRange(tile);
  def.tiles = [{ key: "0_0", minHeight: range.min, maxHeight: range.max }];
  def.layers[1]!.physicalMaterial = "mud";
  def.splines = [{ id: "road", name: "Road", hidden: false, locked: false, smooth: true, smoothness: 0.25, coordinateSpace: "world",
    points: [{ id: "a", position: [10, 2, -3], width: 2, falloff: 1, arriveTangent: [1, 0, 0] },
      { id: "b", position: [14, 2, 1], width: 2, falloff: 1, leaveTangent: [1, 0, 0] }],
    segments: [{ id: "ab", startPointId: "a", endPointId: "b",
      deform: { enabled: true, raiseTerrain: true, lowerTerrain: false, flatten: false, targetOffset: 1 },
      paint: { enabled: true, layerId: "grass", strength: 0.8 },
      mesh: { enabled: true, assetId: "road", collision: true, spacing: 2, scale: [1, 1, 1], offset: [0, 0, 0],
        yawOffset: 0, fitToLength: true, alignToTerrain: true, bank: 2, deform: true } }],
  } as unknown as TerrainSpline];
  const bytes = encodeTerrainTile(tile, { heightMin: def.heightMin, heightMax: def.heightMax, heightFormat: "f32" });
  return { def, tile, bytes, path };
}

export function registerTerrainDocumentTests(check: Check): void {

  check("terrain definition: malformed shape, bounds, layer IDs, keys and spline links are rejected", () => {
    const { def } = fixture();
    for (const patch of [
      { schema: 2 }, { tileQuads: 63 }, { spacing: 0 }, { tilesX: 33 }, { origin: [0, NaN, 0] },
      { heightMax: def.heightMin }, { heightMax: 1e300 }, { collision: "yes" },
      { layers: [...def.layers, def.layers[0]] }, { tiles: [def.tiles[0], def.tiles[0]] },
      { tiles: [{ ...def.tiles[0], key: "01_0" }] }, { tiles: [{ ...def.tiles[0], key: "1_0" }] },
      { tiles: [{ ...def.tiles[0], maxHeight: 10000 }] },
      { layers: [{ ...def.layers[0], physicalMaterial: "lava" }] }, { layers: [{ ...def.layers[0], physicalMaterial: 3 }] },
      { splines: [{ id: "x", points: [], segments: [{ id: "s", startPointId: "x", endPointId: "y" }] }] },
    ]) assert.throws(() => normalizeWorldTerrain({ ...def, ...patch }), JSON.stringify(patch));
  });

}

export async function registerTerrainDocumentAsyncTests(checkAsync: CheckAsync): Promise<void> {
  await checkAsync("terrain loader: uses saved global map, or computes with one warning when missing, corrupt or stale", async () => {
    const { def: single, bytes, path } = fixture();
    // Two tiles wide with (1, 0) a hole: only multi-tile terrains read the sidecar.
    const def = normalizeWorldTerrain({ ...single, tilesX: 2 });
    const tile = validateTerrainTile(def, "0_0", bytes);
    const expected = buildTerrainGlobalAttributes(worldTerrainRenderSource(def, new Map([["0_0", tile]])));
    const global = encodeTerrainGlobalMap(def, expected);
    const saved = global.slice();
    saved[saved.length - 1] = 17;
    const original = console.warn;
    const warnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    try {
      for (const kind of ["valid", "missing", "corrupt", "stale"] as const) {
        warnings.length = 0;
        const shape = kind === "stale" ? { ...def, tilesX: 3 } : def;
        const document = await loadWorldTerrain(path, shape, async (p) => {
          if (p === terrainGlobalMapPath(path)) {
            if (kind === "missing") throw new Error("HTTP 404");
            return kind === "corrupt" ? global.subarray(0, 35) : kind === "valid" ? saved : global;
          }
          assert.equal(p, terrainTilePath(path, "0_0"));
          return bytes;
        });
        assert.equal(warnings.length, kind === "valid" ? 0 : 1);
        if (warnings.length) assert.match(String(warnings[0]![0]), /^\[terrain\].*computing from tiles/);
        const expectedAttributes = kind === "stale"
          ? buildTerrainGlobalAttributes(worldTerrainRenderSource(document.def, document.tiles)) : structuredClone(expected);
        if (kind === "valid") expectedAttributes.weights[expectedAttributes.weights.length - 1] = 17;
        assert.deepEqual(document.globalAttributes, expectedAttributes);
        assert.equal(document.tiles.size, 1, "tiles still load eagerly");
      }
      // A single (0, 0) tile needs no global map: no sidecar request, no warning.
      warnings.length = 0;
      const read: string[] = [];
      const document = await loadWorldTerrain(path, single, async (p) => { read.push(p); return bytes; });
      assert.deepEqual(read, [terrainTilePath(path, "0_0")]);
      assert.equal(document.globalAttributes, undefined);
      assert.equal(warnings.length, 0);
    } finally { console.warn = original; }
  });

  await checkAsync("terrain loader: eagerly reads listed tiles, keeps holes and rejects missing/mismatched binaries", async () => {
    const { def, bytes, path } = fixture();
    const read: string[] = [];
    const document = await loadWorldTerrain(path, { ...def, tilesX: 2 }, async (p) => { read.push(p); return bytes; });
    assert.deepEqual(read, [terrainGlobalMapPath(path), terrainTilePath(path, "0_0")]);
    assert.equal(document.tiles.size, 1);
    await assert.rejects(loadWorldTerrain(path, def, async () => { throw new Error("missing tile"); }), /missing tile/);
    await assert.rejects(loadWorldTerrain(path, def, async () => bytes.subarray(0, 33)));
  });
}

registerTerrainDocumentTests(test as unknown as Parameters<typeof registerTerrainDocumentTests>[0]);
await registerTerrainDocumentAsyncTests(test as unknown as Parameters<typeof registerTerrainDocumentAsyncTests>[0]);
