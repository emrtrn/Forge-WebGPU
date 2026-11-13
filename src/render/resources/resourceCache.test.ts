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
    expect(cache.stats()).toEqual({ entries: 0, pending: 0, failed: 1 });
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
