// The sky dome (plan phase 3 step 5; Forge WebGL engine/render-three/
// {skyAtmosphere,moonDisc,starField,reflection}.ts rewritten on three/webgpu).
//
// - The atmosphere is three's Preetham sky in TSL (`SkyMesh`, the WebGPU twin
//   of the `Sky` Forge used, same uniforms and formula). Its built-in clouds
//   are off: clouds are the Cloud Layer (Forge kept the sky a pure atmosphere).
//   A camera-centred backdrop drawn first, no depth test or write, never
//   culled, no fog.
// - The live sky gets Forge's procedural full moon and star field in its
//   colour node, stars first so the disc covers them (Forge's GLSL hooks into
//   the Sky shader, as TSL): world-oriented, no texture, no extra draw call.
//   Derivatives are taken outside every branch (WGSL uniformity).
// - The Sky Light capture uses its own plain sky: no moon, no stars, no sun
//   disc (its HDR core overflowed the half-float cube faces in Forge).

import {
  abs,
  asin,
  atan,
  cameraPosition,
  clamp,
  cross,
  dot,
  exp,
  float,
  floor,
  Fn,
  fract,
  fwidth,
  If,
  length,
  max,
  min,
  mix,
  normalize,
  positionWorld,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { MathUtils, Scene, Vector3, type Node, type UniformNode } from "three/webgpu";
import { SkyMesh } from "three/examples/jsm/objects/SkyMesh.js";
import type { ResolvedEnvironment } from "../../engine/environment/environmentResolve.ts";

/** Half extent of the dome around the camera (Forge's SKY_BOX_SCALE); depth is not tested, so it only has to enclose the camera. */
export const SKY_BOX_SCALE = 100;

export interface SkyScattering {
  readonly rayleigh: number;
  readonly turbidity: number;
  readonly mie: number;
  readonly mieDirectionalG: number;
}

type V2 = Node<"vec2">;
type V3 = Node<"vec3">;
type F = Node<"float">;

function plainSky(): SkyMesh {
  const sky = new SkyMesh();
  sky.cloudCoverage.value = 0;
  sky.scale.setScalar(SKY_BOX_SCALE);
  sky.material.depthTest = false;
  sky.material.depthWrite = false;
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  sky.raycast = () => {};
  return sky;
}

function applyScattering(sky: SkyMesh, scattering: SkyScattering, sunDirection: Vector3): void {
  sky.rayleigh.value = scattering.rayleigh;
  sky.turbidity.value = scattering.turbidity;
  sky.mieCoefficient.value = scattering.mie;
  sky.mieDirectionalG.value = scattering.mieDirectionalG;
  sky.sunPosition.value.copy(sunDirection);
}

// --- Forge's moon (moonDisc.ts MOON_GLSL) ---------------------------------

const moonHash = (p: V2): V2 => fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))).mul(43758.5453)) as V2;

function moonNoise(p: V2): F {
  const cell = floor(p).toVar();
  const f0 = fract(p);
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2))).toVar();
  return mix(
    mix(moonHash(cell).x, moonHash(cell.add(vec2(1, 0))).x, f.x),
    mix(moonHash(cell.add(vec2(0, 1))).x, moonHash(cell.add(vec2(1, 1))).x, f.x),
    f.y,
  ) as F;
}

function moonCraters(p: V2, scale: number): F {
  const q = p.mul(scale).toVar();
  const cell = floor(q).toVar();
  let relief: F = float(0);
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      const id = cell.add(vec2(x, y));
      const seed = moonHash(id).toVar();
      const delta = q.sub(id.add(0.2).add(seed.mul(0.6))).toVar();
      const radius = mix(0.12, 0.34, seed.x);
      const r = length(delta).div(radius).toVar();
      const floorMask = float(1).sub(smoothstep(0.65, 0.9, r));
      const rim = smoothstep(0.75, 0.93, r).mul(float(1).sub(smoothstep(1, 1.2, r)));
      const light = float(0.6).add(dot(normalize(delta.add(0.0001)), vec2(-0.6, 0.8)).mul(0.4));
      relief = relief.add(floorMask.mul(-0.16)).add(rim.mul(0.13).mul(light)) as F;
    }
  }
  return relief;
}

export interface MoonUniforms {
  readonly direction: UniformNode<"vec3">;
  readonly color: UniformNode<"vec3">;
  readonly radiusSin: UniformNode<"float">;
  readonly brightness: UniformNode<"float">;
  readonly haloIntensity: UniformNode<"float">;
  readonly haloSize: UniformNode<"float">;
  readonly haloOuterCos: UniformNode<"float">;
}

