// The render resource cache (architecture A6, §4.9). It belongs to the render
// host, that is to the GPU device, not to a world: geometry, textures and
// materials are keyed by asset GUID (or by a procedural recipe such as
// `shape:cube`), so two worlds that show the same model share one copy, and
// tearing one world down leaves the other's resources alone.
//
// Each world takes what it uses through its own owner and counts it; disposing
// the world releases its counts. A load that fails is not kept, so the next
// request tries again (Forge's GltfModelLoader rule: a transient failure must
// not poison the id).
//
// Eviction (plan phase 5b step 5, decision 3): every owner's held keys are an
// owner of Forge's AssetResidency. A key no owner holds any more is evicted
// `evictDelayMs` later (Forge's MODEL_EVICT_DELAY_MS, 30 s) on `update()`, the
// host's frame: the entry goes and `dispose` frees what it loaded. Taking it
// again before then keeps it. Without `update()` (tests, tools) nothing is
// evicted.
//
// Pure: no three, no DOM. The loaders and the disposer are handed in.

import { AssetResidency } from "../../engine/world/assetResidency.ts";

export const resourceKey = {
  model: (guid: string): string => `model:${guid}`,
  texture: (guid: string, colorSpace: "srgb" | "linear"): string => `texture:${guid}:${colorSpace}`,
  material: (guid: string, contributions: string): string => `material:${guid}:${contributions}`,
  shape: (primitive: string): string => `shape:${primitive}`,
  terrain: (guid: string): string => `terrain:${guid}`,
  json: (guid: string): string => `json:${guid}`,
} as const;

export interface ResourceOwner {
  /** For messages: which world this is. */
  readonly name: string;
  /**
   * The resource under `key`, loading it on first use. Counts one use for this
   * owner; `release` or `releaseAll` gives it back.
   */
  acquire<T>(key: string, load: () => T | Promise<T>): Promise<T>;
  /** Gives back one use of `key`. */
  release(key: string): void;
  /** Gives back every use this owner holds (the world is going away). */
  releaseAll(): void;
}

export interface ResourceCacheStats {
  /** Entries held, loaded or loading. */
  readonly entries: number;
  /** Entries no owner holds, waiting for their eviction delay. */
  readonly pendingEvict: number;
  /** Entries evicted (and disposed) since the cache was made. */
  readonly evicted: number;
  /** Loads still in flight. */
  readonly pending: number;
  /** Loads that failed since the cache was made. */
  readonly failed: number;
}

export interface ResourceCache {
  /** A world's handle on the cache. */
  owner(name: string): ResourceOwner;
  /** Evicts what waited out its delay (the host's frame). */
  update(): void;
  /** Uses of `key` over every owner. 0 when it is unused or unknown. */
  uses(key: string): number;
  /** True when `key` is held (loaded or loading). */
  has(key: string): boolean;
  stats(): ResourceCacheStats;
  /** Resolves once no load is in flight. */
  settled(): Promise<void>;
  /**
   * Counts `work` (a load outside the cache, e.g. a streamed terrain tile) as
   * pending until it ends and as failed if it rejects, unless it was aborted.
   */
  track<T>(work: Promise<T>): Promise<T>;
  /**
   * Work readiness waits for that is not a load (a streamed tile's upload):
   * pending until the returned call, which ends it once.
   */
  busy(): () => void;
  /**
   * Forgets a resource whatever its uses (the editor reimported the asset,
   * plan phase 4 step 6e): the next acquire loads it again; a release of the
   * old one does nothing. Its users must acquire it again to see the new one.
   */
  evict(key: string): void;
  /** Editor save: all contribution variants of one material are rebuilt together. */
  evictPrefix(prefix: string): void;
}

interface Entry {
  readonly promise: Promise<unknown>;
  uses: number;
}

/** Forge's MODEL_EVICT_DELAY_MS: an unused resource stays this long in case it is taken again. */
export const EVICT_DELAY_MS = 30_000;

