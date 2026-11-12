// Ported from Forge WebGL engine/vfx/particleEffectPresets.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * VFX Lite — starter presets for the "New → Particle Effect" flow (§5.1).
 *
 * The first four presets carry the identity (colour, blend, category, tags) of
 * the four starter effect assets but are tuned into distinct, recognisable
 * behaviours (rising smoke, settling dust, additive spark burst, gentle glow
 * loop) so a freshly-created effect looks like something in the preview rather
 * than the flat default stub. `blank` is the minimal looping stub used when the
 * author wants to start from scratch.
 *
 * This module is pure data (no DOM, no Three.js), so it lives under
 * `engine/vfx/` per the plan's layering rules (§9). It is the single source of
 * preset bodies: `tools/saveValidator.ts` uses `buildParticleEffectPresetBody`
 * to seed a new `*.effect.json`, and the editor's preset picker reads the
 * label/description maps.
 */

import type { ParticleEffectDefinition } from "./particleEffectTypes.ts";

export const PARTICLE_EFFECT_PRESETS = [
  "fire",
  "fireAnimated",
  "explosion",
  "smoke",
  "dust",
  "spark",
  "glow",
  "blank",
] as const;

export type ParticleEffectPreset = (typeof PARTICLE_EFFECT_PRESETS)[number];

export function isParticleEffectPreset(value: unknown): value is ParticleEffectPreset {
  return (
    typeof value === "string" &&
    (PARTICLE_EFFECT_PRESETS as readonly string[]).includes(value)
  );
}

export const PARTICLE_PRESET_LABELS: Record<ParticleEffectPreset, string> = {
  fire: "Fire Loop",
  fireAnimated: "Fire (Animated)",
  explosion: "Explosion",
  smoke: "Smoke Puff",
  dust: "Dust Hit",
  spark: "Spark Burst",
  glow: "Glow Loop",
  blank: "Blank",
};

export const PARTICLE_PRESET_DESCRIPTIONS: Record<ParticleEffectPreset, string> = {
  fire: "Textured additive flames rising and cooling — a looping fire sprite.",
  fireAnimated: "SubUV flipbook fire (6×6): each particle plays the flame animation as it rises.",
  explosion: "SubUV flipbook explosion (6×6) — a one-shot additive burst.",
  smoke: "Soft grey smoke that rises, grows and fades — one-shot burst.",
  dust: "Tan dust kicked up on impact, settling under light gravity.",
  spark: "Fast additive sparks flung outward, falling as they cool.",
  glow: "Gentle blue additive glow that loops for interaction highlights.",
  blank: "Minimal looping emitter to author from scratch.",
};

/** Deep-clones a preset body so callers never share nested arrays/objects. */
function clone(def: ParticleEffectDefinition): ParticleEffectDefinition {
  return JSON.parse(JSON.stringify(def)) as ParticleEffectDefinition;
}

const SMOKE: ParticleEffectDefinition = {
  name: "Smoke Puff",
  category: "Smoke",
  tags: ["smoke", "impact", "environment"],
  system: {
    enabled: true,
    loop: false,
    duration: 0.5,
    seed: null,
    maxParticles: 96,
    bounds: { mode: "fixed", min: [-1.2, 0, -1.2], max: [1.2, 3.5, 1.2], showInPreview: true },
  },
  spawn: {
    mode: "burst",
    rate: 10,
    count: 24,
    delay: 0,
    interval: 0,
    shape: "sphere",
    radius: 0.15,
    boxSize: [0, 0, 0],
  },
  initialize: {
    lifetime: [0.8, 1.4],
    startSize: [0.1, 0.18],
    startColor: "#bfc3c8",
    startOpacity: 0.72,
    direction: [0, 1, 0],
    speed: [0.6, 1.4],
    spreadAngleDeg: 35,
    rotation: [0, 360],
    angularVelocity: [-25, 25],
  },
  update: {
    gravityScale: -0.05,
    drag: 0.4,
    acceleration: [0, 0, 0],
    endSize: [0.5, 0.85],
    endColor: "#6d7378",
    endOpacity: 0,
    fadeInTime: 0.03,
    fadeOutTime: 0.2,
  },
  renderer: { type: "sprite", blendMode: "alpha", softness: 0.6, sortMode: "none", texture: null, subUV: { cols: 1, rows: 1 } },
};

