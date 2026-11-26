// The Puddle's water (plan phase 5a step 6): Forge WebGL's TerrainPuddleSurface
// material (engine/render-three/terrain/terrainPuddleSurface.ts @
// forge-webgl-final) in TSL, its rules unchanged:
// - optical thickness from the live bed: depth x mud density x opacity / 0.82;
//   suspended mud hides the bed (colour towards the mud colour by 0.85 of
//   1 - exp(-thickness)), and the same amount, faded over the first 6 mm of
//   depth, is the alpha (Forge replaced the opacity with it);
// - a physical surface (IOR 1.333, no metal), blended, no depth write; the
//   environment reflection scaled by Reflection Strength;
// - planar reflection (Faz 7's decision: `reflector()`): Forge replaced the
//   incoming environment radiance by the capture, mixed by the planar
//   strength, and let the BRDF apply Fresnel. Here the environment term keeps
//   (1 - strength) of its intensity and the capture is added with the water's
//   Schlick Fresnel, sampled with Forge's small roughness-wide footprint.
// Wind (phase 5a step 7, puddleWind.ts) bends both the normal and the planar
// lookup through the reflection camera. The weather lowers the water
// (`setWaterDrop`, user decision 2026-11-26): the surface sinks and its depth
// shrinks by the same amount, so the shore recedes into the hollow. Rain rings
// (plan phase W6, waterRipples.ts) follow the live rain, not under the
// precipitation cover. Wheel rings follow in phase 6 / 8.

import * as THREE from "three/webgpu";
import * as TSLTyped from "three/tsl";
import type { ResolvedWind } from "../../engine/environment/wind.ts";
import type { PuddleWindSettings } from "../../engine/terrain/puddleWater.ts";
import { createPuddleWind } from "./puddleWind.ts";
import { createWaterRipples, type WaterRippleInput } from "./waterRipples.ts";
import { COVER_READ_LIFT } from "../../engine/environment/surfaceResponse.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>;
const { attribute, dot, exp, float, max, mix, normalView, positionViewDirection, pow, smoothstep, uniform, vec2, vec3 } = TSL;

/** Forge's water IOR and its Schlick reflectance at normal incidence. */
const IOR = 1.333;
const F0 = ((1 - IOR) / (1 + IOR)) ** 2;

export interface PuddleAppearance {
  readonly color: string;
  readonly opacity: number;
  readonly roughness: number;
  readonly reflectionStrength: number;
  readonly planarReflectionStrength: number;
  readonly mudDensity: number;
  readonly mudColor: string;
}

/** A planar capture to sample: a `reflector()` node and its texel size. */
export interface PuddleReflection {
  readonly node: AnyNode;
  readonly texel: number;
  /** Reflection camera world -> clip, updated for the current render camera. */
  readonly projection?: AnyNode;
}

export interface PuddleMaterial {
  readonly material: THREE.MeshPhysicalNodeMaterial;
  setAppearance(appearance: PuddleAppearance): void;
  /** The planar capture this surface reflects; null for the environment only. A change rebuilds the graph. */
  setReflection(reflection: PuddleReflection | null): void;
  readonly reflection: PuddleReflection | null;
  setWindNormal(texture: THREE.Texture | null): void;
  /** Lowers the water `metres` below its filled level (weather fill): the shallow edges dry first. Uniform only. */
  setWaterDrop(metres: number): void;
  updateWind(wind: ResolvedWind, seconds: number, appearance: Partial<PuddleWindSettings>, x: number, z: number): void;
  /** Rain rings (plan phase W6): the live rain, the clock and the World Environment's settings; null none. Uniforms only. */
  updateRipples(input: WaterRippleInput | null): void;
  readonly windMotion: ReturnType<typeof createPuddleWind>["motion"];
  dispose(): void;
}

