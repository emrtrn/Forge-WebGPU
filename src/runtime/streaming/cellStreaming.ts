// World Partition cell streaming in the running game (plan phase 5b step 4,
// decisions 1-2; architecture §4.4 A11, §4.8 the save ledger).
//
// The persistent layer is assembled at boot; the level's cells come and go
// around the streaming sources (the camera until phase 6's player):
//
// - Cell data goes through Forge's WorldStreamingSubsystem: fetched up to
//   PREFETCH_FACTOR × the load range (bounded in-flight count, inactive data
//   kept up to a byte budget), activated within the load range, at most a
//   frame budget of activations per frame. Both ranges are the level's
//   `loadRange` × the quality's view distance multiplier.
// - Activating a cell queues its actors; each frame adds them to the world
//   (`assembleActors`, the same path as the level), parents first, in chunks
//   until ACTOR_BUDGET_MS went (Forge's frame budget at the actor level: a
//   dense cell of hundreds of actors does not land in one frame). The cell is
//   active once all are in (HLOD keeps its proxy until then). An actor the
//   ledger has as removed stays out; an actor with saved state joins with it
//   (`applyActorState`).
// - Deactivating a cell captures each of its actors' state against what was
//   authored into the ledger, then removes the cell's root actors (children go
//   with them).
// - Readiness: while cells are in flight or waiting to activate, a `busy`
//   hold keeps the page from reporting ready (data-forge-ready).
//
// A cell the index does not list is empty: nothing is fetched for it.

import {
  cellBounds,
  effectiveComponents,
  isCellKey,
  parseCellKey,
  createContext,
  type ActorDoc,
  type ActorId,
  type ClassResolver,
  type Issue,
  type LevelId,
  type LevelSettings,
  type SchemaRegistry,
} from "../../core/index.ts";
import { applyActorState, captureActorState, type ActorStateSnapshot } from "../../core/save/actorState.ts";
import { SaveLedger } from "../../core/save/saveLedger.ts";
import { createServiceKey } from "../../core/world/services.ts";
import type { StreamingSource } from "../../engine/world/streamingPolicy.ts";
import { WorldStreamingSubsystem, type WorldCellState, type WorldStreamingStats } from "../../engine/world/worldStreamingSubsystem.ts";
import { assembleActors } from "../assembler.ts";
import { RenderReadinessKey, type RenderReadiness } from "../../engine/world/renderReadiness.ts";
import type { World } from "../world.ts";

/** Cells are fetched this far beyond the load range, so they are in memory before they activate (Forge's prefetch factor). */
export const PREFETCH_FACTOR = 1.5;
/** Cell activations (queueing their actors) start each frame until this much time went (ms). */
export const ACTIVATION_BUDGET_MS = 4;
/** Actors join the world each frame until this much time went (ms), at least one chunk. */
export const ACTOR_BUDGET_MS = 3;
export const ACTOR_CHUNK = 32;
/** Inactive cell data kept in memory, by file size (parsed documents take a few times more). */
export const CELL_MEMORY_BUDGET_BYTES = 16 * 1024 * 1024;

export interface CellPayload {
  readonly actors: readonly ActorDoc[];
  /** The cell file's size, for the inactive-data byte budget. */
  readonly bytes: number;
}

/** Where cell files come from: the dev server, a play session layer or a production build's static content. */
export interface CellSource {
  /** Every cell the level's index lists. */
  readonly cells: readonly string[];
  /** One cell's normalised actors; issues are reported, not thrown. */
  read(key: string, signal: AbortSignal): Promise<{ readonly payload: CellPayload; readonly issues: readonly Issue[] }>;
}

export interface CellStreamingOptions {
  readonly world: World;
  readonly source: CellSource;
  readonly level: LevelId;
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  readonly strict: boolean;
  /** The level's settings now (load range, cell size). */
  readonly settings: () => LevelSettings;
  /** The quality's view distance multiplier now; 1 by default. */
  readonly viewDistanceMultiplier?: () => number;
  /** Holds readiness while the returned release is not called. */
  readonly busy?: () => () => void;
  readonly warn?: (message: string, issues?: readonly Issue[]) => void;
  readonly clock: () => number;
}

export interface CellStreamingSnapshot {
  readonly cells: number;
  readonly active: number;
  readonly loaded: number;
  readonly fetching: number;
  readonly queued: number;
  /** Actors the active cells put in the world. */
  readonly actors: number;
  readonly bytes: number;
  readonly failures: number;
  readonly lastFrameMs: number;
}