const DUST: ParticleEffectDefinition = {
  name: "Dust Hit",
  category: "Dust",
  tags: ["dust", "impact", "environment"],
  system: {
    enabled: true,
    loop: false,
    duration: 0.3,
    seed: null,
    maxParticles: 80,
    bounds: { mode: "fixed", min: [-1, 0, -1], max: [1, 1.5, 1], showInPreview: true },
  },
  spawn: {
    mode: "burst",
    rate: 10,
    count: 20,
    delay: 0,
    interval: 0,
    shape: "sphere",
    radius: 0.1,
    boxSize: [0, 0, 0],
  },
  initialize: {
    lifetime: [0.4, 0.8],
    startSize: [0.08, 0.14],
    startColor: "#b99a72",
    startOpacity: 0.85,
    direction: [0, 1, 0],
    speed: [0.8, 1.8],
    spreadAngleDeg: 55,
    rotation: [0, 360],
    angularVelocity: [-40, 40],
  },
  update: {
    gravityScale: -0.15,
    drag: 0.5,
    acceleration: [0, 0, 0],
    endSize: [0.3, 0.5],
    endColor: "#8a744f",
    endOpacity: 0,
    fadeInTime: 0.02,
    fadeOutTime: 0.18,
  },
  renderer: { type: "sprite", blendMode: "alpha", softness: 0.5, sortMode: "none", texture: null, subUV: { cols: 1, rows: 1 } },
};

const SPARK: ParticleEffectDefinition = {
  name: "Spark Burst",
  category: "Sparks",
  tags: ["spark", "impact", "fire"],
  system: {
    enabled: true,
    loop: false,
    duration: 0.15,
    seed: null,
    maxParticles: 64,
    bounds: { mode: "fixed", min: [-2, -1, -2], max: [2, 2.5, 2], showInPreview: true },
  },
  spawn: {
    mode: "burst",
    rate: 10,
    count: 30,
    delay: 0,
    interval: 0,
    shape: "point",
    radius: 0,
    boxSize: [0, 0, 0],
  },
  initialize: {
    lifetime: [0.3, 0.6],
    startSize: [0.04, 0.08],
    startColor: "#ffcc55",
    startOpacity: 1,
    direction: [0, 1, 0],
    speed: [2, 4],
    spreadAngleDeg: 60,
    rotation: [0, 0],
    angularVelocity: [0, 0],
  },
  update: {
    gravityScale: -1,
    drag: 0.1,
    acceleration: [0, 0, 0],
    endSize: [0.02, 0.03],
    endColor: "#ff6a2a",
    endOpacity: 0,
    fadeInTime: 0,
    fadeOutTime: 0.12,
  },
  renderer: { type: "sprite", blendMode: "additive", softness: 0.4, sortMode: "none", texture: null, subUV: { cols: 1, rows: 1 } },
};

const GLOW: ParticleEffectDefinition = {
  name: "Glow Loop",
  category: "Gameplay",
  tags: ["glow", "interaction", "ui"],
  system: {
    enabled: true,
    loop: true,
    duration: 1,
    seed: null,
    maxParticles: 48,
    bounds: { mode: "fixed", min: [-0.8, 0, -0.8], max: [0.8, 1.5, 0.8], showInPreview: true },
  },
  spawn: {
    mode: "rate",
    rate: 12,
    count: 16,
    delay: 0,
    interval: 0,
    shape: "circle",
    radius: 0.2,
    boxSize: [0, 0, 0],
  },
  initialize: {
    lifetime: [0.8, 1.2],
    startSize: [0.15, 0.25],
    startColor: "#55c7ff",
    startOpacity: 0.6,
    direction: [0, 1, 0],
    speed: [0.1, 0.3],
    spreadAngleDeg: 20,
    rotation: [0, 0],
    angularVelocity: [0, 0],
  },
  update: {
    gravityScale: 0,
    drag: 0.2,
    acceleration: [0, 0, 0],
    endSize: [0.3, 0.4],
    endColor: "#2a86ff",
    endOpacity: 0,
    fadeInTime: 0.15,
    fadeOutTime: 0.35,
  },
  renderer: { type: "sprite", blendMode: "additive", softness: 0.7, sortMode: "none", texture: null, subUV: { cols: 1, rows: 1 } },
};

