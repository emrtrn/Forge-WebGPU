import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { HlodBuildStatus } from "../../core/level/hlodBuild.ts";
import { createHlodController, type HlodController, type HlodControllerOptions } from "./hlodController.ts";

const level = "content/levels/Valley";
const preferenceKey = "project-a:content/levels/Valley:hlod-auto";
const controllers: HlodController[] = [];
const result = (state: HlodBuildStatus["state"] = "current", publication: string | null = null, queued = false): HlodBuildStatus =>
  ({ level, state, publication, queued });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<HlodControllerOptions> = {}) {
  let dirty = false;
  const request = vi.fn<HlodControllerOptions["request"]>(async () => result());
  const poll = vi.fn<HlodControllerOptions["poll"]>(async () => result());
  const reload = vi.fn<HlodControllerOptions["reload"]>(async () => {});
  const save = vi.fn<HlodControllerOptions["save"]>(async () => { dirty = false; return { ok: true, message: "Saved" }; });
  const status = vi.fn<NonNullable<HlodControllerOptions["status"]>>();
  const storage = { getItem: vi.fn((): string | null => null), setItem: vi.fn() };
  const controller = createHlodController({ level, writable: true, preferenceKey, storage, dirty: () => dirty,
    request, poll, reload, save, status, ...overrides });
  controllers.push(controller);
  return { controller, request, poll, reload, save, status, storage, setDirty(value: boolean) { dirty = value; } };
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
});

test("start is idempotent and automatically requests a clean scene's missing HLOD", async () => {
  const h = setup();
  expect(h.controller.snapshot()).toMatchObject({ auto: true, writable: true, dirty: false, status: { state: "missing" } });
  h.request.mockResolvedValueOnce(result("building"));
  h.controller.start(); h.controller.start();
  expect(h.controller.snapshot().busy).toBe(true);
  await tick();
  expect(h.request.mock.calls).toEqual([[{ level, build: true, force: false }]]);
  expect(h.save).not.toHaveBeenCalled();
  await tick(500);
  expect(h.poll).toHaveBeenCalledTimes(1);
  expect(h.controller.snapshot()).toMatchObject({ busy: false, status: { state: "current" } });
});

test.each(["false", " FALSE ", "0", "off", "no"])("stored %s disables automatic builds using the supplied scoped key", async (value) => {
  const storage = { getItem: vi.fn(() => value), setItem: vi.fn() };
  const h = setup({ storage });
  h.controller.start(); await tick();
  expect(storage.getItem).toHaveBeenCalledWith(preferenceKey);
  expect(h.controller.snapshot().auto).toBe(false);
  expect(h.request).toHaveBeenCalledWith({ level, build: false, force: false });
  h.controller.setAuto(true);
  expect(storage.setItem).toHaveBeenCalledWith(preferenceKey, "true");
  await tick(400);
  expect(h.request).toHaveBeenLastCalledWith({ level, build: true, force: false });
});

test("storage denial and absent storage leave an operational session preference", async () => {
  const h = setup({ storage: { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } } });
  h.controller.setAuto(false);
  h.controller.start(); await tick();
  expect(h.controller.snapshot().auto).toBe(false);
  expect(h.request).toHaveBeenCalledWith({ level, build: false, force: false });
  const withoutStorage = setup({ storage: null });
  withoutStorage.controller.setAuto(false);
  expect(withoutStorage.controller.snapshot().auto).toBe(false);
});

test("auto and dirty state are re-read immediately before dispatch", async () => {
  const h = setup();
  h.controller.start(); h.controller.setAuto(false);
  await tick();
  expect(h.request).toHaveBeenCalledWith({ level, build: false, force: false });
  h.controller.setAuto(true);
  const unsubscribe = h.controller.onChange(() => {
    if (h.controller.snapshot().busy) h.setDirty(true);
  });
  await tick(400); unsubscribe();
  expect(h.request).toHaveBeenLastCalledWith({ level, build: false, force: false });
});

test("manual generation forces a build independently of auto", async () => {
  const h = setup();
  h.controller.setAuto(false);
  h.controller.start(); await tick();
  await h.controller.generate();
  expect(h.request.mock.calls).toEqual([
    [{ level, build: false, force: false }], [{ level, build: true, force: true }],
  ]);
  expect(h.save).not.toHaveBeenCalled();
});

