// Web Audio subsystem, headless: requests, handles, mix, format probe.
// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each
// check is copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { test } from "vitest";
import { AUDIO_BUS_IDS, MENU_DUCK_MIX } from "../../engine/audio/audioBus.ts";
import { AudioSubsystem, PLAYED_HISTORY_LIMIT, canPlayAudioFormat } from "./audioSubsystem.ts";

const check = test;

check("audio subsystem play handle can cancel a pending request", () => {
  const audio = new AudioSubsystem();
  const handle = audio.play("music-loop", { volume: 0.25, loop: true, pitch: 1.5 });

  assert.equal(handle.clipId, "music-loop");
  assert.equal(handle.volume, 0.25);
  assert.equal(handle.pitch, 1.5);

  handle.setVolume(0.5);
  handle.setPitch(0.75);
  assert.equal(handle.volume, 0.5);
  assert.equal(handle.pitch, 0.75);

  handle.stop();
  audio.update({ deltaSeconds: 0.016, elapsedSeconds: 0.016, frame: 1 });

  assert.equal(handle.stopped, true);
  assert.deepEqual(audio.playedRequests(), []);
});

check("audio subsystem keeps headless looping playback alive until stopped", () => {
  const audio = new AudioSubsystem();
  const handle = audio.play("music-loop", { volume: 0.4, loop: true });

  audio.update({ deltaSeconds: 0.016, elapsedSeconds: 0.016, frame: 1 });

  assert.equal(handle.stopped, false);
  assert.deepEqual(audio.playedRequests(), [{ clipId: "music-loop", volume: 0.4, loop: true }]);

  handle.stop(0.25);
  assert.equal(handle.stopped, true);
});

check("audio subsystem finishes headless non-loop playback after update", () => {
  const audio = new AudioSubsystem();
  const handle = audio.play("ui-click", { volume: 0.7 });

  audio.update({ deltaSeconds: 0.016, elapsedSeconds: 0.016, frame: 1 });

  assert.equal(handle.stopped, true);
  assert.deepEqual(audio.playedRequests(), [{ clipId: "ui-click", volume: 0.7 }]);
});

check("audio subsystem records a spatial play's position; listener pose is safe headless", () => {
  const audio = new AudioSubsystem();
  // No Web Audio context exists headless; updating the listener must not throw.
  audio.setListenerPose([1, 2, 3], [0, 0, -1]);
  audio.play("footstep", { spatial: true, position: [4, 0, -2] });
  audio.update({ deltaSeconds: 0.016, elapsedSeconds: 0.016, frame: 1 });
  assert.deepEqual(audio.playedRequests(), [
    { clipId: "footstep", spatial: true, position: [4, 0, -2] },
  ]);
});

// --- Audio Bus Lite (subsystem, headless) -------------------------------------

check("audio format support: only an empty canPlayType is a no, and no DOM is not evidence", () => {
  // The check behind a "this browser has no sound" notice. Its failure modes run
  // in both directions and both are bad: warn a browser that would have coped
  // and the game calls itself broken; stay quiet on one that cannot and the
  // player gets silence with no cause.
  const original = globalThis.document;
  try {
    // `""` is the browser refusing outright — the only real no.
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ canPlayType: () => "" }),
    };
    assert.equal(canPlayAudioFormat(), false);
    // "maybe" is a hedge, not a refusal, and is treated as yes.
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ canPlayType: () => "maybe" }),
    };
    assert.equal(canPlayAudioFormat(), true);
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ canPlayType: () => "probably" }),
    };
    assert.equal(canPlayAudioFormat(), true);
    // A build with no `canPlayType` at all cannot be asked, so it is not
    // accused — Playwright's WebKit is exactly this shape for Web Audio.
    (globalThis as { document?: unknown }).document = { createElement: () => ({}) };
    assert.equal(canPlayAudioFormat(), true);
    // Headless: not knowing is not evidence. A test run must never claim the
    // shipped format is unplayable.
    delete (globalThis as { document?: unknown }).document;
    assert.equal(canPlayAudioFormat(), true);
  } finally {
    if (original === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = original;
  }
});

check("audio subsystem: the play history is bounded, so a long session is not a leak", () => {
  const audio = new AudioSubsystem();
  for (let index = 0; index < PLAYED_HISTORY_LIMIT + 40; index += 1) {
    audio.play(`shot-${index}`);
    audio.update({ deltaSeconds: 0, elapsedSeconds: 0 } as never);
  }
  const played = audio.playedRequests();
  assert.equal(played.length, PLAYED_HISTORY_LIMIT);
  // Oldest first, and it is the *oldest* that is dropped: a debug overlay reads
  // the tail, so trimming from the front is the only trim that is invisible.
  assert.equal(played[played.length - 1]?.clipId, `shot-${PLAYED_HISTORY_LIMIT + 39}`);
  assert.equal(played[0]?.clipId, "shot-40");
  // Nothing was decoded here, so no clip has a known length — null is the honest
  // answer, never a zero a caller could schedule against.
  assert.equal(audio.clipDurationSeconds("shot-0"), null);
});

check("audio subsystem seeds every mix bus at unity", () => {
  const audio = new AudioSubsystem();
  for (const id of AUDIO_BUS_IDS) assert.equal(audio.getBusVolume(id), 1);
});

check("audio subsystem setBusVolume stores and clamps without a context", () => {
  const audio = new AudioSubsystem();
  audio.setBusVolume("music", 0.3);
  assert.equal(audio.getBusVolume("music"), 0.3);
  audio.setBusVolume("sfx", -5);
  assert.equal(audio.getBusVolume("sfx"), 0);
});

check("audio subsystem mix snapshot ducks, resetMix restores", () => {
  const audio = new AudioSubsystem();
  audio.applyMixSnapshot(MENU_DUCK_MIX);
  assert.equal(audio.getBusVolume("music"), 0.25);
  assert.equal(audio.getBusVolume("ui"), 1); // untouched by the duck
  audio.resetMix();
  for (const id of AUDIO_BUS_IDS) assert.equal(audio.getBusVolume(id), 1);
});

check("audio subsystem play routes its bus into the recorded request", () => {
  const audio = new AudioSubsystem();
  audio.play("music-loop", { bus: "music", loop: true });
  audio.update({ deltaSeconds: 0.016, elapsedSeconds: 0.016, frame: 1 });
  assert.deepEqual(audio.playedRequests(), [
    { clipId: "music-loop", bus: "music", loop: true },
  ]);
});
