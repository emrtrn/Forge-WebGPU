// Terrain data for the renderer (plan phase 3 step 8, decision 1: the
// read-only drawing of spike S2). A `forge.terrain` data document by GUID:
// its definition (the engine's normaliser, unchanged), every tile part
// (`{stem}.tiles/<key>.tile.bin`, the engine's codec) and its paint layers'
// materials (GUIDs, user decision 2026-11-13) as the layer inputs Forge's
// runtime resolved (RuntimeSceneApp.resolveRuntimeLandscapeLayerTextures):
// colour, base colour texture, tiling, roughness. Kept in the host's cache
// (`terrain:<guid>`); the GPU side is the binding's (materials/terrain.ts).
//
// All tiles load at once: tile streaming is phase 5a. The global map part is
// not read: the render source builds it from the tiles, as the spike did. A
// layer whose material fails paints with its colour, as Forge drew one.

import { normalizeWorldTerrain } from "../../engine/terrain/terrainDefinition.ts";
import { worldTerrainRenderSource, type TerrainRenderSource } from "../../engine/terrain/terrainRenderSource.ts";
import { TERRAIN_RENDER_LAYERS } from "../../engine/terrain/terrainRenderData.ts";
import { decodeTerrainTile } from "../../engine/terrain/terrainTileCodec.ts";
import type { TerrainTileData, WorldTerrainDef } from "../../engine/terrain/terrainTypes.ts";
import { worldTerrainExtent } from "../../engine/terrain/worldTerrainActor.ts";
import type { Texture } from "three/webgpu";
import type { AssetUrls } from "./assetUrls.ts";
import type { SurfaceMaterials } from "./surfaceMaterials.ts";

export const TERRAIN_DOCUMENT_SUFFIX = ".terrain.json";
const TERRAIN_SCHEMA = "forge.terrain/1";
/** Tiles fetched at once. */
const TILE_BATCH = 16;

export class TerrainNotFoundError extends Error {
  constructor(guid: string, why: string) {
    super(`Terrain ${guid}: ${why}.`);
    this.name = "TerrainNotFoundError";
  }
}

/** One paint layer as the terrain material draws it. */
export interface TerrainLayerInput {
  /** `#rrggbb`: the material's base colour, else the layer's own. */
  readonly color: string;
  readonly texture: Texture | null;
  /** UV per local metre (x, z). */
  readonly scale: readonly [number, number];
  readonly roughness: number;
  /** The texture is sampled with V flipped (an uncompressed image under a flipping material). */
  readonly flipY: boolean;
}

export interface TerrainData {
  readonly def: WorldTerrainDef;
  readonly tiles: ReadonlyMap<string, TerrainTileData>;
  readonly source: TerrainRenderSource;
  readonly layers: readonly TerrainLayerInput[];
}

export interface TerrainSource {
  load(guid: string): Promise<TerrainData>;
}

/**
 * Forge's layer tiling (RuntimeSceneApp + landscape.ts): UV per metre is
 * 1 / terrainMetersPerRepeat when the material sets it, else
 * clamp(round(width / 8), 1, 128) / width; times the material's UV tiling.
 */
export function terrainLayerScale(width: number, metersPerRepeat: number, uvTiling: readonly [number, number]): [number, number] {
  const tiling = Math.min(128, Math.max(1, Math.round(width / 8)));
  const scale = metersPerRepeat > 0 ? 1 / metersPerRepeat : tiling / width;
  return [scale * uvTiling[0], scale * uvTiling[1]];
}

export interface TerrainSourceOptions {
  readonly urls: AssetUrls;
  /** Null: every layer paints with its colour. */
  readonly materials: SurfaceMaterials | null;
  readonly fetchJson?: (url: string, headers: Readonly<Record<string, string>>) => Promise<unknown>;
  readonly fetchBytes?: (url: string, headers: Readonly<Record<string, string>>) => Promise<Uint8Array>;
  readonly warn?: (message: string, error: unknown) => void;
}

const defaultFetchJson = async (url: string, headers: Readonly<Record<string, string>>): Promise<unknown> => {
  const response = await fetch(url, { headers: { ...headers } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
};

const defaultFetchBytes = async (url: string, headers: Readonly<Record<string, string>>): Promise<Uint8Array> => {
  const response = await fetch(url, { headers: { ...headers } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

export function createTerrainSource(options: TerrainSourceOptions): TerrainSource {
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const fetchBytes = options.fetchBytes ?? defaultFetchBytes;
  const warn = options.warn ?? ((message, error) => console.warn(message, error));
  const { urls } = options;
  return {
    async load(guid) {
      const url = urls.url(guid);
      if (url === null || urls.type(guid) !== "forge.terrain") throw new TerrainNotFoundError(guid, "not a terrain in the asset index");
      const document = (await fetchJson(url, urls.headers)) as { schema?: unknown; data?: unknown };
      if (document.schema !== TERRAIN_SCHEMA) throw new TerrainNotFoundError(guid, `expected "${TERRAIN_SCHEMA}"`);
      const def = normalizeWorldTerrain(document.data);
      const tiles = new Map<string, TerrainTileData>();
      const keys = def.tiles.map((tile) => tile.key);
      for (let start = 0; start < keys.length; start += TILE_BATCH) {
        await Promise.all(
          keys.slice(start, start + TILE_BATCH).map(async (key) => {
            const tileUrl = urls.part(guid, TERRAIN_DOCUMENT_SUFFIX, `{stem}.tiles/${key}.tile.bin`);
            if (tileUrl === null) throw new TerrainNotFoundError(guid, "its tiles have no address");
            tiles.set(key, decodeTerrainTile(await fetchBytes(tileUrl, urls.headers)));
          }),
        );
      }
      const source = worldTerrainRenderSource(def, tiles);
      const width = worldTerrainExtent(def)[0];
      const layers = await Promise.all(
        def.layers.slice(0, TERRAIN_RENDER_LAYERS).map(async (layer): Promise<TerrainLayerInput> => {
          const own = layer.color ?? "#808080";
          if (!layer.material || options.materials === null) return { color: own, texture: null, scale: terrainLayerScale(width, 0, [1, 1]), roughness: 1, flipY: false };
          try {
            const material = await options.materials.terrainLayer(layer.material);
            const texture = material.baseColorTexture;
            return {
              color: material.baseColor,
              texture,
              scale: terrainLayerScale(width, material.terrainMetersPerRepeat, material.uvTiling),
              // Forge: a layer without a texture is matte.
              roughness: texture ? material.roughness : 1,
              flipY: material.flipY && (texture as (Texture & { isCompressedTexture?: boolean }) | null)?.isCompressedTexture !== true,
            };
          } catch (error) {
            warn(`forge render: terrain ${guid} layer ${layer.id} paints with its colour (material ${layer.material})`, error);
            return { color: own, texture: null, scale: terrainLayerScale(width, 0, [1, 1]), roughness: 1, flipY: false };
          }
        }),
      );
      return { def, tiles, source, layers };
    },
  };
}
