// Ported from Forge WebGL engine/loading/loadProgress.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Pure asset-load progress aggregator (Boot / Loading UX, P4.1).
 *
 * Generic and side-effect free: no DOM, no three.js, no game schema. A caller
 * declares the items it expects to load (`expect`), then reports each one as it
 * settles (`markLoaded` / `markFailed`); the tracker derives a `{ total, loaded,
 * failed, pending, fraction, done }` snapshot and notifies subscribers on every
 * change. The runtime binds the snapshot to a loading screen's ViewModel; the
 * engine never learns what a "model" or "texture" is — every item is just an id.
 *
 * Reporting an id that was never declared auto-registers it (so a loader can
 * report completions without a pre-pass), but declaring items up front via
 * `expect` gives an accurate `total` so the progress bar doesn't jump as work is
 * discovered. All transitions are idempotent and re-reportable: marking the same
 * id twice is a no-op, and a retried item can move `failed → loaded` (or back).
 */

export type LoadItemState = "pending" | "loaded" | "failed";

export interface LoadItem {
  readonly id: string;
  /** Human-readable label for the `?debug` breakdown; defaults to the id. */
  readonly label: string;
  readonly state: LoadItemState;
  /** Failure reason, present only while `state === "failed"`. */
  readonly error?: string;
}

export interface LoadProgressSnapshot {
  /** Every declared/reported item. */
  readonly total: number;
  readonly loaded: number;
  readonly failed: number;
  readonly pending: number;
  /**
   * Settled work as a 0..1 ratio: `(loaded + failed) / total`. Defined as 1 when
   * nothing is expected, so an empty scene reads as immediately complete.
   */
  readonly fraction: number;
  /** True once every declared item has settled (loaded or failed). */
  readonly done: boolean;
  /** Ids of items currently in the failed state (for the error screen / retry). */
  readonly failedIds: readonly string[];
}

/** One expected item, as accepted by {@link LoadProgressTracker.expectAll}. */
export type LoadItemInput = string | { id: string; label?: string };

export type LoadProgressListener = (snapshot: LoadProgressSnapshot) => void;

export class LoadProgressTracker {
  private readonly items = new Map<string, { label: string; state: LoadItemState; error?: string }>();
  private readonly listeners = new Set<LoadProgressListener>();
  private loaded = 0;
  private failed = 0;

  /** Declares an expected item as pending. No-op if the id is already tracked. */
  expect(id: string, label?: string): void {
    if (this.items.has(id)) return;
    this.items.set(id, { label: label ?? id, state: "pending" });
    this.notify();
  }

  /** Declares many expected items at once (strings or `{ id, label }`). */
  expectAll(inputs: Iterable<LoadItemInput>): void {
    let changed = false;
    for (const input of inputs) {
      const id = typeof input === "string" ? input : input.id;
      if (this.items.has(id)) continue;
      const label = typeof input === "string" ? id : input.label ?? id;
      this.items.set(id, { label, state: "pending" });
      changed = true;
    }
    if (changed) this.notify();
  }

  /** Marks an item loaded (auto-registering it if never declared). Idempotent. */
  markLoaded(id: string, label?: string): void {
    const item = this.items.get(id);
    if (!item) {
      this.items.set(id, { label: label ?? id, state: "loaded" });
      this.loaded += 1;
      this.notify();
      return;
    }
    if (item.state === "loaded") return;
    if (item.state === "failed") this.failed -= 1;
    item.state = "loaded";
    delete item.error;
    if (label) item.label = label;
    this.loaded += 1;
    this.notify();
  }

  /** Marks an item failed with an optional reason (auto-registering it). Idempotent. */
  markFailed(id: string, error?: string, label?: string): void {
    const item = this.items.get(id);
    if (!item) {
      this.items.set(id, { label: label ?? id, state: "failed", ...(error ? { error } : {}) });
      this.failed += 1;
      this.notify();
      return;
    }
    if (item.state === "failed") {
      // Update the reason but keep the count stable (already-failed re-report).
      if (error !== undefined && item.error !== error) {
        item.error = error;
        this.notify();
      }
      return;
    }
    if (item.state === "loaded") this.loaded -= 1;
    item.state = "failed";
    if (error !== undefined) item.error = error;
    else delete item.error;
    if (label) item.label = label;
    this.failed += 1;
    this.notify();
  }

  /** True when the id has been declared or reported. */
  has(id: string): boolean {
    return this.items.has(id);
  }

  /**
   * Moves every failed item back to pending (for a retry pass). No-op when
   * nothing has failed; the caller re-runs the loads and re-reports each item.
   */
  resetFailed(): void {
    if (this.failed === 0) return;
    for (const item of this.items.values()) {
      if (item.state === "failed") {
        item.state = "pending";
        delete item.error;
      }
    }
    this.failed = 0;
    this.notify();
  }

  /** Clears all items back to an empty tracker (e.g. before a fresh scene load). */
  clear(): void {
    if (this.items.size === 0) return;
    this.items.clear();
    this.loaded = 0;
    this.failed = 0;
    this.notify();
  }

  snapshot(): LoadProgressSnapshot {
    const total = this.items.size;
    const settled = this.loaded + this.failed;
    return {
      total,
      loaded: this.loaded,
      failed: this.failed,
      pending: total - settled,
      fraction: total === 0 ? 1 : settled / total,
      done: settled >= total,
      failedIds: this.failedItems(),
    };
  }

  /** Full per-item list (stable insertion order) for the `?debug` breakdown. */
  entries(): LoadItem[] {
    const out: LoadItem[] = [];
    for (const [id, item] of this.items) {
      out.push(
        item.error !== undefined
          ? { id, label: item.label, state: item.state, error: item.error }
          : { id, label: item.label, state: item.state },
      );
    }
    return out;
  }

  /** Subscribes to snapshot changes; returns an unsubscribe. Fires immediately. */
  subscribe(listener: LoadProgressListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private failedItems(): string[] {
    if (this.failed === 0) return [];
    const ids: string[] = [];
    for (const [id, item] of this.items) if (item.state === "failed") ids.push(id);
    return ids;
  }

  private notify(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

/**
 * Formats a snapshot's settled/total as a compact detail line ("3 / 8"), with a
 * failure suffix when any item failed ("3 / 8 · 1 failed"). Empty when nothing
 * is expected, so the loading overlay hides the detail line for an empty scene.
 */
export function formatLoadDetail(snapshot: LoadProgressSnapshot): string {
  if (snapshot.total === 0) return "";
  const settled = snapshot.loaded + snapshot.failed;
  const base = `${settled} / ${snapshot.total}`;
  return snapshot.failed > 0 ? `${base} · ${snapshot.failed} failed` : base;
}