export interface ResourceCacheOptions {
  /** Frees what an evicted entry loaded (geometry, materials, textures). */
  readonly dispose?: (key: string, value: unknown) => void;
  readonly evictDelayMs?: number;
  readonly now?: () => number;
}

export function createResourceCache(options: ResourceCacheOptions = {}): ResourceCache {
  const entries = new Map<string, Entry>();
  let pending = 0;
  let failed = 0;
  let evicted = 0;
  let owners = 0;
  const residency = new AssetResidency(
    {
      // The entry is already loading (acquire made it); residency only follows it.
      load: (key) => entries.get(key)?.promise.then(() => undefined) ?? Promise.resolve(),
      evict: (key) => {
        const entry = entries.get(key);
        if (!entry || entry.uses > 0) return;
        entries.delete(key);
        evicted += 1;
        entry.promise.then((value) => options.dispose?.(key, value), () => {});
      },
    },
    { evictDelayMs: options.evictDelayMs ?? EVICT_DELAY_MS, now: options.now ?? (() => Date.now()) },
  );
  let waiters: (() => void)[] = [];

  const finishLoad = (): void => {
    pending -= 1;
    if (pending === 0) {
      const ready = waiters;
      waiters = [];
      for (const resolve of ready) resolve();
    }
  };

  const entryFor = (key: string, load: () => unknown): Entry => {
    const found = entries.get(key);
    if (found) return found;
    pending += 1;
    let promise: Promise<unknown>;
    try {
      promise = Promise.resolve(load());
    } catch (error) {
      promise = Promise.reject(error);
    }
    const entry: Entry = {
      promise: promise.then(
        (value) => {
          finishLoad();
          return value;
        },
        (error: unknown) => {
          failed += 1;
          if (entries.get(key) === entry) entries.delete(key);
          finishLoad();
          throw error;
        },
      ),
      uses: 0,
    };
    entries.set(key, entry);
    return entry;
  };

  return {
    owner(name) {
      // Retain the acquired generation. An asset save may evict/reacquire a
      // key before its old users release it; they must not release the new one.
      const held = new Map<string, Entry[]>();
      const id = `${name}#${(owners += 1)}`;
      const keys = new Set<string>();
      const follow = (key: string): void => {
        const holds = held.has(key);
        if (holds === keys.has(key)) return;
        if (holds) keys.add(key);
        else keys.delete(key);
        residency.setOwner(id, keys);
      };
      return {
        name,
        acquire<T>(key: string, load: () => T | Promise<T>): Promise<T> {
          const entry = entryFor(key, load);
          entry.uses += 1;
          const list = held.get(key) ?? []; list.push(entry); held.set(key, list);
          follow(key);
          return entry.promise as Promise<T>;
        },
        release(key) {
          const list = held.get(key), entry = list?.shift();
          if (!entry) return;
          if (!list!.length) held.delete(key);
          entry.uses = Math.max(0, entry.uses - 1);
          follow(key);
        },
        releaseAll() {
          for (const list of held.values()) for (const entry of list) entry.uses = Math.max(0, entry.uses - 1);
          held.clear();
          keys.clear();
          residency.releaseOwner(id);
        },
      };
    },
    update: () => residency.update(),
    uses: (key) => entries.get(key)?.uses ?? 0,
    has: (key) => entries.has(key),
    stats: () => ({ entries: entries.size, pending, failed, pendingEvict: residency.snapshot().pendingEvict, evicted }),
    settled: () => (pending === 0 ? Promise.resolve() : new Promise<void>((resolve) => waiters.push(resolve))),
    track(work) {
      pending += 1;
      return work.then(
        (value) => {
          finishLoad();
          return value;
        },
        (error: unknown) => {
          if (!(error instanceof Error && error.name === "AbortError")) failed += 1;
          finishLoad();
          throw error;
        },
      );
    },
    busy() {
      pending += 1;
      let open = true;
      return () => {
        if (!open) return;
        open = false;
        finishLoad();
      };
    },
    evict(key) {
      entries.delete(key);
    },
    evictPrefix(prefix) {
      for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
    },
  };
}
