// Foliage wind sway on the GPU-driven batches (vegetation plan PG2; plan 5c
// decision 5: wind from WES, from vertex weights when the mesh carries them,
// else Forge's height formula). An instance-shading hook (gpu/instanceShading.ts)
// so the GPU path, its shadow views and the WebGL2 twin sway alike.
//
// - `height`: Forge WebGL's engine/render-three/windSway.ts unchanged: a
//   squared height mask in template metres (instance scale 1), a downwind lean
//   plus a flutter at the type's frequency with a per-instance phase from the
//   origin, gusts as a slow wave travelling downwind, faded out toward the
//   type's cull end.
// - `vertex`: the generated plant's `_wind` attribute (x trunk bend, y branch
//   sway, z phase, w leaf flutter; engine/procgen/tree): the trunk leans as
//   the height mask did, branches sway at their own phase, leaves flutter
//   fast and small. A mesh without the attribute falls back to `height`.
//
// Wind and time are uniforms shared by every batch of a world: a wind change
// never rebuilds a program.

import { attribute, cos, distance, dot, float, Fn, sin, smoothstep, uniform, vec2, vec3 } from "three/tsl";
import { Vector2, Vector3, type Node } from "three/webgpu";
import type { ResolvedWind } from "../../engine/environment/wind.ts";
import type { InstanceShading, InstanceShadingNodes } from "../gpu/instanceShading.ts";

export interface FoliageSway {
  readonly amplitude: number;
  readonly height: number;
  readonly frequency: number;
  readonly source: "height" | "vertex";
}

export interface FoliageWind {
  /** The frame's wind, its simulation seconds and the camera position. */
  update(wind: ResolvedWind, seconds: number, view: { x: number; y: number; z: number }): void;
  /** The hook of one type's sway; `fadeEnd` <= 0 never fades; `scale` multiplies it (a plant family's flexibility). */
  shading(sway: FoliageSway, fadeEnd: number, scale?: Node<"float">): InstanceShading;
}

const TAU = 6.2831853;

export function createFoliageWind(): FoliageWind {
  const time = uniform(0);
  const direction = uniform(new Vector2(0, 1));
  const strength = uniform(0);
  const gust = uniform(0);
  const viewOrigin = uniform(new Vector3());

  const common = (instance: InstanceShadingNodes, sway: FoliageSway, fadeEnd: number) => {
    const fade = fadeEnd > 0 ? float(1).sub(smoothstep(fadeEnd * 0.75, fadeEnd, distance(instance.origin, viewOrigin))) : float(1);
    const phase = dot(instance.origin.xz, vec2(0.37, 0.23));
    const wave = float(0.5).add(sin(dot(instance.origin.xz, direction).mul(0.08).sub(time.mul(1.3))).mul(0.5));
    const gusting = gust.mul(wave).mul(wave);
    const flutter = sin(time.mul(TAU * sway.frequency).add(phase));
    const downwind = vec3(direction.x, 0, direction.y);
    return { fade, phase, gusting, flutter, downwind };
  };

  const heightOffset = (instance: InstanceShadingNodes, sway: FoliageSway, fadeEnd: number): Node<"vec3"> => {
    const { fade, gusting, flutter, downwind } = common(instance, sway, fadeEnd);
    const mask = instance.template.y.div(Math.max(sway.height, 1e-4)).clamp(0, 1);
    const amount = float(sway.amplitude).mul(strength).mul(mask.mul(mask)).mul(fade).mul(float(0.6).add(flutter.mul(0.4)).add(gusting));
    return downwind.mul(amount);
  };

  const vertexOffset = (instance: InstanceShadingNodes, sway: FoliageSway, fadeEnd: number): Node<"vec3"> => {
    const { fade, gusting, flutter, downwind } = common(instance, sway, fadeEnd);
    const weights = attribute("_wind", "vec4");
    const scale = float(sway.amplitude).mul(strength).mul(fade);
    const lean = weights.x.mul(float(0.6).add(flutter.mul(0.4)).add(gusting));
    const branchPhase = time.mul(TAU * sway.frequency * 1.7).add(weights.z.mul(TAU));
    const branch = weights.y.mul(sin(branchPhase)).mul(float(0.5).add(gusting));
    // Leaves: a small fast flutter, partly vertical, its own phase.
    const leafPhase = time.mul(TAU * sway.frequency * 4.3).add(weights.z.mul(TAU * 3));
    const leaf = weights.w.mul(0.08).mul(strength).mul(fade);
    return downwind.mul(scale.mul(lean.add(branch))).add(vec3(cos(leafPhase), sin(leafPhase.mul(1.3)), sin(leafPhase)).mul(leaf));
  };

  return {
    update(wind, seconds, view) {
      time.value = seconds;
      direction.value.set(wind.direction[0], wind.direction[1]);
      strength.value = wind.strength;
      gust.value = wind.gust;
      viewOrigin.value.set(view.x, view.y, view.z);
    },
    shading(sway, fadeEnd, scale) {
      return (_material, instance) => {
        if (sway.amplitude <= 0) return;
        const worldOffset = sway.source === "vertex"
          // The geometry's attributes are part of the program key: branch per geometry.
          ? Fn((builder) => ((builder as unknown as { geometry?: { getAttribute(name: string): unknown } }).geometry?.getAttribute("_wind")
            ? vertexOffset(instance, sway, fadeEnd) : heightOffset(instance, sway, fadeEnd)))() as unknown as Node<"vec3">
          : heightOffset(instance, sway, fadeEnd);
        return { worldOffset: scale ? worldOffset.mul(scale) : worldOffset };
      };
    },
  };
}
