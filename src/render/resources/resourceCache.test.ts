import { describe, expect, test } from "vitest";
import { createResourceCache, resourceKey } from "./resourceCache.ts";

describe("resource cache", () => {
  test("one load per key, shared by owners; uses are counted per owner", async () => {
    const cache = createResourceCache();
    const a = cache.owner("a");
    const b = cache.owner("b");
    let loads = 0;
    const load = async () => ({ id: ++loads });
    const [first, second] = await Promise.all([a.acquire("model:x", load), b.acquire("model:x", load)]);
    expect(first).toBe(second);
    expect(loads).toBe(1);
    expect(cache.uses("model:x")).toBe(2);
    a.releaseAll();
    expect(cache.uses("model:x")).toBe(1);
    // The entry stays loaded at zero uses until eviction exists (phase 5b).
    b.release("model:x");
    expect(cache.uses("model:x")).toBe(0);
    expect(cache.has("model:x")).toBe(true);
    expect(await a.acquire("model:x", load)).toBe(first);
    expect(loads).toBe(1);
  });

  test("release gives back one use and never more than the owner holds", async () => {
    const cache = createResourceCache();
    const a = cache.owner("a");
    const b = cache.owner("b");
    await a.acquire("k", () => 1);
    await a.acquire("k", () => 1);
    await b.acquire("k", () => 1);
    a.release("k");
    a.release("k");
    a.release("k");
    expect(cache.uses("k")).toBe(1);
  });

  test("a failed load is not kept: the next request loads again", async () => {
    const cache = createResourceCache();
    const owner = cache.owner("a");
    let attempt = 0;
    const load = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("network");
      return "ok";
    };
    await expect(owner.acquire("model:y", load)).rejects.toThrow("network");
    expect(cache.has("model:y")).toBe(false);
    expect(cache.stats().failed).toBe(1);
    expect(await owner.acquire("model:y", load)).toBe("ok");
    expect(attempt).toBe(2);
  });

  test("a loader that throws synchronously is a failed load, not a crash", async () => {
    const cache = createResourceCache();
    await expect(
      cache.owner("a").acquire("k", () => {
        throw new Error("bad");
      }),
    ).rejects.toThrow("bad");
    expect(cache.stats()).toMatchObject({ entries: 0, pending: 0, failed: 1 });
  });

  test("pending counts loads in flight; settled waits for them", async () => {
    const cache = createResourceCache();
    let finish!: (value: string) => void;
    const promise = cache.owner("a").acquire("k", () => new Promise<string>((resolve) => (finish = resolve)));
    expect(cache.stats().pending).toBe(1);
    let settled = false;
    const waiting = cache.settled().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    finish("done");
    expect(await promise).toBe("done");
    await waiting;
    expect(settled).toBe(true);
    expect(cache.stats().pending).toBe(0);
  });

  test("keys name the resource kind and GUID", () => {
    expect(resourceKey.model("ast_1")).toBe("model:ast_1");
    expect(resourceKey.texture("ast_2", "srgb")).toBe("texture:ast_2:srgb");
    expect(resourceKey.material("ast_3", "wind")).toBe("material:ast_3:wind");
    expect(resourceKey.shape("cube")).toBe("shape:cube");
  });
});

test("evict forgets a resource whatever its uses: the next acquire loads again; releasing the old use is harmless", async () => {
  const cache = createResourceCache();
  const owner = cache.owner("world");
  let loads = 0;
  const load = () => ++loads;
  expect(await owner.acquire("model:a", load)).toBe(1);
  cache.evict("model:a");
  expect(cache.has("model:a")).toBe(false);
  owner.release("model:a");
  expect(await owner.acquire("model:a", load)).toBe(2);
  expect(cache.uses("model:a")).toBe(1);
});

