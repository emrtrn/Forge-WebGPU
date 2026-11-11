// Audio engine layer: clips, buses and ducks, the event table, the music director.
// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each
// check is copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { test } from "vitest";
import { AUDIO_BUS_IDS, type BusDuckMix, MENU_DUCK_MIX, NOTIFICATION_DUCK_MIX, STINGER_DUCK_MIX, STINGER_MUSIC_BED_DUCK, VOICE_DUCK_MIX, createDefaultBusVolumes, duckGain, ducksEqual, effectiveBusGain, isAudioBusId, mergeDucks, mergeMixSnapshot, normalizeBusVolume } from "./audioBus.ts";
import { DEFAULT_AUDIO_CLIP_MANIFEST, audioClipById } from "./audioClips.ts";
import { AudioEventDirector, jitterPitch, normalizeAudioEventTable, normalizeMusicPlaylistSettings } from "./audioEventTable.ts";
import { DEFAULT_SPATIAL_ATTENUATION, resolveSpatialPannerConfig } from "./audioTypes.ts";
import { DEFAULT_MUSIC_PLAYLIST_SETTINGS, MusicDirector, type MusicPlaylistSettings, crossfadeGains } from "./musicDirector.ts";

const check = test;

// --- Audio event table + music director ---------------------------------------

interface AudioPlaybackHandleStub {
  clipId: string;
  stopped: boolean;
  volume: number;
  pitch: number;
  stop(fadeSeconds?: number): void;
  setVolume(value: number, fadeSeconds?: number): void;
  setPitch(value: number): void;
  setPosition(position: readonly [number, number, number]): void;
  setPaused(paused: boolean): void;
}

/** A stub handle: enough of the interface for the director's bookkeeping. */
const fakeAudioHandle = (): { handle: AudioPlaybackHandleStub; finish: () => void } => {
  const stub: AudioPlaybackHandleStub = {
    clipId: "stub",
    stopped: false,
    volume: 1,
    pitch: 1,
    stop() {
      stub.stopped = true;
    },
    setVolume() {},
    setPitch() {},
    setPosition() {},
    setPaused() {},
  };
  return { handle: stub, finish: () => stub.stop() };
};

interface MusicHandleStub extends AudioPlaybackHandleStub {
  gain: number;
  stopFades: number[];
  paused: boolean;
}

const fakeMusicHandle = (clipId: string): MusicHandleStub => {
  const stub: MusicHandleStub = {
    clipId,
    stopped: false,
    volume: 1,
    pitch: 1,
    gain: 1,
    stopFades: [],
    paused: false,
    stop(fadeSeconds = 0) {
      stub.stopped = true;
      stub.stopFades.push(fadeSeconds);
    },
    setVolume(value: number) {
      stub.gain = value;
    },
    setPitch() {},
    setPosition() {},
    setPaused(paused: boolean) {
      stub.paused = paused;
    },
  };
  return stub;
};

/** Deterministic generator: a shuffle test that flakes teaches nothing. */
const seededMusicRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

interface MusicRig {
  readonly director: MusicDirector;
  readonly played: MusicHandleStub[];
  /** Advances the director to `toSeconds` in fixed steps, as a frame loop would. */
  readonly runTo: (toSeconds: number) => void;
  /** Holds or releases the bed at the rig's current clock reading. */
  readonly hold: (paused: boolean) => void;
}

const musicRig = (options: {
  clips: readonly string[];
  volume: number;
  settings: MusicPlaylistSettings;
  durations?: Record<string, number>;
  random?: () => number;
}): MusicRig => {
  const played: MusicHandleStub[] = [];
  const director = new MusicDirector({
    clips: options.clips,
    volume: options.volume,
    settings: options.settings,
    random: options.random ?? seededMusicRandom(7),
    durationOf: (clipId) => options.durations?.[clipId] ?? null,
    play: (clipId, gain) => {
      const handle = fakeMusicHandle(clipId);
      handle.gain = gain;
      played.push(handle);
      return handle;
    },
  });
  let clock = 0;
  const step = 1 / 60;
  director.start(clock);
  return {
    director,
    played,
    runTo: (toSeconds) => {
      while (clock < toSeconds - 1e-9) {
        clock = Math.min(toSeconds, clock + step);
        director.advance(clock);
      }
    },
    hold: (paused: boolean) => director.setPaused(paused, clock),
  };
};

check("audio clip manifest resolves default collision chime", () => {
  assert.deepEqual(audioClipById(DEFAULT_AUDIO_CLIP_MANIFEST, "collision-chime"), {
    id: "collision-chime",
    type: "tone",
    frequencyHz: 660,
    durationSeconds: 0.09,
  });
});

