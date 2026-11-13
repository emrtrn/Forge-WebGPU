// Directional shadows (plan phase 3 step 3, architecture §4.9).
//
// - A sun with Cascaded Shadows casts through three's CSMShadowNode with Forge
//   WebGL's splits (engine/world/sunCascades: practical split, lambda 0.75,
//   near 1 m, distance 200 m x the quality's shadowDistanceScale, 100 m light
//   margin). The node takes the rendering camera itself in its setup; the
//   camera is never assigned by hand (that skips its init and the shadow
//   receivers vanish, phase 1 finding).
// - Every other shadow-casting directional light uses one map that follows
//   the camera (Forge's engine/render-three/sunFollowShadow.ts, rewritten on
//   three/webgpu): re-centred ahead of the camera every frame and texel
//   snapped in light space (engine/world/followShadow), half extent 60 m x
//   shadowDistanceScale. Forge's third mode, one map fitted to the level's
//   bounds, is not kept (design decision: cascades or the follow map).
// - Depth bias -0.0005 (Forge's SHADOW_DEPTH_BIAS; with reversed depth three
//   flips the comparison itself), normal bias 0.02, the follow map included.
//   Forge gave the follow map a 2 cm world bias (-0.02 / its 300 m depth
//   range); on WebGPU that showed acne across a lit floor on the real GPU
//   (phase 3 step 3 smoke), so it keeps the shared -0.0005 (about 15 cm over
//   300 m, the phase 1 spike's value).
//
// Not carried over: Forge's staggered cascade refresh (`shadowCascadeStagger`;
// CSMShadowNode draws every cascade each frame) and its texture unit budget
// check (a WebGL sampler limit).

import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import { Vector3, type DirectionalLight, type Light, type Object3D, type PointLight, type SpotLight } from "three/webgpu";
import { computeFollowShadowFrame } from "../../engine/world/followShadow.ts";
import { computeCascadeSplits, SUN_CASCADE_DEPTH_MARGIN, SUN_CASCADE_NEAR, SUN_CASCADE_SPLIT_LAMBDA } from "../../engine/world/sunCascades.ts";

export const SHADOW_DEPTH_BIAS = -0.0005;
export const SHADOW_NORMAL_BIAS = 0.02;
/** Half width of the follow map before the quality's shadowDistanceScale (Forge). */
export const FOLLOW_SHADOW_HALF_EXTENT = 60;
/** Reach toward and away from the light around the focus, metres (Forge). */
export const FOLLOW_SHADOW_DEPTH = 150;
/** How far ahead of the camera (x half extent) the follow map is centred (Forge). */
const FOLLOW_SHADOW_LEAD = 0.5;

type ShadowLight = DirectionalLight | PointLight | SpotLight;

/** Map size and biases of a shadow-casting light; a new size drops the old map. */
export function configureShadow(light: ShadowLight, mapSize: number): void {
  if (light.shadow.mapSize.width !== mapSize) {
    light.shadow.mapSize.set(mapSize, mapSize);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.shadow.needsUpdate = true;
  }
  light.shadow.bias = SHADOW_DEPTH_BIAS;
  light.shadow.normalBias = SHADOW_NORMAL_BIAS;
}

const lightWorld = new Vector3();
const targetWorld = new Vector3();
const forward = new Vector3();
const scratch = new Vector3();

function setWorldPosition(object: Object3D, world: readonly [number, number, number]): void {
  const position = scratch.set(world[0], world[1], world[2]);
  if (object.parent) {
    object.parent.updateWorldMatrix(true, false);
    object.parent.worldToLocal(position);
  }
  object.position.copy(position);
  object.updateMatrixWorld(true);
}

/**
 * Re-centres `light`'s shadow frustum on a point ahead of the camera along its
 * horizontal forward; light and target move together along the light
 * direction, so the lighting does not change. False when the light has no
 * usable direction (it is left alone).
 */
export function updateFollowShadow(light: DirectionalLight, cameraPosition: Vector3, cameraForward: Vector3, halfExtent: number): boolean {
  light.updateWorldMatrix(true, false);
  light.target.updateWorldMatrix(true, false);
  light.getWorldPosition(lightWorld);
  light.target.getWorldPosition(targetWorld);
  forward.set(cameraForward.x, 0, cameraForward.z);
  if (forward.lengthSq() > 1e-8) forward.normalize();
  const focus = forward.multiplyScalar(halfExtent * FOLLOW_SHADOW_LEAD).add(cameraPosition);
  const frame = computeFollowShadowFrame({
    lightDirection: [targetWorld.x - lightWorld.x, targetWorld.y - lightWorld.y, targetWorld.z - lightWorld.z],
    focus: [focus.x, focus.y, focus.z],
    halfExtent,
    mapSize: light.shadow.mapSize.width,
    depthAbove: FOLLOW_SHADOW_DEPTH,
    depthBelow: FOLLOW_SHADOW_DEPTH,
  });
  if (!frame) return false;
  setWorldPosition(light, frame.position);
  setWorldPosition(light.target, frame.target);
  const camera = light.shadow.camera;
  camera.left = frame.left;
  camera.right = frame.right;
  camera.top = frame.top;
  camera.bottom = frame.bottom;
  camera.near = frame.near;
  camera.far = frame.far;
  camera.updateProjectionMatrix();
  return true;
}

/** The cascades of one sun: built for a count / distance / map size, rebuilt when one changes. */
export interface SunCascades {
  /** Cascades for this frame's quality; false (and inactive) below 2. */
  apply(count: number, distance: number, mapSize: number): boolean;
  readonly active: boolean;
  deactivate(): void;
}

export function createSunCascades(light: DirectionalLight): SunCascades {
  let node: CSMShadowNode | null = null;
  let key = "";
  const deactivate = (): void => {
    if (!node) return;
    (light.shadow as { shadowNode?: unknown }).shadowNode = null;
    node.dispose();
    node = null;
    key = "";
  };
  return {
    apply(count, distance, mapSize) {
      if (count < 2) {
        deactivate();
        return false;
      }
      const next = `${count}|${distance}|${mapSize}`;
      if (node && next === key) return true;
      deactivate();
      configureShadow(light, mapSize);
      node = new CSMShadowNode(light as unknown as ConstructorParameters<typeof CSMShadowNode>[0], {
        cascades: count,
        maxFar: distance,
        mode: "custom",
        lightMargin: SUN_CASCADE_DEPTH_MARGIN,
        customSplitsCallback: (cascades: number, _near: number, far: number, breaks: number[]) => {
          const splits = computeCascadeSplits(cascades, SUN_CASCADE_NEAR, far, SUN_CASCADE_SPLIT_LAMBDA);
          for (let index = 0; index < cascades - 1; index += 1) breaks.push(splits[index]! / far);
          breaks.push(1);
        },
      });
      node.fade = true;
      (light.shadow as { shadowNode?: unknown }).shadowNode = node;
      key = next;
      return true;
    },
    get active() {
      return node !== null;
    },
    deactivate,
  };
}

export function isShadowLight(light: Light): light is ShadowLight {
  return (light as { shadow?: unknown }).shadow !== undefined;
}
