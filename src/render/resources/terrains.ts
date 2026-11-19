// Terrain data for the renderer (plan phase 3 step 8, decision 1; streaming
// phase 5a step 2). A `forge.terrain` data document by GUID: its definition
// (the engine's normaliser, unchanged), its far map and its paint layers'
// materials (GUIDs, user decision 2026-11-13) as the layer inputs Forge's
// runtime resolved (RuntimeSceneApp.resolveRuntimeLandscapeLayerTextures):
// colour, base colour texture, tiling, roughness. Kept in the host's cache
// (`terrain:<guid>`); the GPU side is the binding's (sync/terrainView.ts).
//
// Tiles (phase 5a decision 3, Forge's loadWorldTerrain): a multi-tile terrain
// with a valid global map part (`{stem}.global.bin`) streams. Only the
// definition and the map are read here; the binding reads tiles around its
// camera through `openTiles` (fetch, then decode in a worker,
// resources/terrainWorkerPool.ts). A single tile, or a terrain whose map is
// missing or does not match, loads every tile at once and builds its map from
// them, as before. Tiles are checked against the definition either way
// (header, bounds, summary). A layer whose material fails paints with its
// colour, as Forge drew one.
//
// The editor (plan 5d step 2) also needs what a file was read as: the
// revision the dev server reports (`X-Forge-Revision`) for the document, the
// far map and each tile read at once (`revisions`), and a tile's raw bytes
// with theirs (`readTile`), decoded by the editor against its own, possibly
// wider, definition.

import { normalizeWorldTerrain } from "../../engine/terrain/terrainDefinition.ts";
import { validateTerrainGlobalMap } from "../../engine/terrain/terrainGlobalMapFile.ts";
import { validateTerrainTile } from "../../engine/terrain/terrainLoader.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource, type TerrainGlobalAttributes } from "../../engine/terrain/terrainRenderSource.ts";
import { TERRAIN_RENDER_LAYERS } from "../../engine/terrain/terrainRenderData.ts";
import { decodeTerrainTileForStreaming, type StreamingTerrainTile } from "../../engine/terrain/terrainTileStreaming.ts";
import type { TerrainHeightFormat } from "../../engine/terrain/terrainTileCodec.ts";
import { parseTileKey, type TerrainTileData, type WorldTerrainDef } from "../../engine/terrain/terrainTypes.ts";
import { isMultiTileTerrain, worldTerrainExtent } from "../../engine/terrain/worldTerrainActor.ts";
import type { Texture } from "three/webgpu";
import type { AssetUrls } from "./assetUrls.ts";
import type { SurfaceMaterials, TerrainLayerDetail } from "./surfaceMaterials.ts";
import { TerrainWorkerPool } from "./terrainWorkerPool.ts";

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
  /** The layer's textures are read with V flipped (a flipping material; the layer array honours it). */
  readonly flipY: boolean;
  /** Tangent-space normal map (linear). */
  readonly normalTexture: Texture | null;
  /** Roughness map (green), packed into the albedo's alpha by the layer array. */
  readonly roughnessTexture: Texture | null;
  /** Forge's static normal stamps; null when off. */
  readonly detail: TerrainLayerDetail | null;
}

/** A file's bytes and the revision the server reported (null where it reports none). */
export interface TerrainFileRead {
  readonly bytes: Uint8Array;
  readonly revision: string | null;
}

/** Reads streamed tiles of one terrain; dispose ends its workers and fails what is in flight. */
export interface TerrainTileReader {
  read(key: string, signal: AbortSignal): Promise<TerrainTileData>;
  dispose(): void;
}

export interface TerrainData {
  readonly def: WorldTerrainDef;
  /** The far map: the global map part when the terrain streams, else built from every tile. */
  readonly global: TerrainGlobalAttributes;
  /** Every tile when the terrain loads at once; null when it streams. */
  readonly tiles: ReadonlyMap<string, TerrainTileData> | null;
  readonly layers: readonly TerrainLayerInput[];
  /** A reader for streamed tiles (a terrain loaded at once reads from `tiles`). */
  openTiles(): TerrainTileReader;
  /** What the files were read as: revisions of the document, the far map part (null when absent) and each tile of `tiles`. */
  readonly revisions: {
    readonly document: string | null;
    readonly global: string | null;
    readonly tiles: ReadonlyMap<string, { readonly format: TerrainHeightFormat; readonly revision: string | null }>;
  };
  /** One tile's file as it is now, undecoded (the editor's reads). */
  readTile(key: string, signal?: AbortSignal): Promise<TerrainFileRead>;
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
  /** A file's bytes, with its revision when the fetcher knows it. */
  readonly fetchBytes?: (url: string, headers: Readonly<Record<string, string>>, signal?: AbortSignal) => Promise<Uint8Array | TerrainFileRead>;
  readonly warn?: (message: string, error: unknown) => void;
  /** Decode streamed tiles in workers (default: when `Worker` exists). */
  readonly workers?: boolean;
}

/** The dev server's revision header (tools/server/forgeServer.ts). */
const REVISION_HEADER = "X-Forge-Revision";

