// Rain and snow (plan phase W1): one volume of precipitation around the camera,
// one instanced draw. A particle's place, size and fade come from its instance
// index in the vertex shader (engine/environment/precipitationMotion.ts has the
// motion); there is no buffer and no CPU work per particle.
//
// - Rain: a quad stretched along the drop's velocity relative to the camera,
//   turned to face it. Snow: a round flake facing the camera, swaying on its way.
// - A particle thinner than a pixel is drawn one pixel wide and fainter by the
//   same factor (no shimmering hairlines).
// - It fades at the volume's edges (nothing pops when it wraps), right in front
//   of the eye and behind surfaces (the late layer's visibility).
// - Unlit: the colour is the air's (the fog's, as the weather and the hour leave
//   it), so it sits in the picture at any exposure; the binding sets it.
// - Drawn for the frame's camera only: a planar reflection collapses it.
//
// TSL's typings reject several valid uses here; taken untyped, as the terrain does.

import { Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3, type Camera, type Node } from "three/webgpu";
import * as TSLTyped from "three/tsl";
import type { Vec3Tuple } from "../../engine/environment/precipitationMotion.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>;
const { abs, cameraProjectionMatrix, clamp, cross, float, Fn, fract, hash, instanceIndex, length, max, min, normalize, positionGeometry, screenSize, sin, smoothstep, uniform, varyingProperty, vec3 } = TSL;

export interface PrecipitationVolume {
  readonly kind: "rain" | "snow";
  /** Metres; the box around the camera, lifted so most of it is above the eye. */
  readonly size: Readonly<Vec3Tuple>;
  /** Particles at strength, amount and density 1. */
  readonly count: number;
  /** Metres: a drop's width or a flake's size. */
  readonly width: number;
  readonly opacity: number;
}

/** A near and a far volume of each kind: the near one gives depth, the far one the curtain. */
export const PRECIPITATION_VOLUMES: readonly PrecipitationVolume[] = [
  { kind: "rain", size: [16, 14, 16], count: 7000, width: 0.006, opacity: 0.6 },
  { kind: "rain", size: [56, 36, 56], count: 22000, width: 0.016, opacity: 0.55 },
  { kind: "snow", size: [14, 12, 14], count: 5000, width: 0.018, opacity: 1 },
  { kind: "snow", size: [52, 34, 52], count: 20000, width: 0.04, opacity: 0.95 },
];

/** Seconds a drop's streak spans (an exposure). */
const STREAK_SECONDS = 1 / 45;
/** Longest streak, metres. */
const STREAK_MAX = 1.5;
/** Share of the height the volume is lifted by: what would fall below the ground is not drawn. */
const LIFT = 0.28;
const NEAR_FADE = [0.25, 1.1] as const;

export interface PrecipitationUpdate {
  readonly camera: Camera;
  readonly cameraPosition: Readonly<Vec3Tuple>;
  readonly phase: Readonly<Vec3Tuple>;
  /** Velocity relative to the camera (m/s); the streaks' direction and length. */
  readonly velocity: Readonly<Vec3Tuple>;
  readonly count: number;
  readonly opacity: number;
  /** Rain: streak length factor; snow: flake size factor. */
  readonly scale: number;
  readonly flutter: number;
  /** Simulation seconds (wrapped by the caller). */
  readonly seconds: number;
  readonly color: Readonly<Vec3Tuple>;
}

export interface PrecipitationDrawing {
  readonly volume: PrecipitationVolume;
  readonly mesh: Mesh;
  update(values: PrecipitationUpdate): void;
  hide(): void;
  dispose(): void;
}