check("resolveSpatialPannerConfig defaults, clamps, and keeps max > ref", () => {
  assert.deepEqual(resolveSpatialPannerConfig({}), DEFAULT_SPATIAL_ATTENUATION);
  // Negative/zero inputs fall back to the defaults.
  assert.deepEqual(resolveSpatialPannerConfig({ refDistance: -2, rolloff: 0 }), {
    refDistance: DEFAULT_SPATIAL_ATTENUATION.refDistance,
    maxDistance: DEFAULT_SPATIAL_ATTENUATION.maxDistance,
    rolloff: DEFAULT_SPATIAL_ATTENUATION.rolloff,
  });
  // An inverted pair is corrected so the PannerNode can't go silent/NaN.
  const fixed = resolveSpatialPannerConfig({ refDistance: 30, maxDistance: 5 });
  assert.equal(fixed.refDistance, 30);
  assert.equal(fixed.maxDistance, 31);
});

// --- Audio Bus Lite (pure mix model) ------------------------------------------

check("createDefaultBusVolumes seeds every bus at unity", () => {
  assert.deepEqual(createDefaultBusVolumes(), {
    master: 1,
    music: 1,
    sfx: 1,
    ui: 1,
    ambience: 1,
    voice: 1,
    notifications: 1,
  });
});

check("normalizeBusVolume clamps to non-negative, defaults junk to 1", () => {
  assert.equal(normalizeBusVolume(0.5), 0.5);
  assert.equal(normalizeBusVolume(0), 0);
  assert.equal(normalizeBusVolume(-2), 0);
  assert.equal(normalizeBusVolume(undefined), 1);
  assert.equal(normalizeBusVolume(Number.NaN), 1);
});

check("effectiveBusGain folds a sub-bus through master, master stands alone", () => {
  const v = { ...createDefaultBusVolumes(), master: 0.5, music: 0.4 };
  assert.equal(effectiveBusGain(v, "master"), 0.5);
  assert.equal(effectiveBusGain(v, "music"), 0.2); // 0.4 × 0.5
  assert.equal(effectiveBusGain(v, "sfx"), 0.5); // 1 × 0.5
});

check("mergeMixSnapshot overrides only listed buses without mutating the base", () => {
  const base = createDefaultBusVolumes();
  const merged = mergeMixSnapshot(base, { music: 0.25, sfx: -1 });
  assert.equal(merged.music, 0.25);
  assert.equal(merged.sfx, 0); // negative normalized to 0
  assert.equal(merged.ui, 1);
  assert.equal(base.music, 1); // base table untouched
  assert.notStrictEqual(merged, base);
});

check("isAudioBusId guards the bus id union", () => {
  assert.equal(isAudioBusId("music"), true);
  assert.equal(isAudioBusId("master"), true);
  assert.equal(isAudioBusId("nope"), false);
  assert.equal(isAudioBusId(3), false);
});

check("MENU_DUCK_MIX ducks music/ambience/sfx/voice but leaves ui, notifications and master", () => {
  const ducked = mergeMixSnapshot(createDefaultBusVolumes(), MENU_DUCK_MIX);
  assert.ok(ducked.music < 1 && ducked.ambience < 1 && ducked.sfx < 1 && ducked.voice! < 1);
  assert.equal(ducked.ui, 1);
  // An alert raised while the game is paused still has to reach the player.
  assert.equal(ducked.notifications, 1);
  assert.equal(ducked.master, 1);
});

check("ducks merge by minimum, so two reasons to be quiet are not twice as quiet", () => {
  // Product would take sfx to 0.56 here — deeper than either moment asked for,
  // and audible as a lurch whichever duck ends first.
  const merged = mergeDucks([{ sfx: 0.8, music: 0.6 }, { sfx: 0.7, ambience: 0.85 }]);
  assert.deepEqual(merged, { music: 0.6, sfx: 0.7, ambience: 0.85 });
  // Order-independent, so the mix never depends on which duck the frame saw first.
  assert.deepEqual(mergeDucks([{ sfx: 0.7 }, { sfx: 0.8 }]), mergeDucks([{ sfx: 0.8 }, { sfx: 0.7 }]));
  assert.deepEqual(mergeDucks([]), {});

  // A bus nobody ducks is at unity, not absent-and-therefore-silent.
  assert.equal(duckGain(merged, "sfx"), 0.7);
  assert.equal(duckGain(merged, "notifications"), 1);

  // Equality is by effect: an absent bus and a bus at 1 are the same silence, so
  // a host reconciling every frame can say "nothing changed" without ramping.
  assert.equal(ducksEqual({ sfx: 0.5 }, { sfx: 0.5, music: 1 }), true);
  assert.equal(ducksEqual({ sfx: 0.5 }, { sfx: 0.5, music: 0.9 }), false);
  assert.equal(ducksEqual({}, {}), true);
});

