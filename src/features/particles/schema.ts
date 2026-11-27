import { assetRef, bool, color, defineComponent, defineJsonAssetType, num, vec3 } from "../../core/index.ts";

export const ParticleEffect = defineJsonAssetType("forge.particleEffect", 1, {
  suffix: ".effect.json",
  fields: {
    rate: num({ default: 32, min: 0, max: 4096 }),
    capacity: num({ default: 256, min: 1, max: 4096, step: 1 }),
    lifetime: num({ default: 1.3, min: 0.05, max: 30 }),
    size: num({ default: 0.35, min: 0.001, max: 64 }),
    endSize: num({ default: 0.7, min: 0.001, max: 64 }),
    tint: color({ default: "#e6c6a0" }),
    velocity: vec3({ default: [0, 1.5, 0] }),
    spread: num({ default: 0.7, min: 0, max: 100 }),
    gravity: num({ default: 0 }),
    seed: num({ default: 1, min: 1, max: 2147483647, step: 1 }),
    texture: assetRef({ assetType: "forge.texture" }),
  },
}, { label: "Particle Effect", hint: "Sprite parçacıklarının doğuş, hareket ve görünüm değerleri." });

export const ParticleEmitter = defineComponent("forge.particleEmitter", 1, {
  effect: assetRef({ assetType: ParticleEffect.name }),
  enabled: bool({ default: true }),
}, { label: "Particle Emitter", spatial: true });
