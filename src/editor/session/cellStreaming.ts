// Editor World Partition (A11): the same camera ranges and hysteresis as
// runtime. Documents enter the edit session, never the play-state ledger.
import {
  cellBounds, cellFileOf, normalizeLevelCell, normalizeLevelCellIndex, parseCellKey,
  type CellAssignOptions, type LevelSession, type SaveClient,
} from "../../core/index.ts";
import { computeStreamingTargets } from "../../engine/world/streamingPolicy.ts";
import { listedCellBounds } from "../../runtime/streaming/cellStreaming.ts";
import type { WorldCellBounds } from "../../core/grid/worldGrid.ts";

export interface EditorCellState {
  readonly key: string;
  readonly loaded: boolean;
  readonly dirty: boolean;
  readonly held: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
}

/** Panel API: no DOM or renderer types. Explicit Load pins cells until Unload. */
export interface EditorCellStreaming {
  update(position: readonly [number, number], multiplier?: number): void;
  cells(): readonly EditorCellState[];
  load(keys: readonly string[]): Promise<boolean>;
  unload(keys: readonly string[]): void;
  hold(keys: readonly string[], held: boolean): void;
  holdRegion(bounds: WorldCellBounds | null): void;
  regions(): readonly WorldCellBounds[];
  onChange(listener: () => void): () => void;
  /** Refresh the listing without reading actors in unloaded cells. */
  refreshIndex(): Promise<void>;
  dispose(): void;
}

export function createEditorCellStreaming(options: {
  readonly level: LevelSession;
  readonly client: SaveClient;
  readonly read: CellAssignOptions;
  readonly busy?: () => () => void;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
}): EditorCellStreaming {
  const { level, client } = options;
  const held = new Set<string>();
  const failed = new Set<string>();
  const pending = new Map<string, Promise<boolean>>();
  const listeners = new Set<() => void>();
  let disposed = false;
  let generation = 0;
  let region: WorldCellBounds | null = null;
  const boundsOf = (key: string): WorldCellBounds => cellBounds(level.level.settings.cellSize, parseCellKey(key)!);
  const overlaps = (a: WorldCellBounds, b: WorldCellBounds): boolean => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  const isHeld = (key: string): boolean => held.has(key) || (region !== null && overlaps(boundsOf(key), region));
  const notify = (): void => { for (const listener of [...listeners]) listener(); };
  const stop = level.onApplied((_changes, cause) => { if (cause === "reload") generation += 1; notify(); });

  const read = (key: string): Promise<boolean> => {
    if (disposed) return Promise.resolve(false);
    if (level.isLoaded(key)) return Promise.resolve(true);
    const existing = pending.get(key);
    if (existing) return existing;
    const ticket = generation;
    const release = options.busy?.();
    const work = (async () => {
      try {
        const file = await client.read(`${level.folder}/${cellFileOf(key)}`);
        if (disposed || ticket !== generation) return false;
        if (!file) throw new Error(`Cell ${key} is missing on disk`);
        const checked = normalizeLevelCell(JSON.parse(file.text), options.read);
        if (!checked.value || !checked.ok || checked.value.cell !== key || checked.value.level !== level.level.id) {
          throw new Error(`Cell ${key} does not check`);
        }
        const issues = level.loadCells([{ doc: checked.value, revision: file.revision }]);
        if (issues.some((issue) => issue.severity === "error")) throw new Error(issues.map((issue) => issue.message).join("; "));
        failed.delete(key);
        return true;
      } catch (error) {
        if (!disposed && ticket === generation) {
          failed.add(key);
          options.status(`Loading ${key} failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
        return false;
      } finally {
        release?.();
        pending.delete(key);
        notify();
      }
    })();
    pending.set(key, work);
    notify();
    return work;
  };

  const api: EditorCellStreaming = {
    update(position, multiplier = 1) {
      if (disposed) return;
      const keys = level.cellKeys();
      const bounds = listedCellBounds(level.level.settings.cellSize, keys);
      if (!bounds) return;
      const loaded = new Set(keys.filter((key) => level.isLoaded(key)));
      const targets = computeStreamingTargets({ loaded, active: loaded }, [{ position }], {
        cellSize: level.level.settings.cellSize,
        loadRange: level.level.settings.loadRange,
        viewDistanceMultiplier: multiplier,
      }, bounds);
      const dirty = new Set(level.dirtyCells());
      for (const key of targets.toUnload) if (!isHeld(key) && !dirty.has(key)) level.unloadCell(key);
      const listed = new Set(keys);
      for (const key of new Set([...targets.toLoad, ...keys.filter(isHeld)])) {
        if (pending.size >= 4) break;
        if (listed.has(key) && !failed.has(key)) void read(key);
      }
    },
    cells() {
      const dirty = new Set(level.dirtyCells());
      return level.cellKeys().map((key) => ({ key, loaded: level.isLoaded(key), dirty: dirty.has(key), held: isHeld(key), loading: pending.has(key), failed: failed.has(key) }));
    },
    async load(keys) {
      api.hold(keys, true);
      // Explicit batches also respect the four-read limit.
      let ok = true;
      for (let at = 0; at < keys.length; at += 4) {
        const results = await Promise.all(keys.slice(at, at + 4).map((key) => { failed.delete(key); return read(key); }));
        ok = results.every(Boolean) && ok;
      }
      return ok;
    },
    unload(keys) {
      region = null;
      for (const key of keys) {
        held.delete(key);
        const result = level.unloadCell(key);
        if (!result.ok) options.status(result.reason ?? `Cell ${key} cannot unload`, "warning");
      }
      notify();
    },
    hold(keys, keep) {
      if (!keep) region = null;
      for (const key of keys) { if (keep) held.add(key); else held.delete(key); }
      notify();
    },
    holdRegion(bounds) { region = bounds ? { ...bounds } : null; notify(); },
    regions: () => [...(region ? [region] : []), ...[...held].map(boundsOf)],
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async refreshIndex() {
      const file = await client.read(`${level.folder}/cells.json`);
      if (disposed) return;
      const checked = file ? normalizeLevelCellIndex(JSON.parse(file.text), options.read) : null;
      if (checked && (!checked.ok || !checked.value)) throw new Error("The cell index does not check");
      generation += 1;
      level.updateCellIndex(checked?.value ?? null);
      failed.clear();
      notify();
    },
    dispose() { disposed = true; generation += 1; stop(); listeners.clear(); },
  };
  return api;
}