check("every duck leaves the channels that answer the player alone", () => {
  // A duck names what steps *back*. Two buses may never appear in one: the
  // alarm channel (a duck that quietened the notice it was making room for
  // would be self-defeating) and `master` (which is not a channel but the
  // volume of everything, ducking included).
  const ducks: Array<[string, BusDuckMix]> = [
    ["MENU_DUCK_MIX", MENU_DUCK_MIX],
    ["NOTIFICATION_DUCK_MIX", NOTIFICATION_DUCK_MIX],
    ["VOICE_DUCK_MIX", VOICE_DUCK_MIX],
    ["STINGER_DUCK_MIX", STINGER_DUCK_MIX],
  ];
  for (const [name, duck] of ducks) {
    assert.equal(duckGain(duck, "notifications"), 1, `${name} must not duck the alarm channel`);
    assert.equal(duckGain(duck, "master"), 1, `${name} must not duck master`);
    // Every bus it does name has to actually move, or the entry is a comment
    // pretending to be a mix.
    for (const bus of AUDIO_BUS_IDS) {
      if (duck[bus] === undefined) continue;
      assert.ok(duckGain(duck, bus) < 1, `${name} names ${bus} without ducking it`);
      assert.ok(duckGain(duck, bus) > 0, `${name} silences ${bus} rather than ducking it`);
    }
  }
});

check("a stinger ducks the world but never the bus it plays on", () => {
  // The trap this pins: stingers are routed to `music` on purpose (they are
  // written with the score, and a player who muted the music has asked not to
  // hear them). A duck that pulled the music bus down under a stinger would
  // therefore pull the stinger down with it — the announcement ducking itself.
  // The bed is handled where it can be: the director's own gain.
  assert.equal(duckGain(STINGER_DUCK_MIX, "music"), 1, "a stinger must not duck its own bus");
  assert.ok(duckGain(STINGER_DUCK_MIX, "ambience") < 1, "the world must step back under a stinger");
  assert.ok(STINGER_MUSIC_BED_DUCK > 0 && STINGER_MUSIC_BED_DUCK < 1);
});

check("the pause duck goes deeper than the ducks that ride live play", () => {
  // Relationship, not magnitude — every number here is retuned by ear. What
  // must hold at any tuning: a menu the player opened may take the world well
  // down, while a duck that fires several times a minute under running play
  // must stay shallow or it is heard as the mix breathing.
  for (const [name, duck] of [
    ["NOTIFICATION_DUCK_MIX", NOTIFICATION_DUCK_MIX],
    ["VOICE_DUCK_MIX", VOICE_DUCK_MIX],
  ] as Array<[string, BusDuckMix]>) {
    assert.ok(
      duckGain(duck, "ambience") > duckGain(MENU_DUCK_MIX, "ambience"),
      `${name} must duck the world less than a pause does`,
    );
  }
  // The voice duck is the gentlest of the in-play three on the bus it aims at:
  // a bark lands far more often than an alarm or an announcement.
  assert.ok(duckGain(VOICE_DUCK_MIX, "sfx") > duckGain(STINGER_DUCK_MIX, "sfx"));
});

