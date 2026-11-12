// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { normalizeEffectDefinition, parseRuntimeParticleEffect, toRuntimeParticleEffect } from "./particleEffectParser.ts";
import { test } from "vitest";

const check = test;

check("parseRuntimeParticleEffect collapses a schema-1 effect and rejects bad input", () => {
  // A schema-1 body collapses to the flat runtime params the renderer needs
  // (effectId is dropped — the manifest is the id source of truth).
  assert.deepEqual(
    parseRuntimeParticleEffect({
      schema: 1,
      effectId: "starter-fx-smoke-puff",
      name: "Smoke Puff Effect",
      loop: false,
      rate: 18,
      lifetime: 0.8,
      startSize: 0.12,
      endSize: 0.8,
      velocity: [0, 1, 0],
      spread: 0.4,
      materialMode: "alpha",
      color: "#a7a7a7",
    }),
    {
      name: "Smoke Puff Effect",
      loop: false,
      rate: 18,
      lifetime: 0.8,
      startSize: 0.12,
      endSize: 0.8,
      velocity: [0, 1, 0],
      spread: 0.4,
      materialMode: "alpha",
      color: "#a7a7a7",
      // Schema 1 had no opacity block, so the upgrade path fills the defaults:
      // a 1 → 0 ramp with the default short fade-out.
      startOpacity: 1,
      endOpacity: 0,
      fadeInTime: 0,
      fadeOutTime: 0.1,
    },
  );
  // Non-object, unknown schema, or empty schema-1 effectId â†’ null.
  assert.equal(parseRuntimeParticleEffect(null), null);
  assert.equal(parseRuntimeParticleEffect({ schema: 4 }), null);
  assert.equal(parseRuntimeParticleEffect({ schema: 1, effectId: "" }), null);
  // Unknown materialMode falls back to alpha; a malformed color falls back to white.
  const fallback = parseRuntimeParticleEffect({
    schema: 1,
    effectId: "fx",
    materialMode: "neon",
    color: "red",
  });
  assert.equal(fallback?.materialMode, "alpha");
  assert.equal(fallback?.color, "#ffffff");
});

check("normalizeEffectDefinition reads a schema-2 effect and applies defaults", () => {
  const def = normalizeEffectDefinition({
    schema: 2,
    type: "particleEffect",
    name: "Smoke Puff Effect",
    category: "Smoke",
    tags: ["smoke"],
    system: { loop: true, duration: 0.35, maxParticles: 96 },
    spawn: { mode: "burst", count: 30, shape: "sphere", radius: 0.12 },
    initialize: { lifetime: [0.5, 1.1], startColor: "#bfc3c8", speed: [0.7, 1.8], spreadAngleDeg: 42 },
    update: { endColor: "#6d7378", endSize: [0.55, 0.95] },
    renderer: { blendMode: "additive", softness: 0.6 },
  });
  assert.ok(def);
  assert.equal(def.name, "Smoke Puff Effect");
  assert.equal(def.category, "Smoke");
  assert.deepEqual(def.tags, ["smoke"]);
  assert.equal(def.system.loop, true);
  assert.equal(def.system.maxParticles, 96);
  assert.equal(def.spawn.mode, "burst");
  assert.equal(def.spawn.count, 30);
  assert.equal(def.spawn.shape, "sphere");
  assert.deepEqual(def.initialize.lifetime, [0.5, 1.1]);
  assert.equal(def.initialize.startColor, "#bfc3c8");
  // @ts-expect-error Forge never type-checked its tests: a union member is read without narrowing (type-only).
  assert.equal(def.renderer.blendMode, "additive");
  // Untouched fields fall back to §6 defaults, not undefined.
  assert.deepEqual(def.initialize.startSize, [0.1, 0.2]);
  assert.equal(def.update.fadeOutTime, 0.1);
  // @ts-expect-error Forge never type-checked its tests: a union member is read without narrowing (type-only).
  assert.equal(def.renderer.sortMode, "none");

  // An out-of-order range is reordered min<=max; a single number widens to [n,n];
  // a bad enum/color falls back; missing sub-blocks default whole-cloth.
  const messy = normalizeEffectDefinition({
    schema: 2,
    initialize: { lifetime: [1.2, 0.4], startSize: 0.3, startColor: "nope" },
    renderer: { blendMode: "screen" },
  });
  assert.ok(messy);
  assert.deepEqual(messy.initialize.lifetime, [0.4, 1.2]);
  assert.deepEqual(messy.initialize.startSize, [0.3, 0.3]);
  assert.equal(messy.initialize.startColor, "#ffffff");
  // @ts-expect-error Forge never type-checked its tests: a union member is read without narrowing (type-only).
  assert.equal(messy.renderer.blendMode, "alpha");
});

check("schema-1 and its hand-converted schema-2 starter collapse identically", () => {
  // The Faz 1 starter conversion is mechanical: the schema-2 files are authored
  // so the normalize→collapse pipeline reproduces the original schema-1 runtime
  // params exactly. This stands in for the plan's "visually verify" step.
  const legacy = {
    schema: 1,
    effectId: "starter-fx-smoke-puff",
    name: "Smoke Puff Effect",
    loop: false,
    rate: 18,
    lifetime: 0.8,
    startSize: 0.12,
    endSize: 0.8,
    velocity: [0, 1, 0],
    spread: 0.4,
    materialMode: "alpha",
    color: "#a7a7a7",
  };
  const converted = {
    schema: 2,
    type: "particleEffect",
    name: "Smoke Puff Effect",
    system: { loop: false, duration: 0.8 },
    spawn: { mode: "rate", rate: 18 },
    initialize: {
      lifetime: [0.8, 0.8],
      startSize: [0.12, 0.12],
      startColor: "#a7a7a7",
      direction: [0, 1, 0],
      speed: [1, 1],
      spreadAngleDeg: 18,
    },
    update: { endSize: [0.8, 0.8], endColor: "#a7a7a7" },
    renderer: { blendMode: "alpha" },
  };
  assert.deepEqual(
    parseRuntimeParticleEffect(converted),
    parseRuntimeParticleEffect(legacy),
  );
});

check("a burst effect collapses to a burst, not to a trickle spread over its lifetime", () => {
  const runtime = toRuntimeParticleEffect(
    normalizeEffectDefinition({
      schema: 2,
      system: { loop: false },
      spawn: { mode: "burst", count: 30, delay: 0.25 },
      initialize: { lifetime: [1, 1] },
    })!,
  );
  // The two modes are exclusive: a burst carries no continuous rate. This used
  // to collapse to `rate: 30` (count over the lifetime window), which does not
  // make the burst slow - it makes it *late*, because the first particle then
  // waits a full 1/30 s and the cloud only reaches full size a second in.
  assert.equal(runtime.rate, 0, "a burst emitter has no trickle");
  assert.deepEqual(runtime.burst, { count: 30, delay: 0.25 });

  const rateMode = toRuntimeParticleEffect(
    normalizeEffectDefinition({
      schema: 2,
      system: { loop: true },
      spawn: { mode: "rate", rate: 12, count: 30 },
      initialize: { lifetime: [1, 1] },
    })!,
  );
  assert.equal(rateMode.rate, 12, "a rate emitter keeps its authored rate");
  assert.equal(rateMode.burst, undefined, "and releases nothing up front");
});