test("manual generation waits for an initial freshness request and still forces exactly one build", async () => {
  const h = setup(); const initial = deferred<HlodBuildStatus>();
  h.request.mockReturnValueOnce(initial.promise);
  h.controller.start(); await tick();
  const first = h.controller.generate(); const second = h.controller.generate();
  await tick(); expect(h.request).toHaveBeenCalledTimes(1);
  initial.resolve(result()); await first; await second;
  expect(h.request.mock.calls).toEqual([
    [{ level, build: true, force: false }], [{ level, build: true, force: true }],
  ]);
});

test("edits and streaming notification spam only update the dirty view, without saving or requesting", async () => {
  const h = setup();
  h.setDirty(true);
  h.controller.start(); await tick();
  const changed = vi.fn();
  const unsubscribe = h.controller.onChange(changed);
  for (let i = 0; i < 100; i++) h.controller.edited();
  h.controller.setAuto(false); h.controller.setAuto(true);
  await tick(5000);
  expect(changed).toHaveBeenCalled();
  expect(h.controller.snapshot()).toMatchObject({ dirty: true, busy: false, status: { state: "stale" } });
  expect(h.request.mock.calls).toEqual([[{ level, build: false, force: false }]]);
  expect(h.save).not.toHaveBeenCalled();
  unsubscribe(); changed.mockClear(); h.controller.edited();
  expect(changed).not.toHaveBeenCalled();
});

test.each(["current", "missing", "stale", "checking", "building", "failed"] as const)("dirty view preserves active/failed status and overlays stable %s", async (state) => {
  const h = setup();
  h.request.mockResolvedValueOnce(result(state));
  h.controller.start(); await tick();
  h.setDirty(true); h.controller.edited();
  expect(h.controller.snapshot().status.state).toBe(["checking", "building", "failed"].includes(state) ? state : "stale");
  expect(h.controller.snapshot().dirty).toBe(true);
});

test("manual dirty generation awaits one explicit save, consumes save events, then forces one build", async () => {
  const h = setup();
  h.setDirty(true); h.controller.start(); await tick(); h.request.mockClear();
  const saving = deferred<{ ok: boolean; message: string }>();
  const order: string[] = [];
  h.save.mockImplementation(() => { order.push("save"); return saving.promise; });
  h.request.mockImplementation(async () => { order.push("build"); return result(); });
  const first = h.controller.generate();
  const second = h.controller.generate();
  expect(second).toBe(first);
  await tick(1000);
  expect(order).toEqual(["save"]);
  expect(h.controller.snapshot()).toMatchObject({ busy: true, dirty: true });
  h.setDirty(false); h.controller.saved();
  saving.resolve({ ok: true, message: "Saved" });
  await first; await tick(1000);
  expect(order).toEqual(["save", "build"]);
  expect(h.request.mock.calls).toEqual([[{ level, build: true, force: true }]]);
  expect(h.controller.snapshot()).toMatchObject({ dirty: false, busy: false });
});

test("failed explicit save reports its message and never submits a build", async () => {
  const h = setup();
  h.setDirty(true); h.controller.start(); await tick(); h.request.mockClear();
  h.save.mockImplementation(async () => {
    h.controller.saved();
    return { ok: false, message: "Save conflict" };
  });
  await h.controller.generate(); await tick(2000);
  expect(h.request).not.toHaveBeenCalled();
  expect(h.status).toHaveBeenCalledWith("Save conflict", "error");
  expect(h.controller.snapshot()).toMatchObject({ dirty: true, busy: false, status: { state: "stale" } });
});

test("edits remaining after a successful save require another explicit action, without a second save or build", async () => {
  const h = setup();
  h.setDirty(true); h.controller.start(); await tick(); h.request.mockClear();
  const saving = deferred<{ ok: boolean; message: string }>();
  h.save.mockReturnValue(saving.promise);
  const generation = h.controller.generate(); await tick();
  h.controller.edited(); h.controller.saved();
  saving.resolve({ ok: true, message: "Saved older edits" });
  await generation; await tick(2000);
  expect(h.request).not.toHaveBeenCalled();
  expect(h.save).toHaveBeenCalledTimes(1);
  expect(h.status).toHaveBeenCalledWith(expect.any(String), "warning");
  expect(h.controller.snapshot()).toMatchObject({ dirty: true, status: { state: "stale" } });
});