check("audio event table normalizer defaults every field and refuses a broken entry", () => {
  const table = normalizeAudioEventTable({
    schema: 1,
    events: { "ui.click": { clips: ["snd-click"] } },
  });
  const click = table.events["ui.click"]!;
  // An entry that names only clips is legal and gets an unremarkable one-shot.
  assert.deepEqual([...click.clips], ["snd-click"]);
  assert.equal(click.spatial, false);
  assert.equal(click.loop, false);
  assert.equal(click.stream, false);
  assert.ok(click.maxInstances >= 1);
  assert.ok(click.maxDistance > click.refDistance);

  assert.throws(
    () => normalizeAudioEventTable({ schema: 1, events: { "ui.click": { clips: [] } } }),
    /clips must be a non-empty array/,
  );
  assert.throws(
    () => normalizeAudioEventTable({ schema: 1, events: { "ui.click": { clips: ["a"], bus: "reverb" } } }),
    /is not a valid audio bus id/,
  );
  // An inverted attenuation pair silences the panner, which in-game reads as
  // "never wired" rather than "too quiet" — refused at load instead.
  assert.throws(
    () => normalizeAudioEventTable({
      schema: 1,
      events: { "ui.click": { clips: ["a"], refDistance: 40, maxDistance: 10 } },
    }),
    /must be greater than refDistance/,
  );
  // Event ids are a namespace two files have to agree on; a stray capital or
  // space would make the disagreement invisible.
  assert.throws(
    () => normalizeAudioEventTable({ schema: 1, events: { "UI Click": { clips: ["a"] } } }),
    /dotted snake_case/,
  );

  // The bus mix is optional; absent means every bus at unity.
  assert.deepEqual(table.buses, {});
  const mixed = normalizeAudioEventTable({
    schema: 1,
    buses: { music: 0.3 },
    events: { "ui.click": { clips: ["snd-click"] } },
  });
  assert.deepEqual(mixed.buses, { music: 0.3 });
  // A misspelled bus would otherwise stay at unity with nothing to say why the
  // mix is wrong — the exact failure this block exists to make loud.
  assert.throws(
    () => normalizeAudioEventTable({ schema: 1, buses: { musick: 0.3 }, events: {} }),
    /is not a valid audio bus id/,
  );
});

check("audio event director enforces cooldown, per-event cap and global budget", () => {
  const table = normalizeAudioEventTable({
    schema: 1,
    events: {
      "combat.hit": { clips: ["a", "b"], cooldownMs: 100, maxInstances: 2, spatial: true, maxDistance: 40 },
    },
  });
  const handles: AudioPlaybackHandleStub[] = [];
  const director = new AudioEventDirector(table, {
    random: () => 0,
    maxConcurrent: 3,
    play: () => {
      const { handle } = fakeAudioHandle();
      handles.push(handle);
      return handle;
    },
  });

  assert.equal(director.trigger("combat.hit", 0), "played");
  // Same event inside its cooldown: refused without touching the budget.
  assert.equal(director.trigger("combat.hit", 0.05), "cooldown");
  assert.equal(director.trigger("combat.hit", 0.2), "played");
  // Two are already sounding, and the entry allows two.
  assert.equal(director.trigger("combat.hit", 0.4), "event-full");
  assert.equal(director.activeCount(), 2);

  // The distance cull is the cheapest guard and comes before everything else.
  assert.equal(director.trigger("combat.hit", 5, { distance: 1000 }), "too-far");
  // An id the table does not answer is reported, never thrown.
  const unknown: string[] = [];
  const strict = new AudioEventDirector(table, {
    play: () => fakeAudioHandle().handle,
    onUnknownEvent: (id) => unknown.push(id),
  });
  assert.equal(strict.trigger("combat.nope", 0), "unknown-event");
  assert.equal(strict.trigger("combat.nope", 1), "unknown-event");
  // Once per id: a mistyped name in a per-frame path must not flood the log.
  assert.deepEqual(unknown, ["combat.nope"]);

  // A finished clip frees its slot — but only once the director is advanced,
  // which is what keeps the accounting frame-based rather than guessed.
  for (const handle of handles) handle.stop();
  assert.equal(director.activeCount(), 2);
  director.advance();
  assert.equal(director.activeCount(), 0);
  assert.equal(director.trigger("combat.hit", 10), "played");
});