function moonNode(u: MoonUniforms, viewDirection: V3, skyColor: V3): V3 {
  const md = u.direction as unknown as V3;
  const moonColor = u.color as unknown as V3;
  const alignment = dot(viewDirection, md).toVar();
  // A low-energy glow restricted to the moon's angular vicinity.
  const angle = atan(length(cross(viewDirection, md)), alignment);
  const outside = max(0, angle.div(asin(u.radiusSin)).sub(1)).toVar();
  const falloff = exp(outside.mul(-3).div(u.haloSize)).mul(float(1).sub(smoothstep(u.haloSize.mul(0.7), u.haloSize, outside)));
  const haloOn = u.haloIntensity.greaterThan(0).and(alignment.greaterThan(u.haloOuterCos));
  const halo = select(haloOn, mix(vec3(1), moonColor, 0.35).mul(u.haloIntensity).mul(falloff), vec3(0)).toVar();
  const east = normalize(cross(vec3(0, 1, 0), md)).toVar();
  const north = cross(md, east);
  const p = vec2(dot(viewDirection, east), dot(viewDirection, north)).div(u.radiusSin).toVar();
  const r2 = dot(p, p).toVar();
  // Outside every branch: derivatives need uniform control flow.
  const edge = max(fwidth(r2), 0.001).toVar();
  const visible = u.brightness.greaterThan(0).and(alignment.greaterThan(0));
  const result = select(visible, skyColor.add(halo), skyColor).toVar();
  If(visible.and(r2.lessThanEqual(1.05)), () => {
    const mask = float(1).sub(smoothstep(float(1).sub(edge), float(1).add(edge), r2)).toVar();
    const z = sqrt(max(0, float(1).sub(r2))).toVar();
    const surface = p.div(z.mul(0.35).add(0.65)).toVar();
    const maria = smoothstep(0.32, 0.7, moonNoise(surface.mul(3.2).add(vec2(7.3, 2.1)) as V2));
    const grain = moonNoise(surface.mul(55) as V2);
    const albedo = float(0.76).sub(maria.mul(0.34)).add(grain.mul(0.08))
      .add(moonCraters(surface as V2, 5.5)).add(moonCraters(surface.add(3.7) as V2, 15).mul(0.5));
    const limb = float(0.45).add(pow(z, 0.3).mul(0.55));
    const radiance = mix(vec3(1), moonColor, 0.35).mul(max(0.12, albedo)).mul(limb).mul(2).toVar();
    result.assign(
      mix(skyColor, radiance, mask.mul(clamp(u.brightness, 0, 1)))
        .add(radiance.mul(mask).mul(max(0, u.brightness.sub(1))))
        .add(halo.mul(float(1).sub(mask))),
    );
  });
  return result as unknown as V3;
}

// --- Forge's stars (starField.ts STAR_GLSL) -------------------------------

