// The render resource cache (architecture A6, §4.9). It belongs to the render
// host, that is to the GPU device, not to a world: geometry, textures and
// materials are keyed by asset GUID (or by a procedural recipe such as
// `shape:cube`), so two worlds that show the same model share one copy, and
// tearing one world down leaves the other's resources alone.
//
// Each world takes what it uses through its own owner and counts it; disposing
// the world releases its counts. Evicting an entry whose count reached zero,
// and the memory budget, come with streaming in phase 5b: until then an entry
// stays loaded after its last user leaves. A load that fails is not kept, so
// the next request tries again (Forge's GltfModelLoader rule: a transient
// failure must not poison the id).
//
// Pure: no three, no DOM. The loaders are handed in by whoever asks.

export const resourceKey = {
  model: (guid: string): string => `model:${guid}`,
  texture: (guid: string, colorSpace: "srgb" | "linear"): string => `texture:${guid}:${colorSpace}`,
  material: (guid: string, contributions: string): string => `material:${guid}:${contributions}`,
  shape: (primitive: string): string => `shape:${primitive}`,
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
  /** Loads still in flight. */
  readonly pending: number;
  /** Loads that failed since the cache was made. */
  readonly failed: number;
}

export interface ResourceCache {
  /** A world's handle on the cache. */
  owner(name: string): ResourceOwner;
  /** Uses of `key` over every owner. 0 when it is unused or unknown. */
  uses(key: string): number;
  /** True when `key` is held (loaded or loading). */
  has(key: string): boolean;
  stats(): ResourceCacheStats;
  /** Resolves once no load is in flight. */
  settled(): Promise<void>;
}

interface Entry {
  readonly promise: Promise<unknown>;
  uses: number;
}

export function createResourceCache(): ResourceCache {
  const entries = new Map<string, Entry>();
  let pending = 0;
  let failed = 0;
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
      const held = new Map<string, number>();
      const giveBack = (key: string, count: number): void => {
        const entry = entries.get(key);
        if (entry) entry.uses = Math.max(0, entry.uses - count);
      };
      return {
        name,
        acquire<T>(key: string, load: () => T | Promise<T>): Promise<T> {
          const entry = entryFor(key, load);
          entry.uses += 1;
          held.set(key, (held.get(key) ?? 0) + 1);
          return entry.promise as Promise<T>;
        },
        release(key) {
          const count = held.get(key) ?? 0;
          if (count === 0) return;
          if (count === 1) held.delete(key);
          else held.set(key, count - 1);
          giveBack(key, 1);
        },
        releaseAll() {
          for (const [key, count] of held) giveBack(key, count);
          held.clear();
        },
      };
    },
    uses: (key) => entries.get(key)?.uses ?? 0,
    has: (key) => entries.has(key),
    stats: () => ({ entries: entries.size, pending, failed }),
    settled: () => (pending === 0 ? Promise.resolve() : new Promise<void>((resolve) => waiters.push(resolve))),
  };
}