check("audio budget: the peak is what was heard at once, and the two refusals are told apart", () => {
  // The split is what makes the measurement worth anything: an event's own cap
  // refusing a fifth copy of a footstep is the design working, while the
  // *shared* budget refusing anything means the ceiling is silently choosing
  // which sounds the player hears. A single "refused" counter would average
  // those two into a number nobody can act on.
  const table = normalizeAudioEventTable({
    schema: 1,
    events: {
      "combat.hit": { clips: ["a"], bus: "sfx", maxInstances: 2 },
      "voice.line": { clips: ["b"], bus: "voice", maxInstances: 1 },
    },
  });
  const handles: AudioPlaybackHandleStub[] = [];
  const director = new AudioEventDirector(table, {
    random: () => 0,
    maxConcurrent: 3,
    play: () => {
      const { handle } = fakeAudioHandle();
      handles.push(handle);
      return handle;
    },
  });

  assert.deepEqual(
    { active: director.budgetStats().active, peak: director.budgetStats().peak },
    { active: 0, peak: 0 },
  );
  assert.equal(director.trigger("combat.hit", 0), "played");
  assert.equal(director.trigger("combat.hit", 1), "played");
  assert.equal(director.trigger("voice.line", 1), "played");
  // The peak is sampled on advance, not on trigger: a count taken mid-frame
  // could include a play that had already finished.
  director.advance();
  let stats = director.budgetStats();
  assert.equal(stats.active, 3);
  assert.equal(stats.peak, 3);
  assert.equal(stats.limit, 3);
  // Per channel, because a voice budget is judged per channel, not in total.
  assert.deepEqual(
    stats.byBus.map((entry) => [entry.bus, entry.active, entry.peak]),
    [
      ["sfx", 2, 2],
      ["voice", 1, 1],
    ],
  );

  // The event's own cap, and then the shared budget — counted apart.
  assert.equal(director.trigger("combat.hit", 2), "event-full");
  assert.equal(director.trigger("voice.line", 2), "event-full");
  stats = director.budgetStats();
  assert.equal(stats.eventRefusals, 2);
  assert.equal(stats.budgetRefusals, 0, "no ceiling was reached; both events refused their own");

  // Free one voice so the per-event cap stops biting first, then fill the budget.
  handles[0]!.stop();
  director.advance();
  assert.equal(director.trigger("combat.hit", 3), "played");
  assert.equal(director.trigger("voice.line", 4), "event-full");
  const other = new AudioEventDirector(
    normalizeAudioEventTable({
      schema: 1,
      events: { "combat.hit": { clips: ["a"], bus: "sfx", maxInstances: 8 } },
    }),
    { random: () => 0, maxConcurrent: 2, play: () => fakeAudioHandle().handle },
  );
  assert.equal(other.trigger("combat.hit", 0), "played");
  assert.equal(other.trigger("combat.hit", 1), "played");
  assert.equal(other.trigger("combat.hit", 2), "budget-full");
  assert.equal(other.budgetStats().budgetRefusals, 1);
  assert.equal(other.budgetStats().eventRefusals, 0);

  // A peak belongs to one session. Carried into the next it would report a
  // moment that no longer happened — the same reason cooldowns are cleared here.
  other.reset();
  const afterReset = other.budgetStats();
  assert.equal(afterReset.peak, 0);
  assert.equal(afterReset.active, 0);
  assert.equal(afterReset.budgetRefusals, 0);
  assert.deepEqual(afterReset.byBus, []);
});

check("a duck lasts exactly as long as the sound that asked for it", () => {
  // `isPlaying` exists for ducking and nothing else: a host has to release a
  // duck when its cause ends, and a guessed timer is wrong in both directions —
  // too short and the mix comes back up under the second half of a line, too
  // long and it hangs open over silence.
  const table = normalizeAudioEventTable({
    schema: 1,
    events: {
      "voice.select": { clips: ["a"], maxInstances: 2 },
      "notify.alert": { clips: ["b"] },
    },
  });
  const handles: AudioPlaybackHandleStub[] = [];
  const director = new AudioEventDirector(table, {
    random: () => 0,
    play: () => {
      const { handle } = fakeAudioHandle();
      handles.push(handle);
      return handle;
    },
  });
  assert.equal(director.isPlaying("voice.select"), false);
  assert.equal(director.trigger("voice.select", 0), "played");
  assert.equal(director.isPlaying("voice.select"), true);
  // Per event, not global: an alarm sounding must not hold the voice duck open.
  assert.equal(director.trigger("notify.alert", 0), "played");
  handles[0]!.stop();
  director.advance();
  assert.equal(director.isPlaying("voice.select"), false);
  assert.equal(director.isPlaying("notify.alert"), true);
  // A refused trigger never arms a duck, because it never became a sound.
  assert.equal(director.isPlaying("voice.nope"), false);
  // And a reset drops the lot: a restart must not open ducked by the last one.
  director.reset();
  assert.equal(director.isPlaying("notify.alert"), false);
});

check("audio event pitch jitter stays inside its authored band", () => {
  assert.equal(jitterPitch(0, () => 0.5), 1);
  // The extremes of the generator map to the extremes of the band, and a pitch
  // of zero or below would stop the source dead — so the floor matters.
  assert.ok(Math.abs(jitterPitch(0.05, () => 0) - 0.95) < 1e-9);
  assert.ok(Math.abs(jitterPitch(0.05, () => 1) - 1.05) < 1e-9);
  for (const r of [0, 0.25, 0.5, 0.75, 1]) {
    const pitch = jitterPitch(0.5, () => r);
    assert.ok(pitch > 0, `pitch ${pitch} must stay positive`);
  }
});