test("save exceptions are reported without an unhandled rejection", async () => {
  const h = setup(); h.setDirty(true);
  h.save.mockRejectedValue(new Error("Save unavailable"));
  await h.controller.generate();
  expect(h.status).toHaveBeenCalledWith("Save unavailable", "error");
  expect(h.request).not.toHaveBeenCalled();
  expect(h.controller.snapshot().busy).toBe(false);
});

test("successful save notifications coalesce for 400ms; dirty changes during debounce permit only a disk check", async () => {
  const h = setup();
  h.controller.start(); await tick(); h.request.mockClear();
  h.controller.saved(); await tick(300);
  h.controller.saved(); await tick(399);
  expect(h.request).not.toHaveBeenCalled();
  await tick(1);
  expect(h.request.mock.calls).toEqual([[{ level, build: true, force: false }]]);
  h.controller.saved(); h.setDirty(true); h.controller.edited();
  await tick(400);
  expect(h.request).toHaveBeenLastCalledWith({ level, build: false, force: false });
  expect(h.save).not.toHaveBeenCalled();
});

test("disabling auto during debounce prevents a build and leaves in-flight work polling", async () => {
  const h = setup();
  h.controller.start(); await tick(); h.request.mockClear();
  h.controller.saved(); h.controller.setAuto(false); await tick(400);
  expect(h.request).toHaveBeenCalledWith({ level, build: false, force: false });
  h.controller.setAuto(true); h.request.mockResolvedValueOnce(result("building"));
  await tick(400);
  h.controller.setAuto(false);
  await tick(500);
  expect(h.poll).toHaveBeenCalledTimes(1);
  expect(h.save).not.toHaveBeenCalled();
  expect(h.controller.snapshot().status.state).toBe("current");
});

test("own output files, painted foliage, other levels, terrain binary tiles and unrelated docs never create a watcher loop", async () => {
  const h = setup();
  h.controller.start(); await tick(); h.request.mockClear();
  h.controller.diskChanged([
    `${level}/hlod.json`, `${level}/hlod.json.meta.json`, `${level}/hlod/0_0.glb`,
    `${level}/hlod/0_0.glb.meta.json`, `${level}Other/level.json`, "levels/Other/cells/0_0.json",
    `${level}/terrain/valley.tiles/0_0.tile.bin`, `${level}/terrain/valley.global.bin`, "docs/readme.md",
    `${level}/foliage.json`, `${level}/foliage/0_0.bin`, `${level}/foliage/-1_2.bin`, "content\\levels\\Valley\\foliage\\1_0.bin",
  ]);
  await tick(2000);
  expect(h.request).not.toHaveBeenCalled();
});

test.each([`${level}/level.json`, "levels/Valley/cells/0_0.json", "content\\levels\\Valley\\cells\\1_0.json",
  "content/models/house.glb", "content/materials/stone.material.json", "content/textures/stone.webp",
  "content/classes/house.actorClass.json", "content/models/house.glb.meta.json", "content/models/hlod/house.glb",
  "content/models/foliage/fern.glb"])("dependency candidate %s schedules a freshness request", async (path) => {
  const h = setup();
  h.controller.start(); await tick(); h.request.mockClear();
  h.controller.diskChanged([path]); await tick(399);
  expect(h.request).not.toHaveBeenCalled();
  await tick(1);
  expect(h.request.mock.calls).toEqual([[{ level, build: true, force: false }]]);
  expect(h.save).not.toHaveBeenCalled();
});

test("checking/building/queued results poll at 500ms without creating build requests", async () => {
  const h = setup();
  h.request.mockResolvedValueOnce(result("checking"));
  h.poll.mockResolvedValueOnce(result("building"))
    .mockResolvedValueOnce(result("current", "pending-publication", true))
    .mockResolvedValueOnce(result("current", "complete"));
  h.controller.start(); await tick(499);
  expect(h.poll).not.toHaveBeenCalled();
  await tick(1); expect(h.poll).toHaveBeenCalledTimes(1);
  await tick(500); expect(h.poll).toHaveBeenCalledTimes(2);
  expect(h.reload).not.toHaveBeenCalled();
  expect(h.controller.snapshot().busy).toBe(true);
  await tick(500); await tick(5000);
  expect(h.poll).toHaveBeenCalledTimes(3);
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(h.reload).toHaveBeenCalledTimes(1);
  expect(h.controller.snapshot().busy).toBe(false);
});

