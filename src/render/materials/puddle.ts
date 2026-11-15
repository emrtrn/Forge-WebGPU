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
// Wind ripples (the wind arrives in phase 5a step 7) and wheel rings (with
// vehicles, phase 6 / 8) bend the normal and the capture's lookup later; the
// slope they add is zero until then.

import * as THREE from "three/webgpu";
import * as TSLTyped from "three/tsl";

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
}

export interface PuddleMaterial {
  readonly material: THREE.MeshPhysicalNodeMaterial;
  setAppearance(appearance: PuddleAppearance): void;
  /** The planar capture this surface reflects; null for the environment only. A change rebuilds the graph. */
  setReflection(reflection: PuddleReflection | null): void;
  readonly reflection: PuddleReflection | null;
  dispose(): void;
}

export function createPuddleMaterial(appearance: PuddleAppearance): PuddleMaterial {
  const uColor = uniform(new THREE.Color(appearance.color));
  const uMudColor = uniform(new THREE.Color(appearance.mudColor));
  const uMudDensity = uniform(appearance.mudDensity);
  const uOpacity = uniform(appearance.opacity);
  const uRoughness = uniform(appearance.roughness);
  const uReflection = uniform(appearance.reflectionStrength);
  const uPlanar = uniform(appearance.planarReflectionStrength);
  const uTexel = uniform(1 / 256);
  let reflection: PuddleReflection | null = null;

  const depth = attribute("puddleDepth", "float");
  // Optical thickness comes from the actual live bed: shallow water stays
  // translucent, longer paths hide the bed in suspended mud.
  const thickness = max(float(0), depth).mul(uMudDensity).mul(uOpacity.div(0.82));
  const mud = float(1).sub(exp(thickness.negate()));

  const material = new THREE.MeshPhysicalNodeMaterial({ metalness: 0, ior: IOR, transparent: true, depthWrite: false });
  material.name = "puddle";
  material.colorNode = mix(uColor, uMudColor, mud.mul(0.85));
  material.opacityNode = mud.mul(smoothstep(0, 0.006, depth));
  material.roughnessNode = uRoughness;

  const apply = (): void => {
    const planar = reflection !== null;
    material.envMapIntensity = appearance.reflectionStrength * (planar ? 1 - appearance.planarReflectionStrength : 1);
    if (!reflection) {
      material.emissiveNode = null;
    } else {
      const node = reflection.node;
      // Forge's footprint: 0.4 at the centre, 0.15 at four taps roughness x 3 texels away.
      const uv = node.uvNode ?? TSL.screenUV.flipX();
      const step = uTexel.mul(uRoughness).mul(3);
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