const defaultFetchBytes = async (url: string, headers: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<TerrainFileRead> => {
  const response = await fetch(url, { headers: { ...headers }, ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), revision: response.headers.get(REVISION_HEADER) };
};

export function createTerrainSource(options: TerrainSourceOptions): TerrainSource {
  const fetchRead = async (url: string, headers: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<TerrainFileRead> => {
    const read = await (options.fetchBytes ?? defaultFetchBytes)(url, headers, signal);
    return read instanceof Uint8Array ? { bytes: read, revision: null } : read;
  };
  const fetchBytes = async (url: string, headers: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<Uint8Array> => (await fetchRead(url, headers, signal)).bytes;
  // A given JSON fetcher (tests) reports no revision; the default reads the document's bytes with theirs.
  const fetchDocument = async (url: string, headers: Readonly<Record<string, string>>): Promise<{ value: unknown; revision: string | null }> => {
    if (options.fetchJson) return { value: await options.fetchJson(url, headers), revision: null };
    const read = await fetchRead(url, headers);
    return { value: JSON.parse(new TextDecoder().decode(read.bytes)), revision: read.revision };
  };
  const warn = options.warn ?? ((message, error) => console.warn(message, error));
  const { urls } = options;
  return {
    async load(guid) {
      const url = urls.url(guid);
      if (url === null || urls.type(guid) !== "forge.terrain") throw new TerrainNotFoundError(guid, "not a terrain in the asset index");
      const fetched = await fetchDocument(url, urls.headers);
      const document = fetched.value as { schema?: unknown; data?: unknown };
      if (document.schema !== TERRAIN_SCHEMA) throw new TerrainNotFoundError(guid, `expected "${TERRAIN_SCHEMA}"`);
      const def = normalizeWorldTerrain(document.data);
      const tileUrl = (key: string): string => {
        const found = urls.part(guid, TERRAIN_DOCUMENT_SUFFIX, `{stem}.tiles/${key}.tile.bin`);
        if (found === null) throw new TerrainNotFoundError(guid, "its tiles have no address");
        return found;
      };
      let global: TerrainGlobalAttributes | null = null;
      let globalRevision: string | null = null;
      const tileFiles = new Map<string, { format: TerrainHeightFormat; revision: string | null }>();
      if (isMultiTileTerrain(def)) {
        const mapUrl = urls.part(guid, TERRAIN_DOCUMENT_SUFFIX, "{stem}.global.bin");
        try {
          if (mapUrl === null) throw new Error("the global map has no address");
          const read = await fetchRead(mapUrl, urls.headers);
          global = validateTerrainGlobalMap(def, read.bytes);
          globalRevision = read.revision;
        } catch (error) {
          warn(`forge render: terrain ${guid} loads every tile: its global map is missing or does not match`, error);
        }
      }
      let tiles: Map<string, TerrainTileData> | null = null;
      if (global === null) {
        const all = new Map<string, TerrainTileData>();
        const keys = def.tiles.map((tile) => tile.key);
        for (let start = 0; start < keys.length; start += TILE_BATCH) {
          await Promise.all(
            keys.slice(start, start + TILE_BATCH).map(async (key) => {
              const read = await fetchRead(tileUrl(key), urls.headers);
              const tile = validateTerrainTile(def, key, read.bytes);
              all.set(key, tile);
              tileFiles.set(key, { format: tile.heightFormat, revision: read.revision });
            }),
          );
        }
        tiles = all;
        global = buildTerrainGlobalAttributes(worldTerrainRenderSource(def, all));
      }
      const asTile = (key: string, payload: StreamingTerrainTile): TerrainTileData => {
        const { x, z } = parseTileKey(key)!;
        // The weight blocks share one buffer (the codec's; transferred whole from a worker).
        const weights = payload.weights.length ? new Uint8Array(payload.weights[0]!.buffer) : new Uint8Array();
        return { x, z, size: def.tileQuads + 1, heights: payload.heights, layerCount: def.layers.length, weights };
      };
      const useWorkers = options.workers ?? typeof Worker !== "undefined";
      const openTiles = (): TerrainTileReader => {
        const pool = useWorkers ? new TerrainWorkerPool(def) : null;
        return {
          async read(key, signal) {
            const bytes = await fetchBytes(tileUrl(key), urls.headers, signal);
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");
            if (!pool) return asTile(key, decodeTerrainTileForStreaming(bytes, def));
            // The pool transfers its buffer: give it one of its own.
            const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
            const owned = whole ? (bytes.buffer as ArrayBuffer) : (bytes.slice().buffer as ArrayBuffer);
            return asTile(key, await pool.decode(key, owned, signal));
          },
          dispose() {
            pool?.dispose();
          },
        };
      };
      const width = worldTerrainExtent(def)[0];
      const layers = await Promise.all(
        def.layers.slice(0, TERRAIN_RENDER_LAYERS).map(async (layer): Promise<TerrainLayerInput> => {
          const own = layer.color ?? "#808080";
          const plain: TerrainLayerInput = { color: own, texture: null, scale: terrainLayerScale(width, 0, [1, 1]), roughness: 1, flipY: false, normalTexture: null, roughnessTexture: null, detail: null };
          if (!layer.material || options.materials === null) return plain;
          try {
            const material = await options.materials.terrainLayer(layer.material);
            const texture = material.baseColorTexture;
            return {
              color: material.baseColor,
              texture,
              scale: terrainLayerScale(width, material.terrainMetersPerRepeat, material.uvTiling),
              // Forge: a layer without a texture is matte.
              roughness: texture || material.roughnessTexture ? material.roughness : 1,
              flipY: material.flipY,
              normalTexture: material.normalTexture,
              roughnessTexture: material.roughnessTexture,
              detail: material.detail,
            };
          } catch (error) {
            warn(`forge render: terrain ${guid} layer ${layer.id} paints with its colour (material ${layer.material})`, error);
            return plain;
          }
        }),
      );
      return {
        def, global, tiles, layers, openTiles,
        revisions: { document: fetched.revision, global: globalRevision, tiles: tileFiles },
        readTile: (key, signal) => fetchRead(tileUrl(key), urls.headers, signal),
      };
    },
  };
}