const BLANK: ParticleEffectDefinition = {
  name: "FX_NewEffect",
  category: "Gameplay",
  tags: [],
  system: {
    enabled: true,
    loop: true,
    duration: 1,
    seed: null,
    maxParticles: 64,
    bounds: { mode: "fixed", min: [-1, 0, -1], max: [1, 2, 1], showInPreview: true },
  },
  spawn: {
    mode: "rate",
    rate: 10,
    count: 16,
    delay: 0,
    interval: 0,
    shape: "point",
    radius: 0,
    boxSize: [0, 0, 0],
  },
  initialize: {
    lifetime: [1, 1],
    startSize: [0.2, 0.2],
    startColor: "#ffffff",
    startOpacity: 1,
    direction: [0, 1, 0],
    speed: [1, 1],
    spreadAngleDeg: 9,
    rotation: [0, 0],
    angularVelocity: [0, 0],
  },
  update: {
    gravityScale: 0,
    drag: 0,
    acceleration: [0, 0, 0],
    endSize: [0.2, 0.2],
    endColor: "#ffffff",
    endOpacity: 0,
    fadeInTime: 0,
    fadeOutTime: 0.1,
  },
  renderer: { type: "sprite", blendMode: "alpha", softness: 0.5, sortMode: "none", texture: null, subUV: { cols: 1, rows: 1 } },
};

/**
 * Textured additive fire (VFX Lite Faz 6a): a rising, tinted sprite plume using
 * the Kenney soft fire blob (`fire-01-2`). The first preset that ships a
 * `renderer.texture`, demonstrating the single-sprite texture path end-to-end.
 */
const FIRE: ParticleEffectDefinition = {
  name: "Fire Loop",
  category: "Fire",
  tags: ["fire", "flame", "loop"],
  system: {
    enabled: true,
    loop: true,
    duration: 1,
    seed: null,
    maxParticles: 96,
    bounds: { mode: "fixed", min: [-0.9, 0, -0.9], max: [0.9, 3, 0.9], showInPreview: true },
  },
  spawn: {
    mode: "rate",
    rate: 32,
    count: 16,
    delay: 0,
    interval: 0,
    shape: "circle",
    radius: 0.18,
    boxSize: [0, 0, 0],
  },
  initialize: {
    lifetime: [0.5, 0.9],
    startSize: [0.35, 0.55],
    startColor: "#ffb038",
    startOpacity: 1,
    direction: [0, 1, 0],
    speed: [0.8, 1.6],
    spreadAngleDeg: 18,
    rotation: [0, 0],
    angularVelocity: [0, 0],
  },
  update: {
    gravityScale: 0,
    drag: 0.6,
    acceleration: [0, 0.4, 0],
    endSize: [0.12, 0.2],
    endColor: "#8a1a05",
    endOpacity: 0,
    fadeInTime: 0.05,
    fadeOutTime: 0.25,
  },
  renderer: {
    type: "sprite",
    blendMode: "additive",
    softness: 0.6,
    sortMode: "none",
    texture: "fire-01-2",
    subUV: { cols: 1, rows: 1 },
  },
};

/**
 * Animated (SubUV flipbook) fire (VFX Lite Faz 6b): the UE `T_Fire_SubUV` 6×6
 * atlas, each particle cycling all 36 frames across its life. A looping plume
 * that reads as real, flickering fire rather than a static blob.
 */
