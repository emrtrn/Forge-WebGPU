// Exponential Height Fog: render binding.
//
// Forge WebGL's analytic height fog (engine/render-three/heightFog.ts,
// HEIGHT_FOG_FRAGMENT) rewritten in TSL as the scene's fog node, instead of a
// GLSL patch on every material: the exponential density integral along the
// view ray with height falloff, the clear distance, the maximum opacity, the
// linear mode, and the sun tint lobe (alignment^4, faded out below the
// horizon). Values are uniforms, refreshed from `HeightFogState` each frame
// (or the World Environment's override of it); only the fog appearing or going
// away changes the shaders.

import { cameraPosition, clamp, exp, float, Fn, fog, max, min, mix, positionView, positionWorld, select, smoothstep, uniform } from "three/tsl";
import { Color, Vector3 } from "three/webgpu";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { HeightFogStateKey } from "./runtime.ts";
import type { HeightFogData } from "./schema.ts";

/** Forge's ray-length floor and Taylor threshold of the integral. */
const MIN_DEPTH = 0.0001;
const SMALL_DELTA = 0.001;

export default defineRenderBinding({
  feature: "forge.heightFog",
  create(ctx) {
    const u = {
      linear: uniform(0),
      // Colours as linear RGB vectors (set through a Color, so hex is converted from sRGB).
      color: uniform(new Vector3()),
      density: uniform(0),
      falloff: uniform(0),
      baseHeight: uniform(0),
      startDistance: uniform(0),
      maxOpacity: uniform(1),
      start: uniform(0),
      end: uniform(1),
      sunDirection: uniform(new Vector3(0, -1, 0)),
      sunStrength: uniform(0),
      sunColor: uniform(new Vector3()),
    };

    const factor = Fn(() => {
      const depth = positionView.z.negate().toVar();
      const offset = positionWorld.sub(cameraPosition).toVar();
      // Exponential: density x distance past the clear distance, scaled by the
      // height integral when the fog thins with height.
      const distanceToFog = max(depth.sub(u.startDistance), 0).toVar();
      const opticalDepth = u.density.mul(distanceToFog).toVar();
      const rayStart = u.startDistance.div(max(depth, MIN_DEPTH));
      const startY = cameraPosition.y.add(offset.y.mul(rayStart));
      const endY = cameraPosition.y.add(offset.y);
      const lowExponent = clamp(u.falloff.negate().mul(min(startY, endY).sub(u.baseHeight)), -20, 20);
      const delta = u.falloff.mul(endY.sub(startY).abs()).toVar();
      const integral = select(
        delta.lessThan(SMALL_DELTA),
        float(1).sub(delta.mul(0.5)).add(delta.mul(delta).div(6)),
        float(1).sub(exp(delta.negate())).div(max(delta, SMALL_DELTA)),
      );
      const heightScale = select(u.falloff.greaterThan(0).and(distanceToFog.greaterThan(0)), exp(lowExponent).mul(integral), float(1));
      const scaled = opticalDepth.mul(heightScale);
      const exponential = float(1).sub(exp(scaled.mul(scaled).negate()));
      const linear = smoothstep(u.start, u.end, depth);
      return min(select(u.linear.greaterThan(0.5), linear, exponential), u.maxOpacity);
    });

    const inscattering = Fn(() => {
      const viewRay = positionWorld.sub(cameraPosition).normalize();
      const alignment = max(viewRay.dot(u.sunDirection), 0);
      const lobe = alignment.mul(alignment).mul(alignment).mul(alignment);
      return mix(u.color, u.sunColor, lobe.mul(u.sunStrength));
    });

    const node = fog(inscattering(), factor());
    let shown = false;

    const scratch = new Color();
    const setColor = (target: Vector3, hex: string): void => {
      scratch.set(hex);
      target.set(scratch.r, scratch.g, scratch.b);
    };

    const apply = (data: HeightFogData): void => {
      u.linear.value = data.mode === "linear" ? 1 : 0;
      setColor(u.color.value, data.color);
      u.density.value = data.density;
      u.falloff.value = data.heightFalloff;
      u.baseHeight.value = data.baseHeight;
      u.startDistance.value = data.startDistance;
      u.maxOpacity.value = data.maxOpacity;
      u.start.value = data.start;
      u.end.value = data.end;
      const sun = ctx.lighting.sunDirection;
      u.sunDirection.value.copy(sun);
      // Forge: the tint fades out as the sun goes below the horizon.
      u.sunStrength.value = data.sunStrength * Math.max(0, Math.min(1, sun.y * 10));
      setColor(u.sunColor.value, data.sunColor);
    };

    return {
      sync() {
        const state = ctx.world.services.get(HeightFogStateKey);
        // The World Environment's reading of the fog (weather, night, dusk) while it is active.
        const data = state?.fog ? ((ctx.environment.override?.fog as HeightFogData | null | undefined) ?? state.fog) : null;
        if (data) apply(data);
        if ((data !== null) !== shown) {
          shown = data !== null;
          ctx.scene.fogNode = shown ? node : null;
        }
      },
      dispose() {
        if (shown) ctx.scene.fogNode = null;
        shown = false;
      },
    };
  },
});
