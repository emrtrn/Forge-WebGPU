// Ported from Forge WebGL tests/engine/terrainRender.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 14 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { terrainHeightAt } from "./terrainHeightQuery.ts";
import { TerrainWorldHeightBounds, worldTerrainRenderSource } from "./terrainRenderSource.ts";
import { createFlatTerrainTile, type WorldTerrainDef } from "./terrainTypes.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;

function worldDef(tilesX: number, tilesZ: number, layers = 2): WorldTerrainDef {
  return {
    schema: 1,
    type: "worldTerrain",
    name: "Render",
    tileQuads: 32,
    spacing: 2,
    tilesX,
    tilesZ,
    origin: [-40, 5, 12],
    heightMin: -64,
    heightMax: 64,
    layers: Array.from({ length: layers }, (_, index) => ({ id: `l${index}`, name: `L${index}`, color: "#808080" })),
    tiles: [],
    collision: true,
  };
}

export function registerTerrainRenderTests(check: Check): void {
  check("terrain render source: a sparse World Terrain retains world queries, holes and invalidated bounds", () => {
    const def = worldDef(3, 2, 6);
    const tiles = new Map([["0_0", createFlatTerrainTile(def, 0, 0, 4)], ["2_1", createFlatTerrainTile(def, 2, 1, -3)]]);
    def.tiles = [{ key: "0_0", minHeight: 4, maxHeight: 4 }, { key: "2_1", minHeight: -3, maxHeight: -3 }];
    const source = worldTerrainRenderSource(def, tiles);
    assert.deepEqual(source.extent, [192, 128]);
    assert.equal(terrainHeightAt(def, source, -30, 20), 9);
    assert.equal(terrainHeightAt(def, source, 50, 20), null);
    const bounds = new TerrainWorldHeightBounds(source);
    assert.deepEqual(bounds.node(0, 0, 0), { min: 4, max: 4 });
    assert.deepEqual(bounds.range(), { min: -3, max: 4 });
    tiles.get("0_0")!.heights[5] = 30;
    assert.deepEqual(bounds.node(0, 0, 0), { min: 4, max: 4 });
    bounds.updateTile("0_0", { x0: 5, x1: 5, z0: 0, z1: 0 });
    assert.deepEqual(bounds.node(0, 0, 0), { min: 4, max: 30 });
  });
}

registerTerrainRenderTests(test as unknown as Parameters<typeof registerTerrainRenderTests>[0]);