test("releasing an old generation after a save does not release the new material", async () => {
  const cache = createResourceCache(), owner = cache.owner("preview");
  await owner.acquire("material:a:lit", () => 1); cache.evictPrefix("material:a:");
  await owner.acquire("material:a:lit", () => 2);
  owner.release("material:a:lit"); expect(cache.uses("material:a:lit")).toBe(1);
  owner.releaseAll(); expect(cache.uses("material:a:lit")).toBe(0);
});

test("tracked work and busy holds count as pending until they end; a tracked failure counts, an abort does not", async () => {
  const cache = createResourceCache();
  let finish!: (value: number) => void;
  const tracked = cache.track(new Promise<number>((resolve) => (finish = resolve)));
  const end = cache.busy();
  expect(cache.stats().pending).toBe(2);
  let settled = false;
  void cache.settled().then(() => (settled = true));
  finish(3);
  expect(await tracked).toBe(3);
  expect(cache.stats().pending).toBe(1);
  end();
  end();
  expect(cache.stats().pending).toBe(0);
  await Promise.resolve();
  expect(settled).toBe(true);
  await expect(cache.track(Promise.reject(new Error("404")))).rejects.toThrow("404");
  await expect(cache.track(Promise.reject(new DOMException("Aborted", "AbortError")))).rejects.toThrow("Aborted");
  expect(cache.stats()).toMatchObject({ pending: 0, failed: 1 });
});

describe("eviction (phase 5b step 5: Forge's asset residency over the owners)", () => {
  const setup = () => {
    let now = 0;
    const disposed: string[] = [];
    const cache = createResourceCache({ evictDelayMs: 1000, now: () => now, dispose: (key, value) => disposed.push(`${key}=${String(value)}`) });
    return { cache, disposed, at: (time: number) => { now = time; cache.update(); } };
  };
  /** Residency hears a load settle a few microtasks after the cache's promise. */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  test("an entry no owner holds is evicted and disposed once, after the delay", async () => {
    const { cache, disposed, at } = setup();
    const a = cache.owner("a");
    await a.acquire("model:1", () => "m1");
    a.release("model:1");
    await flush();
    at(999);
    expect(cache.has("model:1")).toBe(true);
    expect(cache.stats().pendingEvict).toBe(1);
    at(1000);
    await flush();
    expect(cache.has("model:1")).toBe(false);
    expect(disposed).toEqual(["model:1=m1"]);
    at(5000);
    expect(disposed).toHaveLength(1);
    expect(cache.stats()).toMatchObject({ entries: 0, pendingEvict: 0, evicted: 1 });
  });

  test("taking it again before the delay keeps it; another owner's use keeps it; releaseAll counts as releasing", async () => {
    const { cache, disposed, at } = setup();
    const a = cache.owner("a");
    const b = cache.owner("b");
    await a.acquire("texture:1:srgb", () => "t");
    a.release("texture:1:srgb");
    await flush();
    at(500);
    await a.acquire("texture:1:srgb", () => "again");
    at(2000);
    expect(cache.has("texture:1:srgb")).toBe(true);
    await b.acquire("texture:1:srgb", () => "unused");
    a.releaseAll();
    at(4000);
    expect(cache.has("texture:1:srgb")).toBe(true);
    b.release("texture:1:srgb");
    await flush();
    at(4500);
    at(5500);
    await flush();
    expect(cache.has("texture:1:srgb")).toBe(false);
    expect(disposed).toEqual(["texture:1:srgb=t"]);
  });

  test("a failed load is not disposed; without update nothing is evicted", async () => {
    const { cache, disposed, at } = setup();
    const a = cache.owner("a");
    await expect(a.acquire("model:2", () => Promise.reject(new Error("404")))).rejects.toThrow("404");
    a.release("model:2");
    await flush();
    at(5000);
    expect(disposed).toEqual([]);
    const idle = createResourceCache({ evictDelayMs: 0 });
    const owner = idle.owner("x");
    await owner.acquire("shape:cube", () => 1);
    owner.release("shape:cube");
    expect(idle.has("shape:cube")).toBe(true);
  });
});