function starHash(input: V3): V3 {
  const p = fract(input.mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  p.addAssign(dot(p, p.yxz.add(33.33)));
  return fract(p.xxy.add(p.yxx).mul(p.zyx)) as V3;
}

export interface StarUniforms {
  readonly brightness: UniformNode<"float">;
  readonly density: UniformNode<"float">;
  readonly size: UniformNode<"float">;
  readonly moonDirection: UniformNode<"vec3">;
  readonly moonBrightness: UniformNode<"float">;
}

function starsNode(u: StarUniforms, direction: V3, skyColor: V3): V3 {
  // Angular footprint first, before any branch: sub-pixel stars stay antialiased.
  const footprint = max(length(fwidth(direction)).mul(0.6), 0.00001).toVar();
  const a = abs(direction).toVar();
  const isX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
  const isY = a.y.greaterThanEqual(a.z);
  const face = select(isX, select(direction.x.greaterThan(0), 0, 1), select(isY, select(direction.y.greaterThan(0), 2, 3), select(direction.z.greaterThan(0), 4, 5))).toVar();
  const uv = select(isX, direction.yz.div(a.x), select(isY, direction.xz.div(a.y), direction.xy.div(a.z))).toVar();
  const cell = floor(uv.add(1).mul(48)).toVar();
  const seed = starHash(vec3(cell, face.add(17)) as V3).toVar();
  const centerUV = cell.add(0.25).add(seed.xy.mul(0.5)).div(48).sub(1).toVar();
  const solidAngle = pow(float(1).add(dot(centerUV, centerUV)), -1.5);
  const exists = seed.z.lessThan(u.density.mul(0.12).mul(solidAngle));
  const center = normalize(
    select(face.lessThan(2), vec3(select(face.lessThan(1), 1, -1), centerUV),
      select(face.lessThan(4), vec3(centerUV.x, select(face.lessThan(3), 1, -1), centerUV.y),
        vec3(centerUV, select(face.lessThan(5), 1, -1)))),
  ).toVar();
  const variety = starHash(vec3(cell.add(139), face.add(91)) as V3).toVar();
  const radius = mix(0.00032, 0.0007, variety.x).mul(u.size).toVar();
  const filtered = max(radius, footprint).toVar();
  const distanceToStar = length(cross(direction, center));
  const disc = float(1).sub(smoothstep(filtered.mul(0.2), filtered, distanceToStar));
  const energy = min(1, radius.mul(radius).div(filtered.mul(filtered)));
  const horizon = smoothstep(0.02, 0.25, direction.y);
  const moonSeparation = float(1).sub(smoothstep(0.97, 1, dot(direction, u.moonDirection as unknown as V3)));
  const moonFade = mix(1, mix(0.2, 1, moonSeparation), clamp(u.moonBrightness, 0, 1));
  const tint = mix(vec3(0.72, 0.82, 1), vec3(1, 0.89, 0.72), variety.y);
  const luminosity = mix(2, 12, pow(variety.z, 5));
  const on = u.brightness.greaterThan(0).and(u.density.greaterThan(0)).and(direction.y.greaterThan(0)).and(exists);
  const star = tint.mul(luminosity).mul(disc).mul(energy).mul(horizon).mul(moonFade).mul(u.brightness);
  return skyColor.add(select(on, star, vec3(0))) as V3;
}

// --- The live sky ----------------------------------------------------------

export interface SkyDome {
  readonly mesh: SkyMesh;
  /** Scattering and the sun (ground -> sun; below the horizon the sky darkens). */
  apply(scattering: SkyScattering, sunDirection: Vector3): void;
  /** The World Environment's moon and stars; null hides them. */
  applyNight(environment: ResolvedEnvironment | null): void;
  /** The dome's radiance against the scene (the sky's exposure under a Post Process; 1 otherwise). */
  setRadiance(radiance: number): void;
  /** Keeps the dome around the camera. */
  follow(position: Vector3): void;
  dispose(): void;
}

export function createSkyDome(): SkyDome {
  const mesh = plainSky();
  mesh.name = "sky-atmosphere";
  const moon: MoonUniforms = {
    direction: uniform(new Vector3(0, 0.5, -Math.sqrt(0.75))),
    color: uniform(new Vector3(1, 1, 1)),
    radiusSin: uniform(Math.sin(MathUtils.degToRad(0.6))),
    brightness: uniform(0),
    haloIntensity: uniform(0),
    haloSize: uniform(4),
    haloOuterCos: uniform(1),
  };
  const stars: StarUniforms = {
    brightness: uniform(0),
    density: uniform(0),
    size: uniform(1),
    moonDirection: uniform(new Vector3(0, 1, 0)),
    moonBrightness: uniform(0),
  };
  const radiance = uniform(1);
  // Diagnostics and tests read the night uniforms and the radiance here.
  mesh.userData.night = { moon, stars };
  mesh.userData.radiance = radiance;
  const atmosphere = mesh.material.colorNode as unknown as Node<"vec4">;
  mesh.material.colorNode = Fn(() => {
    const direction = normalize(positionWorld.sub(cameraPosition)).toVar() as unknown as V3;
    const starred = starsNode(stars, direction, atmosphere.xyz as unknown as V3);
    return vec4(moonNode(moon, direction, starred).mul(radiance), 1);
  })();
  return {
    mesh,
    apply: (scattering, sunDirection) => applyScattering(mesh, scattering, sunDirection),
    applyNight(environment) {
      const m = environment?.moon ?? null;
      moon.brightness.value = m?.brightness ?? 0;
      moon.haloIntensity.value = m?.haloIntensity ?? 0;
      if (m) {
        moon.direction.value.set(...m.direction);
        moon.color.value.set(...m.color);
        moon.radiusSin.value = Math.sin(MathUtils.degToRad(m.angularDiameterDeg / 2));
        moon.haloSize.value = m.haloSize;
        moon.haloOuterCos.value = Math.cos(MathUtils.degToRad((m.angularDiameterDeg / 2) * (1 + m.haloSize)));
      }
      stars.brightness.value = environment?.stars.brightness ?? 0;
      stars.density.value = environment?.stars.density ?? 0;
      stars.size.value = environment?.stars.size ?? 1;
      stars.moonBrightness.value = m?.brightness ?? 0;
      if (m) stars.moonDirection.value.set(...m.direction);
    },
    setRadiance(value) {
      radiance.value = value;
    },
    follow: (position) => void mesh.position.copy(position),
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}

// --- The Sky Light capture's sky -------------------------------------------

export interface CaptureSky {
  /** The capture scene: the plain sky at the origin. */
  readonly scene: Scene;
  apply(scattering: SkyScattering, sunDirection: Vector3): void;
  dispose(): void;
}

export function createCaptureSky(): CaptureSky {
  const mesh = plainSky();
  mesh.name = "sky-light-capture";
  mesh.showSunDisc.value = 0;
  const scene = new Scene();
  scene.add(mesh);
  return {
    scene,
    apply: (scattering, sunDirection) => applyScattering(mesh, scattering, sunDirection),
    dispose() {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}
