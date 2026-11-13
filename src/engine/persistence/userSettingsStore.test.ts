// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { defaultGraphicsPreferences } from "../perf/qualityProfiles.ts";
import { createMemoryStorageAdapter, type StorageAdapter } from "./saveGameStore.ts";
import { UserSettingsStore, defaultUserSettings } from "./userSettingsStore.ts";
import { test } from "vitest";

const check = test;

check("user settings store: round-trips locale and normalized audio bus volumes", () => {
  const storage = createMemoryStorageAdapter();
  const store = new UserSettingsStore({
    storage,
    now: () => "2026-07-02T11:00:00.000Z",
  });

  assert.deepEqual(store.read(), defaultUserSettings());
  assert.equal(store.setLocale("tr"), true);
  assert.equal(store.setAudioBusVolume("music", 0.35), true);
  assert.equal(store.setAudioBusVolume("sfx", -1), true);

  assert.deepEqual(store.read(), {
    locale: "tr",
    audio: { busVolumes: { music: 0.35, sfx: 0 } },
    graphics: defaultGraphicsPreferences(),
  });
  const raw = JSON.parse(storage.getItem(store.storageKey()) ?? "{}") as {
    schema?: number;
    updatedAt?: string;
  };
  assert.equal(raw.schema, 1);
  assert.equal(raw.updatedAt, "2026-07-02T11:00:00.000Z");

  // A volume panel moves on every pointer `input` event, so the bulk write is
  // not a convenience: one bus at a time would be a read-modify-write per bus
  // per frame of a drag. Unlisted buses keep whatever was stored.
  assert.equal(store.setAudioBusVolumes({ music: 0.5, voice: 2, notifications: -1 }), true);
  assert.deepEqual(store.read().audio.busVolumes, {
    music: 0.5,
    sfx: 0,
    voice: 2,
    notifications: 0,
  });
});

check("user settings store: corrupt data falls back without crashing and write errors return false", () => {
  const warnings: string[] = [];
  const storage = createMemoryStorageAdapter({ "forge.userSettings": "{bad-json" });
  const store = new UserSettingsStore({
    storage,
    logger: { warn: (message) => warnings.push(message) },
  });
  assert.deepEqual(store.read(), defaultUserSettings());
  assert.deepEqual(warnings, ["User settings data is corrupt or incompatible."]);

  const failing: StorageAdapter = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => undefined,
    keys: () => [],
  };
  const writeWarnings: string[] = [];
  const failingStore = new UserSettingsStore({
    storage: failing,
    logger: { warn: (message) => writeWarnings.push(message) },
  });
  assert.equal(failingStore.setLocale("tr"), false);
  assert.deepEqual(writeWarnings, ["User settings write failed."]);
});

check("user settings store: round-trips graphics preferences alongside audio + locale", () => {
  const storage = createMemoryStorageAdapter();
  const store = new UserSettingsStore({ storage });
  assert.deepEqual(store.read().graphics, defaultGraphicsPreferences());

  assert.equal(
    store.setGraphics({
      adaptiveOptimizationEnabled: false,
      targetFrameRate: 30,
      selectedQualityLevel: "low",
      allowAdaptiveFineTuning: false,
      manuallySelected: true,
      startupCalibrated: true,
    }),
    true,
  );
  // Setting graphics leaves audio + locale untouched.
  assert.equal(store.setLocale("tr"), true);
  const read = store.read();
  assert.equal(read.locale, "tr");
  assert.equal(read.graphics.selectedQualityLevel, "low");
  assert.equal(read.graphics.adaptiveOptimizationEnabled, false);
  assert.equal(read.graphics.targetFrameRate, 30);
  assert.equal(read.graphics.manuallySelected, true);
  assert.equal(read.graphics.startupCalibrated, true);
});