/** `sheltered`: the precipitation cover at a world point (1 under a roof); absent: open sky. */
export function createPuddleMaterial(appearance: PuddleAppearance, sheltered?: (position: AnyNode) => AnyNode): PuddleMaterial {
  const uColor = uniform(new THREE.Color(appearance.color));
  const uMudColor = uniform(new THREE.Color(appearance.mudColor));
  const uMudDensity = uniform(appearance.mudDensity);
  const uOpacity = uniform(appearance.opacity);
  const uRoughness = uniform(appearance.roughness);
  const uReflection = uniform(appearance.reflectionStrength);
  const uPlanar = uniform(appearance.planarReflectionStrength);
  const uTexel = uniform(1 / 256);
  let reflection: PuddleReflection | null = null;
  const wind = createPuddleWind();
  const ripples = createWaterRipples();
  let windNormal: THREE.Texture | null = null;

  const uDrop = uniform(0);
  // The fill's depth below the filled level, less the weather's drop: where it reaches 0 the water ends.
  const depth = attribute("puddleDepth", "float").sub(uDrop);
  // Optical thickness comes from the actual live bed: shallow water stays
  // translucent, longer paths hide the bed in suspended mud.
  const thickness = max(float(0), depth).mul(uMudDensity).mul(uOpacity.div(0.82));
  const mud = float(1).sub(exp(thickness.negate()));

  const material = new THREE.MeshPhysicalNodeMaterial({ metalness: 0, ior: IOR, transparent: true, depthWrite: false });
  material.name = "puddle";
  material.colorNode = mix(uColor, uMudColor, mud.mul(0.85));
  material.opacityNode = mud.mul(smoothstep(0, 0.006, depth));
  material.positionNode = TSL.positionLocal.sub(vec3(0, uDrop, 0));

  const apply = (): void => {
    const surface = wind.nodes(depth, uRoughness);
    material.roughnessNode = surface.roughness;
    // Rings where the water is (its edge's fade, as the wind's) and the sky is open; no crests (the wind's own above).
    const open = sheltered ? float(1).sub(sheltered(TSL.positionWorld.add(vec3(0, COVER_READ_LIFT, 0)))) : float(1);
    const rings = ripples.slope(TSL.positionWorld, smoothstep(0, .025, depth).mul(open), null);
    const gradient = surface.gradient.add(rings);
    const slope = TSL.vec3(gradient.x.negate(), 0, gradient.y.negate());
    material.normalNode = TSL.normalize(normalView.add(TSL.cameraViewMatrix.mul(TSL.vec4(slope, 0)).xyz));
    const planar = reflection !== null;
    material.envMapIntensity = appearance.reflectionStrength * (planar ? 1 - appearance.planarReflectionStrength : 1);
    if (!reflection) {
      material.emissiveNode = null;
    } else {
      const node = reflection.node;
      // Forge's footprint: 0.4 at the centre, 0.15 at four taps roughness x 3 texels away.
      let uv = node.uvNode ?? TSL.screenUV.flipX();
      if (reflection.projection) {
        const projected = reflection.projection.mul(TSL.vec4(TSL.positionWorld, 1));
        const bent = projected.add(reflection.projection.mul(TSL.vec4(slope.mul(.18), 0)));
        // Project the world slope through the reflection camera, retaining
        // reflector()'s backend-specific base UV when the slope is zero.
        uv = uv.add(bent.xy.div(max(.0001, bent.w)).sub(projected.xy.div(max(.0001, projected.w))).mul(vec2(.5, -.5)));
      }
      const step = uTexel.mul(surface.roughness).mul(3);
      const reflected = node.sample(uv).rgb.mul(0.4)
        .add(node.sample(uv.add(vec2(step, 0))).rgb.mul(0.15))
        .add(node.sample(uv.sub(vec2(step, 0))).rgb.mul(0.15))
        .add(node.sample(uv.add(vec2(0, step))).rgb.mul(0.15))
        .add(node.sample(uv.sub(vec2(0, step))).rgb.mul(0.15));
      const cosine = max(dot(normalView, positionViewDirection), float(0));
      const fresnel = float(F0).add(float(1 - F0).mul(pow(float(1).sub(cosine), 5)));
      material.emissiveNode = vec3(reflected).mul(fresnel).mul(uReflection).mul(uPlanar);
    }
    material.needsUpdate = true;
  };
  apply();

  return {
    material,
    windMotion: wind.motion,
    updateWind: wind.update,
    updateRipples: ripples.update,
    setWaterDrop(metres) {
      uDrop.value = Math.max(0, metres);
    },
    setWindNormal(next) {
      if (next === windNormal) return;
      windNormal = next;
      wind.setNormal(next);
      apply();
    },
    get reflection() {
      return reflection;
    },
    setAppearance(next) {
      appearance = next;
      (uColor.value as THREE.Color).set(next.color);
      (uMudColor.value as THREE.Color).set(next.mudColor);
      uMudDensity.value = next.mudDensity;
      uOpacity.value = next.opacity;
      uRoughness.value = next.roughness;
      uReflection.value = next.reflectionStrength;
      uPlanar.value = next.planarReflectionStrength;
      material.envMapIntensity = next.reflectionStrength * (reflection ? 1 - next.planarReflectionStrength : 1);
    },
    setReflection(next) {
      if (next === reflection) return;
      reflection = next;
      if (next) uTexel.value = next.texel;
      apply();
    },
    dispose() {
      material.dispose();
    },
  };
}
