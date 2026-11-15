// Ported from Forge WebGL engine/world/workers/terrainWorker.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
import { ContentLoadError, type ContentFailure } from "../../assets/contentValidation.ts";
import { normalizeWorldTerrain } from "../../terrain/terrainDefinition.ts";
import { decodeTerrainTileForStreaming, type StreamingTerrainTile } from "../../terrain/terrainTileStreaming.ts";
import { tileKey, type WorldTerrainDef } from "../../terrain/terrainTypes.ts";

/** Initialize once per terrain, then transfer each request's bytes to this worker. */
export type TerrainWorkerRequest = { type: "init"; def: WorldTerrainDef } | { key: string; bytes: ArrayBuffer };
export type TerrainWorkerResponse =
  | { type: "ready" }
  | { type: "decoded"; key: string; payload: StreamingTerrainTile }
  | { type: "error"; key: string | null; error: { name: string; message: string; reason: ContentFailure } };

// A local scope type avoids mixing DOM and WebWorker library declarations.
// The event is spelled out too (Forge named the DOM's MessageEvent): `src/engine`
// type-checks without the DOM library.
const scope = globalThis as unknown as {
  addEventListener?(type: "message", listener: (event: { readonly data: TerrainWorkerRequest }) => void): void;
  postMessage(message: TerrainWorkerResponse, transfer?: ArrayBuffer[]): void;
};
let definition: WorldTerrainDef | null = null;

// Outside a worker (plain Node: the engine's load gate) the module loads inert.
scope.addEventListener?.("message", ({ data }) => {
  let key: string | null = null;
  try {
    if (!data || typeof data !== "object") throw new Error("Invalid terrain worker request");
    if ("type" in data && data.type === "init") {
      definition = null;
      definition = normalizeWorldTerrain(data.def);
      scope.postMessage({ type: "ready" });
      return;
    }
    if (!("key" in data) || typeof data.key !== "string") {
      throw new Error("Invalid terrain worker request");
    }
    key = data.key;
    if (!(data.bytes instanceof ArrayBuffer)) throw new Error("Invalid terrain worker bytes");
    if (!definition) throw new Error("Terrain worker requires init before decoding");
    const payload = decodeTerrainTileForStreaming(data.bytes, definition);
    const header = new DataView(data.bytes);
    if (tileKey(header.getInt32(20, true), header.getInt32(24, true)) !== key) {
      throw new Error(`terrain tile ${key} header does not match request`);
    }
    scope.postMessage({ type: "decoded", key, payload }, payload.transfer);
  } catch (error) {
    scope.postMessage({ type: "error", key, error: {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
      reason: error instanceof ContentLoadError ? error.reason : "invalid-data",
    } });
  }
});