export function createPrecipitation(volume: PrecipitationVolume, visibility: Node<"float">): PrecipitationDrawing {
  const rain = volume.kind === "rain";
  const u = {
    size: uniform(new Vector3(...volume.size)),
    phase: uniform(new Vector3()),
    camera: uniform(new Vector3()),
    velocity: uniform(new Vector3(0, -1, 0)),
    opacity: uniform(0),
    scale: uniform(1),
    flutter: uniform(0),
    seconds: uniform(0),
    color: uniform(new Vector3(1, 1, 1)),
  };
  let main: Camera | null = null;
  const shown = uniform(1).onRenderUpdate(({ camera }: { camera: Camera }) => (main === null || camera === main ? 1 : 0));
  const vAlpha: AnyNode = varyingProperty("float", "vPrecipitationAlpha");
  const vCorner: AnyNode = varyingProperty("vec2", "vPrecipitationCorner");

  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.name = `precipitation-${volume.kind}`;
  material.toneMapped = true;
  material.positionNode = Fn(() => {
    const index = instanceIndex.toUint().mul(5);
    const seed = vec3(hash(index), hash(index.add(1)), hash(index.add(2))).toVar();
    const own = hash(index.add(3)).toVar();
    const other = hash(index.add(4)).toVar();
    const unit = fract(seed.add(u.phase)).sub(0.5).toVar();
    const relative = unit.mul(u.size).add(vec3(0, u.size.y.mul(LIFT), 0)).toVar();
    if (!rain) {
      // Two slow swings at each flake's own pace; bounded, so a flake never leaves its place in the volume.
      const pace = own.mul(1.4).add(0.7);
      const sway = vec3(sin(u.seconds.mul(pace).add(seed.x.mul(40))), sin(u.seconds.mul(pace.mul(0.6)).add(seed.y.mul(40))).mul(0.4), sin(u.seconds.mul(pace.mul(1.3)).add(seed.z.mul(40))));
      relative.addAssign(sway.mul(u.flutter));
    }
    const distance = max(length(relative), 0.001).toVar();
    const toCamera = relative.negate().div(distance).toVar();
    const along = (rain ? normalize(u.velocity) : normalize(cross(toCamera, vec3(0.31, 0.95, 0.12)))).toVar();
    const side = normalize(cross(along, toCamera).add(vec3(0.00001, 0, 0.00001))).toVar();
    // A pixel's world size at this distance.
    const pixel = distance.mul(2).div(cameraProjectionMatrix.element(1).element(1).mul(screenSize.y)).toVar();
    const authored = rain ? float(volume.width).mul(own.mul(0.6).add(0.7)) : float(volume.width).mul(u.scale).mul(own.mul(0.9).add(0.55));
    const width = max(authored, pixel.mul(rain ? 1 : 1.5)).toVar();
    const thin = clamp(authored.div(width), 0, 1);
    const span = rain ? min(length(u.velocity).mul(STREAK_SECONDS).mul(u.scale).mul(other.mul(0.5).add(0.75)), STREAK_MAX) : width;
    const edge = smoothstep(0.5, 0.38, abs(unit.x)).mul(smoothstep(0.5, 0.38, abs(unit.y))).mul(smoothstep(0.5, 0.38, abs(unit.z)));
    const near = smoothstep(NEAR_FADE[0], NEAR_FADE[1], distance);
    // Thin in one direction (a streak) fades by the width, in two (a flake) by the area.
    vAlpha.assign(edge.mul(near).mul(rain ? thin : thin.mul(thin)).mul(u.opacity));
    const corner = positionGeometry.xy;
    vCorner.assign(corner.mul(2));
    const reach = corner.x.mul(width).mul(shown);
    const rise = corner.y.mul(span).mul(shown);
    return u.camera.add(relative).add(side.mul(reach)).add(along.mul(rise));
  })();
  material.colorNode = u.color;
  material.opacityNode = Fn(() => {
    const shape = rain
      ? float(1).sub(abs(vCorner.x)).mul(smoothstep(1, 0.2, abs(vCorner.y)))
      : smoothstep(1, 0.35, length(vCorner));
    return vAlpha.mul(shape).mul(visibility);
  })();

  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.name = `precipitation-${volume.kind}`;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  mesh.raycast = () => {};
  (mesh as Mesh & { count?: number }).count = 1;
  return {
    volume,
    mesh,
    update(values) {
      main = values.camera;
      (mesh as Mesh & { count?: number }).count = Math.max(1, values.count);
      mesh.visible = values.count > 0 && values.opacity > 0;
      u.phase.value.set(...values.phase);
      u.camera.value.set(...values.cameraPosition);
      u.velocity.value.set(...values.velocity);
      if (u.velocity.value.lengthSq() < 1e-6) u.velocity.value.set(0, -1, 0);
      u.opacity.value = values.opacity * volume.opacity;
      u.scale.value = values.scale;
      u.flutter.value = values.flutter;
      u.seconds.value = values.seconds;
      u.color.value.set(...values.color);
    },
    hide() {
      mesh.visible = false;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