const FIRE_ANIMATED: ParticleEffectDefinition = {
  name: "Fire Animated",
  category: "Fire",
  tags: ["fire", "flame", "flipbook", "loop"],
  system: {
    enabled: true,
    loop: true,
    duration: 1,
    seed: null,
    maxParticles: 64,
    bounds: { mode: "fixed", min: [-1, 0, -1], max: [1, 3.5, 1], showInPreview: true },
  },
  spawn: {
    mode: "rate",
    rate: 14,
    count: 16,
    delay: 0,
    interval: 0,
    shape: "circle",
    radius: 0.2,
    boxSize: [0, 0, 0],
  },
  initialize: {
    lifetime: [0.9, 1.4],
    startSize: [0.9, 1.4],
    startColor: "#ff7a1a",
    startOpacity: 1,
    direction: [0, 1, 0],
    speed: [0.5, 1],
    spreadAngleDeg: 10,
    rotation: [0, 0],
    angularVelocity: [0, 0],
  },
  update: {
    gravityScale: 0,
    drag: 0.5,
    acceleration: [0, 0.5, 0],
    endSize: [0.5, 0.9],
    endColor: "#7a1600",
    endOpacity: 0,
    fadeInTime: 0.05,
    fadeOutTime: 0.3,
  },
  renderer: {
    type: "sprite",
    blendMode: "additive",
    softness: 0.5,
    sortMode: "none",
    texture: "t-fire-subuv",
    subUV: { cols: 6, rows: 6 },
  },
};

/**
 * Explosion burst (VFX Lite Faz 6b): the UE `T_Explosion_SubUV` 6×6 atlas as a
 * one-shot burst — every particle plays the full explosion animation once.
 */
const EXPLOSION: ParticleEffectDefinition = {
  name: "Explosion",
  category: "Fire",
  tags: ["explosion", "fire", "flipbook", "impact"],
  system: {
    enabled: true,
    loop: false,
    duration: 0.1,
    seed: null,
    maxParticles: 48,
    bounds: { mode: "fixed", min: [-2.5, -0.5, -2.5], max: [2.5, 3, 2.5], showInPreview: true },
  },
  spawn: {
    mode: "burst",
    rate: 10,
    count: 14,
    delay: 0,
    interval: 0,
    shape: "sphere",
    radius: 0.3,
    boxSize: [0, 0, 0],
  },
  initialize: {
    lifetime: [0.6, 0.9],
    startSize: [1.2, 2],
    startColor: "#ffd27a",
    startOpacity: 1,
    direction: [0, 1, 0],
    speed: [0.4, 1.2],
    spreadAngleDeg: 90,
    rotation: [0, 0],
    angularVelocity: [0, 0],
  },
  update: {
    gravityScale: -0.1,
    drag: 1.2,
    acceleration: [0, 0, 0],
    endSize: [1.6, 2.6],
    endColor: "#5a1400",
    endOpacity: 0,
    fadeInTime: 0,
    fadeOutTime: 0.25,
  },
  renderer: {
    type: "sprite",
    blendMode: "additive",
    softness: 0.5,
    sortMode: "none",
    texture: "t-explosion-subuv",
    subUV: { cols: 6, rows: 6 },
  },
};

const PRESET_DEFS: Record<ParticleEffectPreset, ParticleEffectDefinition> = {
  fire: FIRE,
  fireAnimated: FIRE_ANIMATED,
  explosion: EXPLOSION,
  smoke: SMOKE,
  dust: DUST,
  spark: SPARK,
  glow: GLOW,
  blank: BLANK,
};

/** Returns a fresh (deep-cloned) normalized definition for a preset. */
export function particleEffectPresetDefinition(
  preset: ParticleEffectPreset,
): ParticleEffectDefinition {
  return clone(PRESET_DEFS[preset]);
}

/**
 * Builds a full schema-2 effect asset body for a preset, with `name` applied.
 * This is what `contentStubJson` writes to a new `*.effect.json`; the id is the
 * manifest join key, not a body field (§7), so it never appears here.
 */
export function buildParticleEffectPresetBody(
  preset: ParticleEffectPreset,
  name: string,
): Record<string, unknown> {
  const def = particleEffectPresetDefinition(preset);
  def.name = name;
  return { schema: 2, type: "particleEffect", ...def };
}
