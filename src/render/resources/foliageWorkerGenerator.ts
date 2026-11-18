// Foliage ring cells generated off the main thread (plan 5c F2): Forge WebGL's
// WorkerFoliageCellGenerator (src/scene/foliageCellGenerator.ts @
// forge-webgl-final), unchanged but for its home and the worker's URL. One
// ordered worker runs engine/world/workers/foliageWorker.ts (pure,
// three-free); terrain tiles are copied in, matrices transferred back. The
// same-thread generator mirrors every terrain and tile, so a worker that fails
// hands its pending jobs to it with one warning and the ring never notices.
//
// Lives in the render layer, beside the terrain worker pool (a browser API;
// `src/engine` stays DOM-free). Where `Worker` is missing (Node tests) the
// same-thread generator runs instead.

import {
  LocalFoliageCellGenerator, type FoliageCellGenerator, type FoliageCellJob, type FoliageGeneratorTerrainDef,
} from "../../engine/foliage/foliageCellGenerator.ts";
import type { GeneratedFoliageCell } from "../../engine/foliage/proceduralFoliage.ts";
import type { TerrainTileData } from "../../engine/terrain/terrainTypes.ts";
import type { FoliageWorkerRequest, FoliageWorkerResponse } from "../../engine/world/workers/foliageWorker.ts";

const DISPOSED_MESSAGE = "Foliage cell generator disposed";

interface PendingJob {
  job: FoliageCellJob;
  resolve(result: GeneratedFoliageCell): void;
  reject(error: unknown): void;
}

/** One ordered worker, with mirrored local state and transparent fallback after a failure. */
export class WorkerFoliageCellGenerator implements FoliageCellGenerator {
  private readonly local = new LocalFoliageCellGenerator();
  private readonly pending = new Map<number, PendingJob>();
  private worker: Worker | null = null;
  private nextId = 0;
  private disposed = false;
  private warned = false;

  constructor() {
    try {
      const worker = new Worker(new URL("../../engine/world/workers/foliageWorker.ts", import.meta.url), { type: "module" });
      this.worker = worker;
      worker.onmessage = ({ data }: MessageEvent<FoliageWorkerResponse>) => {
        if (this.worker !== worker || this.disposed) return;
        if (data.type === "error" && data.id === null) {
          this.fallback(new Error(data.message));
          return;
        }
        if (data.id === null) return;
        const pending = this.pending.get(data.id);
        if (!pending) return;
        this.pending.delete(data.id);
        if (data.type === "generated") pending.resolve({ count: data.count, matrices: data.matrices });
        else pending.reject(new Error(data.message));
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        this.fallback(new Error(event.message || "Foliage worker failed"));
      };
      worker.onmessageerror = () => this.fallback(new Error("Foliage worker message could not be decoded"));
    } catch (error) { this.fallback(error); }
  }

  setTerrain(terrainId: string, def: FoliageGeneratorTerrainDef): void {
    if (this.disposed) return;
    this.local.setTerrain(terrainId, def);
    // Only what generation reads: the definition may carry more (splines, tile summaries).
    const { tileQuads, spacing, tilesX, tilesZ, origin, layers } = def;
    this.post({ type: "terrain", terrainId, def: { tileQuads, spacing, tilesX, tilesZ, origin: [...origin], layers: layers.map((layer) => ({ id: layer.id })) } });
  }

  setTile(terrainId: string, tile: TerrainTileData): void {
    if (this.disposed) return;
    this.local.setTile(terrainId, tile);
    if (!this.worker) return;
    const copy = { ...tile, heights: tile.heights.slice(), weights: tile.weights.slice() };
    this.post({ type: "tile", terrainId, tile: copy }, [copy.heights.buffer as ArrayBuffer, copy.weights.buffer as ArrayBuffer]);
  }

  removeTile(terrainId: string, x: number, z: number): void {
    if (this.disposed) return;
    this.local.removeTile(terrainId, x, z);
    this.post({ type: "removeTile", terrainId, x, z });
  }

  removeTerrain(terrainId: string): void {
    if (this.disposed) return;
    this.local.removeTerrain(terrainId);
    this.post({ type: "removeTerrain", terrainId });
  }

  generate(job: FoliageCellJob): Promise<GeneratedFoliageCell> {
    if (this.disposed) return Promise.reject(new Error(DISPOSED_MESSAGE));
    if (!this.worker) return this.local.generate(job);
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { job, resolve, reject });
      this.post({ type: "generate", id, job });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopWorker();
    this.local.dispose();
    for (const pending of this.pending.values()) pending.reject(new Error(DISPOSED_MESSAGE));
    this.pending.clear();
  }

  private post(message: FoliageWorkerRequest, transfer: ArrayBuffer[] = []): void {
    try { this.worker?.postMessage(message, transfer); }
    catch (error) { this.fallback(error); }
  }

  private stopWorker(): void {
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  }

  private fallback(error: unknown): void {
    if (this.disposed) return;
    this.stopWorker();
    if (!this.warned) {
      this.warned = true;
      console.warn("Foliage worker failed; using local foliage generation", error);
    }
    for (const [id, pending] of this.pending) {
      this.local.generate(pending.job).then((result) => {
        if (this.pending.delete(id)) pending.resolve(result);
      }, (failure: unknown) => {
        if (this.pending.delete(id)) pending.reject(failure);
      });
    }
  }
}

/** Uses one worker when available, otherwise the same-thread generator. */
export function createFoliageCellGenerator(): FoliageCellGenerator {
  return typeof Worker !== "undefined" ? new WorkerFoliageCellGenerator() : new LocalFoliageCellGenerator();
}
