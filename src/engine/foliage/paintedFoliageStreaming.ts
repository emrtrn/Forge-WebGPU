// Ported from Forge WebGL src/scene/foliageCellStreaming.ts @ forge-webgl-final (04b5fb23); plan 5c F4. The level's painted foliage part (forge.levelFoliage/1 + FFOL cells) instead of Forge's sidecar groups; drawing goes through a sink.
import type { LevelFoliageIndex } from "../../core/level/foliage.ts";
import type { FoliageInstances } from "../../core/level/foliageCells.ts";
import { WorldPartitionStreaming, type WorldPartitionGridSettings } from "../world/worldPartitionStreaming.ts";

export interface PaintedFoliageSink {
  /** A cell's instances became active: `perType[i]` belongs to `types[i]` (empty arrays for types it lacks). Returns the instances drawn. */
  addCell(key: string, types: readonly string[], perType: readonly FoliageInstances[]): number;
  removeCell(key: string): void;
}

export interface PaintedFoliageStreamingOptions {
  readonly index: LevelFoliageIndex;
  /** The level's grid: cellSize = index.cellSize, loadRange already scaled for the view distance by the caller. */
  readonly grid: WorldPartitionGridSettings;
  readonly sink: PaintedFoliageSink;
  /** Reads and decodes one listed cell (`foliageCellFileOf(key)`); rejects on a missing / unreadable file. */
  fetchCell(key: string): Promise<readonly FoliageInstances[]>;
  /** Defaults to console.warn. */
  readonly warn?: (message: string) => void;
}

export interface PaintedFoliageSnapshot {
  activeCells: number;
  totalCells: number;
  fetchedCells: number;
  instances: number;
  fetching: number;
}

type CellState =
  | { status: "fetching"; settled: Promise<void> }
  | { status: "ready"; perType: readonly FoliageInstances[] | null };

export class PaintedFoliageStreaming {
  private readonly options: PaintedFoliageStreamingOptions;
  private readonly stream: WorldPartitionStreaming;
  private readonly cells = new Map<string, CellState>();
  private readonly liveInstances = new Map<string, number>();
  private disposed = false;

  constructor(options: PaintedFoliageStreamingOptions) {
    this.options = options;
    this.stream = new WorldPartitionStreaming(options.grid, new Map(), {
      activate: () => {},
      deactivate: () => {},
      isLive: () => false,
      prefetch: (key, wanted) => (wanted ? this.fetch(key) : this.drop(key)),
      isReady: (key) => this.cells.get(key)?.status === "ready",
      cellChanged: (key, active) => (active ? this.build(key) : this.unload(key)),
    }, { occupiedCells: options.index.cells.map((cell) => cell.key) });
  }

  /** Start the whole prefetch ring and wait for the load range before activating it without a budget. */
  async prepare(position: readonly [number, number]): Promise<void> {
    const keys = this.stream.prefetchAround(position);
    await Promise.all(keys.map((key) => this.whenFetched(key)));
    if (!this.disposed) this.stream.prepare(position);
  }

  update(position: readonly [number, number]): void {
    this.stream.update([{ position }]);
  }

  snapshot(): PaintedFoliageSnapshot {
    let instances = 0;
    for (const count of this.liveInstances.values()) instances += count;
    let fetchedCells = 0;
    for (const state of this.cells.values()) if (state.status === "ready") fetchedCells += 1;
    return {
      activeCells: this.liveInstances.size,
      totalCells: this.options.index.cells.length,
      fetchedCells,
      instances,
      fetching: this.cells.size - fetchedCells,
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const key of this.liveInstances.keys()) this.options.sink.removeCell(key);
    this.liveInstances.clear();
    this.cells.clear();
    this.stream.clear();
  }

  private fetch(key: string): void {
    if (this.cells.has(key)) return;
    const state: CellState = {
      status: "fetching",
      settled: this.options.fetchCell(key).then(
        (perType) => { this.settle(key, state, perType); },
        (error: unknown) => {
          if (this.settle(key, state, null)) {
            const warn = this.options.warn ?? console.warn;
            warn(`[foliage-cells] ${key}: ${error instanceof Error ? error.message : String(error)}`);
          }
        },
      ),
    };
    this.cells.set(key, state);
  }

  private settle(key: string, state: CellState, perType: readonly FoliageInstances[] | null): boolean {
    // The request may have left the prefetch ring or been replaced by a later request.
    if (this.disposed || this.cells.get(key) !== state) return false;
    this.cells.set(key, { status: "ready", perType });
    return true;
  }

  private async whenFetched(key: string): Promise<void> {
    const state = this.cells.get(key);
    if (state?.status === "fetching") await state.settled;
  }

  private drop(key: string): void {
    if (!this.liveInstances.has(key)) this.cells.delete(key);
  }

  private build(key: string): void {
    const state = this.cells.get(key);
    const types = this.options.index.types;
    const perType = state?.status === "ready" ? state.perType : null;
    const built = this.options.sink.addCell(key, types, perType ?? types.map(() => ({
      positions: new Float32Array(0),
      rotations: new Float32Array(0),
      scales: new Float32Array(0),
      seeds: new Uint32Array(0),
    })));
    this.liveInstances.set(key, built);
  }

  private unload(key: string): void {
    this.options.sink.removeCell(key);
    this.liveInstances.delete(key);
  }
}