check("music crossfade holds its power across the seam", () => {
  // The reason this is not a linear fade: two tracks that share no waveform sum
  // by power, so a linear pair is ~3 dB down at the midpoint and every
  // transition audibly dips. Sine and cosine keep the squares summing to one.
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const { incoming, outgoing } = crossfadeGains(t);
    assert.ok(
      Math.abs(incoming * incoming + outgoing * outgoing - 1) < 1e-9,
      `crossfade at ${t} loses power`,
    );
  }
  // The ends are the whole point of a fade: silence to full, full to silence.
  assert.ok(Math.abs(crossfadeGains(0).incoming) < 1e-9);
  assert.ok(Math.abs(crossfadeGains(1).outgoing) < 1e-9);
  // Out of range is clamped, not extrapolated — a negative gain inverts a track.
  assert.ok(Math.abs(crossfadeGains(-5).incoming) < 1e-9);
  assert.ok(Math.abs(crossfadeGains(9).outgoing) < 1e-9);
});

check("music director overlaps two tracks and lands the incoming one at full level", () => {
  const settings: MusicPlaylistSettings = {
    crossfadeSeconds: 4,
    gapSeconds: 0,
    segmentSeconds: 100,
  };
  const volume = 0.5;
  const rig = musicRig({
    clips: ["one", "two"],
    volume,
    settings,
    durations: { one: 20, two: 20 },
  });

  // One track, rising from silence: the bed fades in rather than snapping on.
  assert.equal(rig.played.length, 1);
  assert.equal(rig.played[0]!.gain, 0);
  rig.runTo(settings.crossfadeSeconds + 1);
  assert.ok(Math.abs(rig.played[0]!.gain - volume) < 1e-9, "the first track must reach full level");

  // Derived from the same numbers the director is given, so this holds at any
  // tuning: the fade begins a crossfade before the track's own end.
  const handoverAt = 20 - settings.crossfadeSeconds;
  rig.runTo(handoverAt - 0.5);
  assert.equal(rig.played.length, 1, "nothing may start before the hand-over");

  rig.runTo(handoverAt + settings.crossfadeSeconds / 2);
  assert.equal(rig.played.length, 2, "the next track must already be under way");
  assert.ok(rig.director.crossfading, "both tracks must be audible across the seam");
  const [outgoing, incoming] = rig.played as [MusicHandleStub, MusicHandleStub];
  assert.ok(!outgoing.stopped, "the outgoing track must fade, not cut");
  // Mid-fade the pair still sums to the bed's authored level. Relationship, not
  // magnitude: change `volume` and this follows it.
  const power = Math.sqrt(outgoing.gain ** 2 + incoming.gain ** 2);
  assert.ok(Math.abs(power - volume) < 0.02, `crossfade midpoint power ${power} left ${volume}`);

  rig.runTo(handoverAt + settings.crossfadeSeconds + 1);
  assert.ok(outgoing.stopped, "the outgoing track must be released once its fade is spent");
  assert.ok(Math.abs(incoming.gain - volume) < 1e-9, "the incoming track must reach full level");
  assert.ok(!rig.director.crossfading);
  assert.equal(rig.director.nowPlaying(), incoming.clipId);
});

check("the music bed can be ducked without touching the music bus", () => {
  // Why the bed has a duck of its own at all: stingers play on the `music` bus,
  // so ducking that bus under an announcement would duck the announcement. The
  // handle's gain is the only stage between the two.
  const settings: MusicPlaylistSettings = { crossfadeSeconds: 4, gapSeconds: 0, segmentSeconds: 100 };
  const volume = 0.5;
  const rig = musicRig({ clips: ["one", "two"], volume, settings, durations: { one: 40, two: 40 } });
  rig.runTo(settings.crossfadeSeconds + 1);
  const track = rig.played[0]!;
  assert.ok(Math.abs(track.gain - volume) < 1e-9);

  rig.director.setDuck(STINGER_MUSIC_BED_DUCK);
  assert.ok(
    Math.abs(track.gain - volume * STINGER_MUSIC_BED_DUCK) < 1e-9,
    "the bed must play at authored x duck",
  );
  // Derived from the same numbers, so this holds at any tuning or retune.
  assert.ok(track.gain < volume && track.gain > 0);
  rig.director.setDuck(1);
  assert.ok(Math.abs(track.gain - volume) < 1e-9, "releasing the duck restores the authored level");
});

