/**
 * F0 of the `?debug` performance-instrument plan: the five readout lines the
 * overlay grew, plus the two things behind them that had no measurement at all
 * before — the scene-cost traversal and the audio voice budget.
 *
 * All of it is checked headlessly, which is the point of keeping the arithmetic
 * in pure functions: a readout that can only be verified by looking at a running
 * browser is a readout nobody verifies.
 */
// Ported from Forge WebGL tests/engine/perfReadout.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 10 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import type { EngineUpdateContext } from "../../engine/subsystem.ts";
import { AudioSubsystem, DEFAULT_MAX_VOICES } from "./audioSubsystem.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;

export function registerPerfReadoutTests(check: Check): void {
  check("AudioSubsystem tracks the voice budget per bus and refuses over the ceiling", () => {
    const audio = new AudioSubsystem({ backend: "none", maxVoices: 3 });
    assert.equal(audio.voiceStats().limit, 3);

    const a = audio.play("tone-a", { loop: true, bus: "sfx" });
    audio.play("tone-b", { loop: true, bus: "sfx" });
    audio.play("tone-c", { loop: true, bus: "music" });
    let stats = audio.voiceStats();
    assert.equal(stats.active, 3);
    assert.equal(stats.peak, 3);
    assert.deepEqual(stats.byBus, [
      { bus: "sfx", active: 2, peak: 2 },
      { bus: "music", active: 1, peak: 1 },
    ]);

    // The fourth play is refused, and gets back a handle that reads as stopped
    // rather than one that silently never sounds.
    const refused = audio.play("tone-d", { loop: true, bus: "sfx" });
    assert.equal(refused.stopped, true);
    assert.equal(audio.voiceStats().budgetRefusals, 1);
    assert.equal(audio.voiceStats().active, 3);

    // Stopping one returns its voice; the peak remembers the moment.
    a.stop();
    stats = audio.voiceStats();
    assert.equal(stats.active, 2);
    assert.equal(stats.peak, 3);
    assert.equal(stats.byBus.find((entry) => entry.bus === "sfx")?.active, 1);
    // Idempotent: a second stop must not double-refund the budget.
    a.stop();
    assert.equal(audio.voiceStats().active, 2);

    audio.resetVoiceStats();
    stats = audio.voiceStats();
    assert.equal(stats.peak, 2);
    assert.equal(stats.budgetRefusals, 0);
  });

  check("AudioSubsystem releases a finished one-shot's voice back to the budget", () => {
    const audio = new AudioSubsystem({ backend: "none" });
    assert.equal(audio.voiceStats().limit, DEFAULT_MAX_VOICES);
    audio.playOneShot("blip", { bus: "sfx" });
    assert.equal(audio.voiceStats().active, 1);
    // The headless backend finishes a non-looping play in the tick that starts
    // it; the budget must come back with it, or a busy scene starves itself.
    audio.update({ deltaSeconds: 0.016, elapsedSeconds: 0.016, frame: 1 } as EngineUpdateContext);
    assert.equal(audio.voiceStats().active, 0);
    assert.equal(audio.voiceStats().peak, 1);
  });
}

registerPerfReadoutTests(test as unknown as Parameters<typeof registerPerfReadoutTests>[0]);
