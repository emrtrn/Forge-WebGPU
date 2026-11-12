// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { SaveGameStore, createMemoryStorageAdapter, type PersistenceLogger, type StorageAdapter } from "./saveGameStore.ts";
import { test } from "vitest";

const check = test;

// P3 Save-Game / Persistence: pure engine store over an injected storage adapter.
check("save-game store: writes, lists, reads, overwrites, and deletes slots", () => {
  const storage = createMemoryStorageAdapter();
  const timestamps = [
    "2026-07-02T10:00:00.000Z",
    "2026-07-02T10:00:01.000Z",
    "2026-07-02T10:00:02.000Z",
  ];
  let nowIndex = 0;
  const now = () => timestamps[nowIndex++] ?? timestamps[timestamps.length - 1]!;
  const store = new SaveGameStore<{ level: string; flags: Record<string, boolean> }>({
    gameId: "forge-test",
    schema: 1,
    storage,
    now,
  });

  assert.deepEqual(store.listSlots(), []);
  assert.deepEqual(store.writeSlot("auto", { level: "Levels/A.level.json", flags: { intro: true } }), {
    ok: true,
  });
  assert.deepEqual(store.writeSlot("manual 1", { level: "Levels/B.level.json", flags: {} }), {
    ok: true,
  });

  assert.deepEqual(
    store.listSlots().map((slot) => slot.slot),
    ["manual 1", "auto"],
  );
  assert.deepEqual(store.readSlot("auto"), {
    schema: 1,
    gameId: "forge-test",
    createdAt: "2026-07-02T10:00:00.000Z",
    updatedAt: "2026-07-02T10:00:00.000Z",
    payload: { level: "Levels/A.level.json", flags: { intro: true } },
  });

  assert.deepEqual(store.writeSlot("auto", { level: "Levels/C.level.json", flags: { intro: true } }), {
    ok: true,
  });
  assert.deepEqual(store.readSlot("auto"), {
    schema: 1,
    gameId: "forge-test",
    createdAt: "2026-07-02T10:00:00.000Z",
    updatedAt: "2026-07-02T10:00:02.000Z",
    payload: { level: "Levels/C.level.json", flags: { intro: true } },
  });

  assert.equal(store.deleteSlot("auto"), true);
  assert.equal(store.readSlot("auto"), null);
});

check("save-game store: migrates old envelopes one schema step at a time", () => {
  const storage = createMemoryStorageAdapter();
  const migratedFrom: number[] = [];
  const store = new SaveGameStore<{ coins: number; visited: string[]; label: string }>({
    gameId: "forge-test",
    schema: 3,
    storage,
    now: () => "2026-07-02T10:00:00.000Z",
    migrate: (fromSchema, payload) => {
      migratedFrom.push(fromSchema);
      if (fromSchema === 1 && typeof (payload as { coins?: unknown }).coins === "string") {
        return { coins: Number((payload as { coins: string }).coins), visited: [] };
      }
      if (fromSchema === 2) return { ...(payload as object), label: "v3" };
      return payload;
    },
  });
  storage.setItem(
    store.keyForSlot("auto"),
    JSON.stringify({
      schema: 1,
      gameId: "forge-test",
      createdAt: "2026-07-02T09:00:00.000Z",
      updatedAt: "2026-07-02T09:30:00.000Z",
      payload: { coins: "2" },
    }),
  );

  assert.deepEqual(store.readSlot("auto"), {
    schema: 3,
    gameId: "forge-test",
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T09:30:00.000Z",
    payload: { coins: 2, visited: [], label: "v3" },
  });
  assert.deepEqual(migratedFrom, [1, 2]);
});

check("save-game store: corrupt JSON reads as null and logs without crashing", () => {
  const storage = createMemoryStorageAdapter();
  const warnings: string[] = [];
  const logger: PersistenceLogger = {
    warn: (message) => warnings.push(message),
  };
  const store = new SaveGameStore({
    gameId: "forge-test",
    schema: 1,
    storage,
    logger,
  });
  storage.setItem(store.keyForSlot("bad"), "{not-json");

  assert.equal(store.readSlot("bad"), null);
  assert.deepEqual(warnings, ["Save-game data is corrupt or incompatible."]);
});

check("save-game store: storage write failures return an error result", () => {
  const storage: StorageAdapter = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => undefined,
    keys: () => [],
  };
  const warnings: string[] = [];
  const store = new SaveGameStore({
    gameId: "forge-test",
    schema: 1,
    storage,
    logger: { warn: (message) => warnings.push(message) },
  });

  assert.deepEqual(store.writeSlot("auto", { level: "Levels/A.level.json" }), {
    ok: false,
    reason: "storage-error",
  });
  assert.deepEqual(warnings, ["Save-game write failed."]);
});