check("a duck applied mid-crossfade rides the fade instead of fighting it", () => {
  // The failure this rules out: writing the ducked level straight onto a track
  // that is still rising jumps it off its curve, which is heard as a click in
  // the middle of a transition. The ramp owns the gain; the duck only changes
  // what it is ramping towards.
  const settings: MusicPlaylistSettings = { crossfadeSeconds: 4, gapSeconds: 0, segmentSeconds: 100 };
  const volume = 0.5;
  const duck = 0.4;
  const rig = musicRig({ clips: ["one", "two"], volume, settings, durations: { one: 20, two: 20 } });
  rig.runTo(settings.crossfadeSeconds + 1);
  const handoverAt = 20 - settings.crossfadeSeconds;
  rig.runTo(handoverAt + settings.crossfadeSeconds / 2);
  assert.ok(rig.director.crossfading, "the rig must be mid-transition for this check to mean anything");
  rig.director.setDuck(duck);
  rig.runTo(handoverAt + settings.crossfadeSeconds / 2 + 1 / 60);
  const [outgoing, incoming] = rig.played as [MusicHandleStub, MusicHandleStub];
  // Both halves scale together, so the seam keeps its equal-power shape — the
  // transition simply happens quieter.
  const power = Math.sqrt(outgoing.gain ** 2 + incoming.gain ** 2);
  assert.ok(Math.abs(power - volume * duck) < 0.02, `ducked crossfade power ${power} left the curve`);
  rig.runTo(handoverAt + settings.crossfadeSeconds + 1);
  assert.ok(Math.abs(incoming.gain - volume * duck) < 1e-9, "the incoming track lands at the ducked level");
});

check("music director hands over from the measured duration, not the fallback", () => {
  // The fallback exists only for a clip that has not decoded yet. A director
  // that kept using it would fade in the middle of a track and, worse, let a
  // long one run past its own end into silence.
  const settings: MusicPlaylistSettings = {
    crossfadeSeconds: 3,
    gapSeconds: 0,
    segmentSeconds: 100,
  };
  const measured = musicRig({
    clips: ["a", "b"],
    volume: 1,
    settings,
    durations: { a: 30, b: 30 },
  });
  measured.runTo(30 - settings.crossfadeSeconds + 0.5);
  assert.equal(measured.played.length, 2, "a 30s track must hand over well before 100s");

  // With no duration to read — a clip still loading, or no audio device at all —
  // the hold falls back to the authored segment instead of running forever.
  const unmeasured = musicRig({ clips: ["a", "b"], volume: 1, settings });
  unmeasured.runTo(settings.segmentSeconds - settings.crossfadeSeconds - 1);
  assert.equal(unmeasured.played.length, 1, "the fallback must not hand over early");
  unmeasured.runTo(settings.segmentSeconds - settings.crossfadeSeconds + 1);
  assert.equal(unmeasured.played.length, 2, "the fallback must still hand over");
});

check("music director's gap setting separates the tracks instead of overlapping them", () => {
  // Both transitions are offered — a true crossfade, and a fade-out / window /
  // fade-in. One number picks between them, so a project that wants the second
  // must actually get silence in the middle rather than a slower overlap.
  const settings: MusicPlaylistSettings = {
    crossfadeSeconds: 2,
    gapSeconds: 3,
    segmentSeconds: 100,
  };
  const rig = musicRig({
    clips: ["a", "b"],
    volume: 1,
    settings,
    durations: { a: 12, b: 12 },
  });
  let everOverlapped = false;
  for (let mark = 0; mark <= 20; mark += 0.25) {
    rig.runTo(mark);
    if (rig.director.crossfading) everOverlapped = true;
  }
  assert.ok(!everOverlapped, "a gapped transition must never have two tracks audible");
  assert.equal(rig.played.length, 2, "the next track must still start after the gap");
  assert.ok(rig.played[0]!.stopped, "the first track must be released");
});

