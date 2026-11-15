import { describe, expect, test } from "vitest";
import { Texture } from "three/webgpu";
import { encodeTerrainGlobalMap } from "../../engine/terrain/terrainGlobalMapFile.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../engine/terrain/terrainRenderSource.ts";
import { encodeTerrainTile } from "../../engine/terrain/terrainTileCodec.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import { assetUrlsFromIndex } from "./assetUrls.ts";
import type { SurfaceMaterials, TerrainLayerMaterial } from "./surfaceMaterials.ts";
import { createTerrainSource, terrainLayerScale, TerrainNotFoundError } from "./terrains.ts";

const TERRAIN = "ast_00000000000000000000000000000001";
const MOSS = "ast_00000000000000000000000000000002";
const BROKEN = "ast_00000000000000000000000000000003";
const FILE = "content/levels/valley/terrain/valley.terrain.json";

function fixture(withGlobalMap = false) {
  const { def, tiles } = createFlatWorldTerrain({ name: "Valley", tilesX: 2, tilesZ: 1, tileQuads: 64, spacing: 2, baseHeight: 3, heightMin: -10, heightMax: 10 });
  def.layers = [
    { ...def.layers[0]!, id: "meadow", color: "#6f9a4a", material: MOSS },
    { ...def.layers[0]!, id: "rock", color: "#8b8a84", material: BROKEN },
    { ...def.layers[0]!, id: "bare", color: "#123456" },
  ];
  // Three layers fit the one weight block a flat tile already has.
  for (const tile of tiles.values()) tile.layerCount = def.layers.length;
  const files: Record<string, Uint8Array> = {};
  for (const [key, tile] of tiles) files[`content/levels/valley/terrain/valley.tiles/${key}.tile.bin`] = encodeTerrainTile(tile, { heightMin: def.heightMin, heightMax: def.heightMax });
  if (withGlobalMap) files["content/levels/valley/terrain/valley.global.bin"] = encodeTerrainGlobalMap(def, buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles)));
  const document = { schema: "forge.terrain/1", id: TERRAIN, data: JSON.parse(JSON.stringify(def)) as unknown };
  const urls = assetUrlsFromIndex({ [TERRAIN]: { type: "forge.terrain", file: FILE } }, (file) => file);
  const texture = new Texture();
  const materials = {
    terrainLayer: async (guid: string): Promise<TerrainLayerMaterial> => {
      if (guid !== MOSS) throw new Error("no such material");
      return { baseColor: "#c8c2a7", baseColorTexture: texture, uvTiling: [2, 1], roughness: 0.6, terrainMetersPerRepeat: 0, flipY: true };
    },
  } as unknown as SurfaceMaterials;
  const asked: string[] = [];
  const warnings: string[] = [];
  const source = createTerrainSource({
    urls,
    materials,
    fetchJson: async (url) => {
      asked.push(url);
      return document;
    },
    fetchBytes: async (url) => {
      asked.push(url);
      const bytes = files[url];
      if (!bytes) throw new Error(`${url}: 404`);
      return bytes;
    },
    warn: (message) => warnings.push(message),
    workers: false,
  });
  return { def, tiles, source, asked, warnings, texture };
}

describe("terrain source", () => {
  test("without its global map a terrain reads every tile beside it, builds its far map, and the paint layers' materials", async () => {
    const { tiles, source, asked, warnings, texture } = fixture();
    const terrain = await source.load(TERRAIN);
    expect(asked).toEqual([
      FILE,
      "content/levels/valley/terrain/valley.global.bin",
      "content/levels/valley/terrain/valley.tiles/0_0.tile.bin",
      "content/levels/valley/terrain/valley.tiles/1_0.tile.bin",
    ]);
    expect([...terrain.tiles!.keys()].sort()).toEqual(["0_0", "1_0"]);
    expect(terrain.tiles!.get("0_0")!.heights[0]).toBeCloseTo(tiles.get("0_0")!.heights[0]!, 2);
    expect([terrain.global.map.width, terrain.global.map.height]).toEqual([2 * 64 / 4 + 1, 64 / 4 + 1]);
    const [meadow, rock, bare] = terrain.layers;
    expect(meadow).toEqual({ color: "#c8c2a7", texture, scale: terrainLayerScale(256, 0, [2, 1]), roughness: 0.6, flipY: true });
    // A material that fails paints with the layer's colour; a layer without one too.
    expect(rock).toMatchObject({ color: "#8b8a84", texture: null, roughness: 1 });
    expect(bare).toMatchObject({ color: "#123456", texture: null, roughness: 1 });
    // The missing global map, then the failing material.
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/loads every tile/);
  });

  test("with a valid global map a multi-tile terrain streams: no tile is read until its reader asks", async () => {
    const { tiles, source, asked, warnings } = fixture(true);
    const terrain = await source.load(TERRAIN);
    expect(asked).toEqual([FILE, "content/levels/valley/terrain/valley.global.bin"]);
    expect(terrain.tiles).toBeNull();
    expect(warnings).toHaveLength(1);
    const reader = terrain.openTiles();
    const tile = await reader.read("1_0", new AbortController().signal);
    expect(asked.at(-1)).toBe("content/levels/valley/terrain/valley.tiles/1_0.tile.bin");
    expect([tile.x, tile.z, tile.size, tile.layerCount]).toEqual([1, 0, 65, 3]);
    expect(tile.heights[0]).toBeCloseTo(tiles.get("1_0")!.heights[0]!, 2);
    expect(tile.weights.length).toBe(65 * 65 * 4);
    const aborted = new AbortController();
    aborted.abort();
    await expect(reader.read("0_0", aborted.signal)).rejects.toThrow(/Abort/);
    reader.dispose();
  });

  test("Forge's layer tiling: metres per repeat when set, else width / 8 repeats (1 - 128), times the UV tiling", () => {
    expect(terrainLayerScale(256, 0, [1, 1])).toEqual([32 / 256, 32 / 256]);
    expect(terrainLayerScale(4096, 0, [1, 1])).toEqual([128 / 4096, 128 / 4096]);
    expect(terrainLayerScale(4, 0, [1, 1])).toEqual([1 / 4, 1 / 4]);
    expect(terrainLayerScale(256, 8, [2, 0.5])).toEqual([0.25, 0.0625]);
  });

  test("an asset that is not a terrain in the index is refused", async () => {
    const { source } = fixture();
    await expect(source.load("ast_00000000000000000000000000000009")).rejects.toThrow(TerrainNotFoundError);
  });

  test("a part's address sits beside the document, named from its stem", () => {
    const urls = assetUrlsFromIndex({ [TERRAIN]: { type: "forge.terrain", file: FILE } }, (file) => `/read?path=${file}`);
    expect(urls.part(TERRAIN, ".terrain.json", "{stem}.global.bin")).toBe("/read?path=content/levels/valley/terrain/valley.global.bin");
    expect(urls.part(TERRAIN, ".brief.json", "{stem}.x")).toBeNull();
    expect(urls.part(MOSS, ".terrain.json", "{stem}.x")).toBeNull();
  });
});
