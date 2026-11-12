// Ported from Forge WebGL engine/navigation/workers/recastTileWorker.ts (worker scope) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The worker entry: browser worker messaging, so it lives in runtime (src/engine has no
// DOM / WebWorker types); the request handler and message types stay in
// src/engine/navigation/workers/recastTileWorker.ts.
import { loadRecastModules } from "../../engine/navigation/recastNavMesh.ts";
import {
  createRecastTileHandler,
  type RecastTileWorkerRequest,
  type RecastTileWorkerResponse,
} from "../../engine/navigation/workers/recastTileWorker.ts";

// A local scope type avoids mixing DOM and WebWorker library declarations.
const scope = globalThis as unknown as {
  addEventListener?(type: "message", listener: (event: MessageEvent<RecastTileWorkerRequest>) => void): void;
  postMessage(message: RecastTileWorkerResponse, transfer?: ArrayBuffer[]): void;
};

// Only inside a worker: importing this module elsewhere (tests) registers nothing.
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== "undefined" && scope.addEventListener) {
  const handler = loadRecastModules().then(
    (modules) => {
      scope.postMessage({ type: "ready" });
      return createRecastTileHandler(modules);
    },
    (error: unknown) => {
      scope.postMessage({ type: "error", id: null, message: error instanceof Error ? error.message : String(error) });
      return null;
    },
  );
  scope.addEventListener("message", ({ data }) => {
    void handler.then((handle) => {
      if (!handle) return;
      const id = data && typeof data.id === "number" ? data.id : null;
      try {
        if (id === null || !data.config || !data.input || !(data.input.positions instanceof Float32Array)) {
          throw new Error("Invalid Recast tile request");
        }
        const bytes = handle(data);
        scope.postMessage({ type: "built", id, bytes }, bytes ? [bytes.buffer as ArrayBuffer] : []);
      } catch (error) {
        scope.postMessage({ type: "error", id, message: error instanceof Error ? error.message : String(error) });
      }
    });
  });
}
