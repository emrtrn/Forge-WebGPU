// Ported from Forge WebGL engine/world/workers/foliageWorker.ts @ forge-webgl-final (04b5fb23); plan 5c F2.
// The job carries the pure generation params (Forge sent its rule / type defs).
import type { FoliageCellJob, FoliageGeneratorTerrainDef } from "../../foliage/foliageCellGenerator.ts";
import { FoliageTerrainStore } from "../../foliage/proceduralFoliage.ts";
import type { TerrainTileData } from "../../terrain/terrainTypes.ts";

/** Terrain updates are ordered before jobs that read their resident tiles. */
export type FoliageWorkerRequest =
  | { type: "terrain"; terrainId: string; def: FoliageGeneratorTerrainDef }
  | { type: "tile"; terrainId: string; tile: TerrainTileData }
  | { type: "removeTile"; terrainId: string; x: number; z: number }
  | { type: "removeTerrain"; terrainId: string }
  | { type: "generate"; id: number; job: FoliageCellJob };

/** Generated matrices are transferred back; an unscoped error disables the worker. */
export type FoliageWorkerResponse =
  | { type: "generated"; id: number; count: number; matrices: Float32Array }
  | { type: "error"; id: number | null; message: string };

// A local scope type: `src/engine` type-checks without the DOM / WebWorker libraries.
const scope = globalThis as unknown as {
  addEventListener?(type: "message", listener: (event: { readonly data: FoliageWorkerRequest }) => void): void;
  postMessage(message: FoliageWorkerResponse, transfer?: ArrayBuffer[]): void;
};
const store = new FoliageTerrainStore();

// Outside a worker (plain Node: the engine's load gate) the module loads inert.
scope.addEventListener?.("message", ({ data }) => {
  let id: number | null = null;
  try {
    if (!data || typeof data !== "object") throw new Error("Invalid foliage worker request");
    switch (data.type) {
      case "terrain": store.setTerrain(data.terrainId, data.def); break;
      case "tile": store.setTile(data.terrainId, data.tile); break;
      case "removeTile": store.removeTile(data.terrainId, data.x, data.z); break;
      case "removeTerrain": store.removeTerrain(data.terrainId); break;
      case "generate": {
        id = data.id;
        const { terrainId, rule, type, request } = data.job;
        const result = store.generate(terrainId, rule, type, request);
        scope.postMessage({ type: "generated", id, ...result }, [result.matrices.buffer as ArrayBuffer]);
        break;
      }
      default: throw new Error("Invalid foliage worker request");
    }
  } catch (error) {
    scope.postMessage({ type: "error", id, message: error instanceof Error ? error.message : String(error) });
  }
});
