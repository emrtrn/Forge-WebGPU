// The Cloud Layer dome (plan phase 3 step 5): Forge WebGL's static cloud
// layer (engine/render-three/cloudLayer.ts) with its fBm fragment shader
// rewritten in TSL. A camera-centred sphere seen from inside, transparent,
// no depth write but depth tested: it sits just inside the camera's far plane
// (0.9 x far), so nearer geometry hides it while the open sky shows the
// clouds over the Sky Atmosphere. Value noise, five octaves; coverage lowers
// the threshold, softness widens the band; the lower edge fades with a softened
// sky-plane projection. The drift clock only moves the noise when `speed` > 0.

import { dot, float, floor, Fn, fract, max, mix, normalize, positionLocal, sin, smoothstep, uniform, vec2, vec3 } from "three/tsl";
import { BackSide, Color, Mesh, MeshBasicNodeMaterial, SphereGeometry, Vector2, Vector3, type Node, type PerspectiveCamera } from "three/webgpu";

/** Sphere radius around the camera (Forge's CLOUD_DOME_RADIUS). */
export const CLOUD_DOME_RADIUS = 90;
/** The dome is scaled out to this fraction of the camera's far plane. */
export const CLOUD_DOME_FAR_FRACTION = 0.9;
/** Fixed wind heading (xz); `speed` scales its length. */
const WIND_DIRECTION = new Vector2(1, 0.35).normalize();
const HORIZON_BLEND_END = 0.45;
const HORIZON_PROJECTION_FLOOR = 0.35;

export interface CloudSettings {
  readonly color: string;
  readonly coverage: number;
  readonly density: number;
  readonly softness: number;
  readonly scale: number;
  readonly speed: number;
}

type V2 = Node<"vec2">;
type F = Node<"float">;

const hash = (p: V2): F => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123)) as F;

function valueNoise(p: V2): F {
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(float(3).sub(f.mul(2))).toVar();
  return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y) as F;
}

function fbm(start: V2): F {
  let total: F = float(0);
  let p: V2 = start;
  let amplitude = 0.5;
  let sum = 0;
  for (let octave = 0; octave < 5; octave += 1) {
    total = total.add(valueNoise(p).mul(amplitude)) as F;
    sum += amplitude;
    p = p.mul(2) as V2;
    amplitude *= 0.5;
  }
  return total.div(sum) as F;
}

export interface CloudDome {
  readonly mesh: Mesh;
  apply(settings: CloudSettings): void;
  /** Centred on the camera and scaled to its far plane. */
  follow(camera: PerspectiveCamera | { position: Vector3; far?: number }): void;
  advance(seconds: number): void;
  dispose(): void;
}

export function createCloudDome(): CloudDome {
  const u = {
    color: uniform(new Vector3(1, 1, 1)),
    coverage: uniform(0.5),
    density: uniform(0.85),
    softness: uniform(0.3),
    scale: uniform(2),
    time: uniform(0),
    wind: uniform(new Vector2(0, 0)),
  };
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: BackSide });
  material.fog = false;
  const shading = Fn(() => {
    // The dome is never rotated: the local direction is the world view direction.
    const dir = normalize(positionLocal).toVar();
    const horizon = smoothstep(0, 0.18, dir.y).toVar();
    const horizonBlend = smoothstep(0, HORIZON_BLEND_END, dir.y);
    const projectionY = mix(HORIZON_PROJECTION_FLOOR, 1, horizonBlend);
    const plane = dir.xz.div(max(projectionY, 0.0001));
    const p = plane.mul(u.scale).add(u.wind.mul(u.time));
    const n = fbm(p as V2);
    const threshold = float(1).sub(u.coverage).toVar();
    const halfWidth = mix(0.02, 0.4, u.softness).toVar();
    const cover = smoothstep(threshold.sub(halfWidth), threshold.add(halfWidth), n);
    const alpha = cover.mul(u.density).mul(horizon);
    // Forge discarded below 0.003; fully transparent there instead.
    return alpha.mul(smoothstep(0.003, 0.0031, alpha));
  });
  material.colorNode = vec3(u.color as unknown as Node<"vec3">);
  material.opacityNode = shading();
  const mesh = new Mesh(new SphereGeometry(CLOUD_DOME_RADIUS, 32, 16), material);
  mesh.name = "cloud-layer";
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  const scratch = new Color();
  return {
    mesh,
    apply(settings) {
      scratch.set(settings.color);
      u.color.value.set(scratch.r, scratch.g, scratch.b);
      u.coverage.value = settings.coverage;
      u.density.value = settings.density;
      u.softness.value = settings.softness;
      u.scale.value = settings.scale;
      u.wind.value.copy(WIND_DIRECTION).multiplyScalar(settings.speed);
    },
    follow(camera) {
      mesh.position.copy(camera.position);
      const far = camera.far ?? CLOUD_DOME_RADIUS;
      mesh.scale.setScalar(Math.max(CLOUD_DOME_RADIUS, far * CLOUD_DOME_FAR_FRACTION) / CLOUD_DOME_RADIUS);
    },
    advance(seconds) {
      u.time.value += seconds;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