test("a queued publication keeps its active state while dirty and is not reloaded early", async () => {
  const h = setup();
  h.request.mockResolvedValueOnce(result("current", "queued", true));
  h.controller.start(); await tick(); h.setDirty(true); h.controller.edited();
  expect(h.controller.snapshot()).toMatchObject({ dirty: true, busy: true, status: { state: "current", queued: true } });
  expect(h.reload).not.toHaveBeenCalled();
});

test("poll errors stop polling and expose a failed state until manual retry", async () => {
  const h = setup();
  h.request.mockResolvedValueOnce(result("building")); h.poll.mockRejectedValueOnce(new Error("Poll unavailable"));
  h.controller.start(); await tick(5000);
  expect(h.controller.snapshot()).toMatchObject({ busy: false, status: { state: "failed", message: "Poll unavailable" } });
  expect(h.poll).toHaveBeenCalledTimes(1);
  expect(h.request).toHaveBeenCalledTimes(1);
  await h.controller.generate();
  expect(h.request).toHaveBeenLastCalledWith({ level, build: true, force: true });
});

test.each(["current", "missing", "stale", "failed"] as const)("terminal %s does not poll or automatically retry", async (state) => {
  const h = setup(); h.request.mockResolvedValueOnce(result(state));
  h.controller.start(); await tick(10000);
  expect(h.poll).not.toHaveBeenCalled();
  expect(h.request).toHaveBeenCalledTimes(1);
});

test("reloads exactly once per completed publication, including the initial publication", async () => {
  const h = setup();
  h.request.mockResolvedValue(result("current", "a"));
  h.controller.start(); await tick();
  expect(h.reload).toHaveBeenCalledTimes(1);
  h.controller.saved(); await tick(400);
  expect(h.reload).toHaveBeenCalledTimes(1);
  h.request.mockResolvedValueOnce(result("building", "b"));
  h.poll.mockResolvedValueOnce(result("failed", "b"));
  h.controller.saved(); await tick(900);
  expect(h.reload).toHaveBeenCalledTimes(1);
  h.request.mockResolvedValueOnce(result("current", "b"));
  await h.controller.generate(); await tick();
  expect(h.reload).toHaveBeenCalledTimes(2);
  h.request.mockResolvedValueOnce(result("current", "a"));
  h.controller.saved(); await tick(400);
  expect(h.reload).toHaveBeenCalledTimes(2);
});

test("read-only start can show missing/unsupported and manual actions never save or build", async () => {
  const h = setup({ writable: false });
  h.request.mockResolvedValue({ ...result("missing"), message: "Unsupported source" });
  h.controller.start(); await tick();
  expect(h.controller.snapshot()).toMatchObject({ writable: false, status: { state: "missing", message: "Unsupported source" } });
  h.setDirty(true); await h.controller.generate();
  h.controller.saved(); h.controller.diskChanged(["content/models/tree.glb"]); await tick(400);
  expect(h.request.mock.calls.every(([request]) => !request.build)).toBe(true);
  expect(h.request).toHaveBeenCalledTimes(2);
  expect(h.save).not.toHaveBeenCalled();
});

test("disposal ignores a late request and clears debounces, listeners and future actions", async () => {
  const h = setup(); const pending = deferred<HlodBuildStatus>();
  h.request.mockReturnValue(pending.promise);
  const listener = vi.fn(); h.controller.onChange(listener);
  h.controller.start(); await tick();
  h.controller.saved();
  const before = h.controller.snapshot();
  h.controller.dispose(); listener.mockClear(); h.status.mockClear();
  pending.resolve(result("current", "late")); await tick(5000);
  h.controller.start(); h.controller.edited(); h.controller.saved(); h.controller.setAuto(false);
  h.controller.diskChanged([`${level}/level.json`]); await h.controller.generate(); await tick(5000);
  expect(h.controller.snapshot()).toEqual(before);
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(h.poll).not.toHaveBeenCalled(); expect(h.reload).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled(); expect(h.status).not.toHaveBeenCalled();
  expect(h.storage.setItem).not.toHaveBeenCalled();
});

