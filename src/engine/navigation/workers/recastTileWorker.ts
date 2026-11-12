// Ported from Forge WebGL engine/navigation/workers/recastTileWorker.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The worker scope (message wiring) is in src/runtime/navigation/recastTileWorker.ts.
import type { RecastModules } from "../recastNavMesh.ts";
import {
  buildRecastTileBytes,
  createTileRcConfig,
  type RecastRcConfig,
  type RecastTileConfig,
  type RecastTileInput,
} from "../recastTileBuild.ts";

/**
 * Off-main-thread Recast tile builds (OPEN_WORLD_PLAN Faz 9, R3b). Each request
 * carries the mesh's plain {@link RecastTileConfig} and one tile's input (its
 * triangle buffer transferred); the reply transfers the Detour tile bytes back.
 * The worker owns its own wasm instance and caches one Recast config per
 * distinct tile config.
 */
export type RecastTileWorkerRequest = { readonly id: number; readonly config: RecastTileConfig; readonly input: RecastTileInput };
export type RecastTileWorkerResponse =
  | { readonly type: "ready" }
  | { readonly type: "built"; readonly id: number; readonly bytes: Uint8Array | null }
  | { readonly type: "error"; readonly id: number | null; readonly message: string };

/** The request handler, separate from the worker scope so tests can drive it directly. */
export function createRecastTileHandler(modules: RecastModules): (request: RecastTileWorkerRequest) => Uint8Array | null {
  const configs = new Map<string, RecastRcConfig>();
  return ({ config, input }) => {
    const key = JSON.stringify(config);
    let rcConfig = configs.get(key);
    if (!rcConfig) {
      rcConfig = createTileRcConfig(modules.core, config);
      configs.set(key, rcConfig);
    }
    return buildRecastTileBytes(modules.core, rcConfig, config, input);
  };
}
