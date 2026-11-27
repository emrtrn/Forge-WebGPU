import type { RecastTileWorker } from "../../engine/navigation/recastPlanner.ts";
import type { RecastTileWorkerResponse } from "../../engine/navigation/workers/recastTileWorker.ts";

/** The planner falls back to in-process tiles if a worker cannot be started. */
export function createBrowserTileBuilder(): (RecastTileWorker & { dispose(): void }) | null {
  if (typeof Worker === "undefined") return null;
  const worker = new Worker(new URL("./recastTileWorker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, { resolve(data: Uint8Array | null): void; reject(error: Error): void }>();
  let next = 1;
  let failure: Error | null = null;
  const fail = (error: Error) => {
    failure = error;
    worker.terminate();
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  worker.onmessage = ({ data }: MessageEvent<RecastTileWorkerResponse>) => {
    if (data.type === "ready") return;
    if (data.type === "error" && data.id === null) {
      fail(new Error(data.message));
      return;
    }
    const request = pending.get(data.id!);
    pending.delete(data.id!);
    if (data.type === "built") request?.resolve(data.bytes);
    else request?.reject(new Error(data.message));
  };
  worker.onerror = (event) => fail(new Error(event.message));
  return {
    lanes: 1,
    build(config, input) {
      return new Promise((resolve, reject) => {
        if (failure) { reject(failure); return; }
        const id = next++;
        pending.set(id, { resolve, reject });
        try { worker.postMessage({ id, config, input }); }
        catch (error) { pending.delete(id); reject(error); }
      });
    },
    dispose() { fail(new Error("Navigation worker stopped.")); },
  };
}