export interface CellStreaming {
  /** Once per frame, before the world ticks. */
  update(sources: readonly StreamingSource[]): void;
  /** What unloaded cells keep (A11); a save writes it with the loaded actors' state. */
  readonly ledger: SaveLedger;
  snapshot(): CellStreamingSnapshot;
  /** True while the cell's actors are in the world (HLOD hides its proxy then). */
  isCellActive(key: string): boolean;
  /** Every cell the subsystem tracks; an untracked listed cell is Unloaded. */
  forEachCell(visit: (key: string, state: WorldCellState, failed: boolean) => void): void;
  /** Resolves once every cell within `radius` of the position is active (a later update). */
  waitForArea(position: readonly [number, number], radius: number): Promise<void>;
  dispose(): void;
}

/** The running game's cell streaming, for the `?debug` panel and the measurement. */
export const CellStreamingKey = createServiceKey<CellStreaming>("forge.cellStreaming");

/** The world-space rectangle the listed cells cover; null when there are none. */
export function listedCellBounds(cellSize: number, cells: readonly string[]): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
  let bounds: { minX: number; minZ: number; maxX: number; maxZ: number } | null = null;
  for (const key of cells) {
    const coord = isCellKey(key) ? parseCellKey(key) : null;
    if (!coord) continue;
    const cell = cellBounds(cellSize, coord);
    bounds = bounds === null
      ? { ...cell }
      : { minX: Math.min(bounds.minX, cell.minX), minZ: Math.min(bounds.minZ, cell.minZ), maxX: Math.max(bounds.maxX, cell.maxX), maxZ: Math.max(bounds.maxZ, cell.maxZ) };
  }
  return bounds;
}

const EMPTY: CellPayload = { actors: [], bytes: 0 };