check("a held music bed neither plays nor ages", () => {
  // The bug: the track plays on the audio device's clock, the hand-over is
  // scheduled on the host's per-frame clock, and a hidden tab stops one but not
  // the other. The track ran out while the schedule stood still, and the player
  // came back to silence until the schedule caught up.
  const rig = musicRig({
    clips: ["a", "b"],
    volume: 1,
    settings: { crossfadeSeconds: 4, gapSeconds: 0, segmentSeconds: 100 },
    durations: { a: 60, b: 60 },
  });
  rig.runTo(20);
  const first = rig.played[0]!;
  assert.equal(rig.played.length, 1);
  assert.equal(first.paused, false);

  rig.hold(true);
  assert.equal(first.paused, true, "holding the bed must stop the track sounding");
  // Past the hand-over the schedule would have reached (60 - 4 = 56s) had it
  // kept running. Nothing may start: a bed nobody is hearing must not advance.
  rig.runTo(80);
  assert.equal(rig.played.length, 1, "a held bed must not hand over");
  assert.equal(rig.director.nowPlaying(), first.clipId, "the same track is still the one held");

  rig.hold(false);
  assert.equal(first.paused, false, "releasing the bed resumes the same track");
  // And the schedule resumes where it left off rather than firing at once: the
  // 60 seconds it was held move the hand-over by 60 seconds, so the track still
  // gets the 36 it had left.
  rig.runTo(90);
  assert.equal(rig.played.length, 1, "the hand-over must not fire off the held time");
  rig.runTo(116.1);
  assert.equal(rig.played.length, 2, "the hand-over lands a full track-length later");
});

check("a playlist switch crossfades at once rather than waiting out the track", () => {
  // The state machine's whole audible effect. Without it a new playlist would
  // arrive whenever the running track happened to end, which is up to a full
  // segment after the moment that asked for it.
  const settings: MusicPlaylistSettings = { crossfadeSeconds: 2, gapSeconds: 0, segmentSeconds: 100 };
  const rig = musicRig({ clips: ["calm"], volume: 1, settings, durations: { calm: 90, tense: 90 } });
  rig.runTo(10);
  assert.equal(rig.director.nowPlaying(), "calm");

  rig.director.setPlaylist(["tense"], 1, 10);
  rig.runTo(10 + 1 / 30);
  assert.equal(rig.played.length, 2, "the switch hands over on the next frame, not at track end");
  assert.equal(rig.director.nowPlaying(), "tense");

  // Re-stating the live playlist is a no-op: the host reconciles state every
  // frame, so this is called sixty times a second and must cost nothing.
  rig.director.setPlaylist(["tense"], 1, 12);
  rig.runTo(14);
  assert.equal(rig.played.length, 2, "an unchanged playlist must not restart the bed");
});

check("music director's shuffle bag plays every track before repeating one", () => {
  // Independent random picks repeat: over four tracks one transition in four
  // replays the piece that just ended, which reads as the music having stopped
  // changing. The bag also has to refuse the seam between passes, where a plain
  // shuffle is free to put the outgoing track at the head of the next round.
  const clips = ["a", "b", "c", "d"];
  const settings: MusicPlaylistSettings = {
    crossfadeSeconds: 1,
    gapSeconds: 0,
    segmentSeconds: 10,
  };
  for (const seed of [1, 2, 3, 17, 4242]) {
    const rig = musicRig({ clips, volume: 1, settings, random: seededMusicRandom(seed) });
    rig.runTo(settings.segmentSeconds * 12);
    const order = rig.played.map((handle) => handle.clipId);
    assert.ok(order.length >= 8, `seed ${seed} produced too few tracks to judge`);
    for (let i = 1; i < order.length; i += 1) {
      assert.notEqual(order[i], order[i - 1], `seed ${seed} repeated "${order[i]}" back-to-back`);
    }
    // Each completed pass is a permutation of the playlist: nothing is starved.
    for (let start = 0; start + clips.length <= order.length; start += clips.length) {
      const pass = new Set(order.slice(start, start + clips.length));
      assert.equal(pass.size, clips.length, `seed ${seed} pass at ${start} was not a full round`);
    }
  }
});

check("music playlist settings default, and a nonsensical one is refused", () => {
  // Absent is legal: a project with one track has no seam to describe.
  assert.deepEqual(normalizeMusicPlaylistSettings(undefined), DEFAULT_MUSIC_PLAYLIST_SETTINGS);
  const parsed = normalizeMusicPlaylistSettings({ crossfadeSeconds: 2, gapSeconds: 1 });
  assert.equal(parsed.crossfadeSeconds, 2);
  assert.equal(parsed.gapSeconds, 1);
  assert.equal(parsed.segmentSeconds, DEFAULT_MUSIC_PLAYLIST_SETTINGS.segmentSeconds);
  // Every one of these is silent when wrong — the music simply changes oddly,
  // with nothing to say why — so they are refused at the file rather than
  // clamped into something the author did not write.
  assert.throws(() => normalizeMusicPlaylistSettings({ crossfadeSeconds: -1 }));
  assert.throws(() => normalizeMusicPlaylistSettings({ gapSeconds: "later" }));
  assert.throws(() => normalizeMusicPlaylistSettings({ segmentSeconds: 0 }));
  assert.throws(() => normalizeMusicPlaylistSettings([]));
});
