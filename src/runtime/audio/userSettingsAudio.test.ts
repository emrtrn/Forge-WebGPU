// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
// Here, not next to userSettingsStore: it applies the stored mix to the audio
// subsystem, which lives in runtime (engine has no Web Audio).
import assert from "node:assert/strict";
import { AudioSubsystem } from "./audioSubsystem.ts";
import { isAudioBusId } from "../../engine/audio/audioBus.ts";
import { defaultGraphicsPreferences } from "../../engine/perf/qualityProfiles.ts";
import { LocaleRegistry, defaultUiLocaleTable } from "../../engine/ui/uiLocale.ts";
import { normalizeUserSettings } from "../../engine/persistence/userSettingsStore.ts";
import { test } from "vitest";

const check = test;

check("user settings normalization drops unknown buses and applies stored audio + locale", () => {
  const normalized = normalizeUserSettings({
    locale: "tr",
    audio: { busVolumes: { master: 0.8, music: Number.NaN, nope: 0.2 } },
  });
  assert.deepEqual(normalized, {
    locale: "tr",
    audio: { busVolumes: { master: 0.8 } },
    graphics: defaultGraphicsPreferences(),
  });

  const audio = new AudioSubsystem();
  for (const [bus, volume] of Object.entries(normalized.audio.busVolumes)) {
    if (isAudioBusId(bus)) audio.setBusVolume(bus, volume);
  }
  assert.equal(audio.getBusVolume("master"), 0.8);
  assert.equal(audio.getBusVolume("music"), 1);

  const registry = new LocaleRegistry();
  registry.register(defaultUiLocaleTable("en"));
  registry.register(defaultUiLocaleTable("tr"));
  registry.setActiveLocale("en"); // worldSettings.locale
  if (normalized.locale) registry.setActiveLocale(normalized.locale); // user override
  assert.equal(registry.activeLocale, "tr");
});