export function createCellStreaming(options: CellStreamingOptions): CellStreaming | null {
  const { world, source } = options;
  const initial = options.settings();
  const bounds = listedCellBounds(initial.cellSize, source.cells);
  if (bounds === null) return null;
  const listed = new Set(source.cells);
  const ledger = new SaveLedger(options.level);
  /** Cell -> the ids its activation added so far (parents first). */
  const live = new Map<string, ActorId[]>();
  /** Cells whose actors are still joining, in activation order: the documents left to add. */
  const joining = new Map<string, ActorDoc[]>();
  /** Actor -> what it is without play: its effective components and level transform. */
  const authored = new Map<ActorId, ActorStateSnapshot>();
  const multiplier = (): number => {
    const value = options.viewDistanceMultiplier?.() ?? 1;
    return Number.isFinite(value) && value > 0 ? value : 1;
  };
  const settings = {
    cellSize: initial.cellSize,
    loadRange: initial.loadRange * PREFETCH_FACTOR,
    activateRange: initial.loadRange,
    viewDistanceMultiplier: multiplier(),
  };

  const activate = (key: string, payload: CellPayload): void => {
    const ctx = createContext({ strict: false });
    const docs: ActorDoc[] = [];
    for (const doc of payload.actors) {
      if (ledger.isRemoved(doc.id)) continue;
      const cls = doc.class === null ? undefined : options.resolveClass(doc.class);
      const authoredState: ActorStateSnapshot = { transform: doc.transform, components: effectiveComponents(doc, cls) };
      authored.set(doc.id, authoredState);
      const saved = ledger.take(doc.id);
      if (!saved) {
        docs.push(doc);
        continue;
      }
      // Saved state is applied to the effective components: the actor joins as a plain actor with them.
      const state = applyActorState(authoredState, saved, options.registry, doc.id, ctx);
      docs.push({ id: doc.id, name: doc.name, parent: doc.parent, spatiallyLoaded: doc.spatiallyLoaded, transform: state.transform, class: null, components: state.components });
    }
    // A child whose parent the ledger removed goes with it; parents come before their children.
    const kept = new Set(docs.map((doc) => doc.id));
    const inCell = new Set(payload.actors.map((doc) => doc.id));
    const byId = new Map(docs.map((doc) => [doc.id, doc]));
    const depth = (doc: ActorDoc): number => {
      let count = 0;
      for (let at = doc.parent; at !== null && byId.has(at) && count < docs.length; at = byId.get(at)!.parent) count += 1;
      return count;
    };
    const ordered = docs
      .filter((doc) => doc.parent === null || kept.has(doc.parent) || !inCell.has(doc.parent))
      .map((doc, index) => ({ doc, index, depth: depth(doc) }))
      .sort((a, b) => a.depth - b.depth || a.index - b.index)
      .map((entry) => entry.doc);
    live.set(key, []);
    joining.set(key, ordered);
    if (ctx.issues.length > 0) options.warn?.(`Cell ${key}: saved state dropped.`, ctx.issues);
  };

  /** Adds queued actors until the budget went; at least one chunk. */
  const join = (): void => {
    const started = options.clock();
    for (const [key, docs] of joining) {
      while (docs.length > 0) {
        const chunk = docs.splice(0, ACTOR_CHUNK);
        try {
          const result = assembleActors(world, chunk, { strict: options.strict, resolveClass: options.resolveClass });
          live.get(key)!.push(...result.actors.map((actor) => actor.id));
          if (result.issues.length > 0) options.warn?.(`Cell ${key}: actors left out.`, result.issues);
        } catch (error) {
          options.warn?.(`Cell ${key}: actors could not be added: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (options.clock() - started >= ACTOR_BUDGET_MS) return;
      }
      joining.delete(key);
    }
  };

  const renderReady = new Set<string>();
  let lastReadiness: RenderReadiness | undefined;
  let lastRevision: number | undefined;
  const deactivate = (key: string): void => {
    renderReady.delete(key);
    for (const doc of joining.get(key) ?? []) authored.delete(doc.id);
    joining.delete(key);
    const ids = live.get(key) ?? [];
    live.delete(key);
    const roots: ActorId[] = [];
    for (const id of ids) {
      const actor = world.context.actor(id);
      const was = authored.get(id);
      authored.delete(id);
      if (!actor) continue;
      if (was) ledger.remember(id, captureActorState(was, { transform: actor.transform, components: actor.components }, options.registry));
      if (actor.parent === null || !ids.includes(actor.parent)) roots.push(id);
    }
    if (roots.length > 0) world.removeActors(roots);
  };

  const subsystem = new WorldStreamingSubsystem<CellPayload>({
    settings,
    bounds,
    clock: options.clock,
    activationBudgetMs: ACTIVATION_BUDGET_MS,
    memoryBudgetBytes: CELL_MEMORY_BUDGET_BYTES,
    warn: (message) => options.warn?.(message),
    loader: {
      async fetch(key, signal) {
        if (!listed.has(key)) return EMPTY;
        const read = await source.read(key, signal);
        if (read.issues.length > 0) options.warn?.(`Cell ${key} was read with issues.`, read.issues);
        return read.payload;
      },
      byteSize: (payload) => payload.bytes,
      activate: (key, payload) => {
        if (payload.actors.length > 0) activate(key, payload);
      },
      deactivate: (key) => deactivate(key),
      dispose: () => {},
    },
  });

  let hold: (() => void) | null = null;
  let disposed = false;
  const streaming: CellStreaming = {
    ledger,
    update(sources) {
      if (disposed) return;
      settings.viewDistanceMultiplier = multiplier();
      subsystem.update(sources);
      join();
      const stats = subsystem.stats();
      const working = stats.inFlight + stats.queued > 0 || joining.size > 0;
      if (working && hold === null && options.busy) hold = options.busy();
      if (!working && hold !== null) {
        hold();
        hold = null;
      }
    },
    snapshot() {
      const stats: WorldStreamingStats = subsystem.stats();
      let actors = 0;
      for (const ids of live.values()) actors += ids.length;
      // Listed (occupied) cells only: empty cells in range are tracked too but hold nothing.
      let active = 0;
      let loaded = 0;
      subsystem.forEachCell((key, state) => {
        if (!listed.has(key)) return;
        if (state === "Activated") active += 1;
        if (state === "Activated" || state === "Loaded") loaded += 1;
      });
      return {
        cells: listed.size,
        active,
        loaded,
        fetching: stats.inFlight,
        queued: stats.queued + joining.size,
        actors,
        bytes: stats.bytesResident,
        failures: stats.failures,
        lastFrameMs: stats.lastFrameMs,
      };
    },
    isCellActive(key) {
      const ids = live.get(key);
      if (!ids || joining.has(key)) return false;
      const readiness = world.services.get(RenderReadinessKey);
      const revision = readiness?.revision;
      if (lastReadiness !== readiness || lastRevision !== revision) {
        renderReady.clear();
        lastReadiness = readiness;
        lastRevision = revision;
      }
      if (!readiness || renderReady.has(key)) return true;
      if (!ids.every((id) => readiness.isActorReady(id))) return false;
      if (revision !== undefined) renderReady.add(key);
      return true;
    },
    forEachCell: (visit) => subsystem.forEachCell(visit),
    waitForArea: (position, radius) => subsystem.waitForArea(position, radius),
    dispose() {
      if (disposed) return;
      disposed = true;
      subsystem.dispose();
      hold?.();
      hold = null;
    },
  };
  return streaming;
}