test("late polling rejection after disposal cannot report or mutate status", async () => {
  const h = setup(); const pending = deferred<HlodBuildStatus>();
  h.request.mockResolvedValue(result("building")); h.poll.mockReturnValue(pending.promise);
  h.controller.start(); await tick(500);
  h.controller.dispose(); const before = h.controller.snapshot();
  pending.reject(new Error("late poll")); await tick(5000);
  expect(h.controller.snapshot()).toEqual(before);
  expect(h.status).not.toHaveBeenCalled(); expect(h.reload).not.toHaveBeenCalled();
  expect(h.poll).toHaveBeenCalledTimes(1);
});

test("disposal cancels a scheduled poll and freshness debounce", async () => {
  const h = setup(); h.request.mockResolvedValueOnce(result("building"));
  h.controller.start(); await tick(); h.controller.saved();
  h.controller.dispose(); await tick(5000);
  expect(h.poll).not.toHaveBeenCalled();
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

test("a disposed save completion cannot submit a build or notify", async () => {
  const h = setup(); h.setDirty(true);
  const pending = deferred<{ ok: boolean; message: string }>(); h.save.mockReturnValue(pending.promise);
  const generation = h.controller.generate(); await tick();
  h.controller.dispose(); h.setDirty(false);
  pending.resolve({ ok: true, message: "Saved" }); await generation;
  expect(h.request).not.toHaveBeenCalled(); expect(h.status).not.toHaveBeenCalled();
});

test("late reload failures and queued reloads are silenced after disposal", async () => {
  const h = setup(); const reloading = deferred<void>();
  h.reload.mockReturnValue(reloading.promise);
  h.request.mockResolvedValueOnce(result("current", "a")).mockResolvedValueOnce(result("current", "b"));
  h.controller.start(); await tick();
  await h.controller.generate();
  const listener = vi.fn(); h.controller.onChange(listener);
  h.controller.dispose(); reloading.reject(new Error("late reload")); await tick();
  expect(h.reload).toHaveBeenCalledTimes(1);
  expect(h.status).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled();
});

test("failed request has no automatic retry; a repeated manual click retries once", async () => {
  const h = setup(); h.request.mockRejectedValueOnce(new Error("Network unavailable"));
  h.controller.start(); await tick(5000);
  expect(h.controller.snapshot()).toMatchObject({ busy: false, status: { state: "failed", message: "Network unavailable" } });
  expect(h.status).toHaveBeenCalledWith("Network unavailable", "error");
  expect(h.request).toHaveBeenCalledTimes(1);
  const pending = deferred<HlodBuildStatus>(); h.request.mockReturnValue(pending.promise);
  const first = h.controller.generate(); const second = h.controller.generate(); await tick();
  expect(first).toBe(second);
  expect(h.request).toHaveBeenCalledTimes(2);
  expect(h.controller.generate()).toBe(first);
  pending.resolve(result("current", "retry")); await first;
  expect(h.controller.snapshot().status.state).toBe("current");
});

test("an older poll response cannot overwrite a newer request or reload an obsolete publication", async () => {
  const h = setup(); const oldPoll = deferred<HlodBuildStatus>();
  h.request.mockResolvedValueOnce(result("building")); h.poll.mockReturnValueOnce(oldPoll.promise);
  h.controller.start(); await tick(500);
  expect(h.poll).toHaveBeenCalledTimes(1);
  h.request.mockResolvedValueOnce(result("current", "new"));
  await h.controller.generate(); await tick();
  oldPoll.resolve(result("current", "old")); await tick(5000);
  expect(h.controller.snapshot().status).toEqual(result("current", "new"));
  expect(h.reload).toHaveBeenCalledTimes(1);
  expect(h.poll).toHaveBeenCalledTimes(1);
});

test("refreshes during a pending request are serialized and coalesced, using the latest dirty state", async () => {
  const h = setup(); const pending = deferred<HlodBuildStatus>();
  h.request.mockReturnValueOnce(pending.promise);
  h.controller.start(); await tick();
  h.controller.saved(); h.controller.diskChanged(["content/models/house.glb"]); await tick(1000);
  expect(h.request).toHaveBeenCalledTimes(1);
  h.setDirty(true); pending.resolve(result("current")); await tick();
  await tick(400);
  expect(h.request.mock.calls).toEqual([
    [{ level, build: true, force: false }], [{ level, build: false, force: false }],
  ]);
});
