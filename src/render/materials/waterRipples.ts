// Ripples on standing water (plan phase W6, user scope 2026-11-26): rain rings
// on a material's puddle, a wet patch (faintly) and `forge.puddle`'s water,
// and the wind's crests on a material's puddle. The rings' rule is
// engine/environment/rainRipples.ts (its CPU twin; the formulas below repeat
// it); the crests are `forge.puddle`'s procedural wind (puddleWind.ts) without
// its normal texture: a texture read with implicit derivatives is not allowed
// inside the per-pixel branch that keeps dry pixels free.
//
// Uniforms only: rain, wind and settings change no program. Without rain and
// wind one uniform branch skips it all; a pixel without water only compares
// its mask. The clock is simulation time (pause stops it).
import { Vector2, Vector4 } from "three/webgpu";
import * as TSLTyped from "three/tsl";
import { PuddleWindMotion } from "../../engine/environment/puddleWind.ts";
import {
  RIPPLE_FADE, RIPPLE_JITTER, RIPPLE_LAYERS, RIPPLE_PERIOD, RIPPLE_RADIUS, RIPPLE_SLOPE, RIPPLE_WIDTH, WATER_RIPPLE_DEFAULTS,
  rippleActiveShare, rippleClock, rippleSetting, rippleStrengthNow, type WaterRippleSettings,
} from "../../engine/environment/rainRipples.ts";
import { PUDDLE_WIND_DEFAULTS } from "../../engine/terrain/puddleWater.ts";

type Node = any;
const TSL = TSLTyped as unknown as Record<string, any>;

/** surfaceResponse.ts `hash12` (Dave Hoskins, no sine). */
export function hash12Node(p: Node): Node {
  const { dot, fract, vec3 } = TSL;
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031));
  const q = p3.add(dot(p3, p3.yzx.add(33.33)));
  return fract(q.x.add(q.y).mul(q.z));
}

function valueNoiseNode(p: Node): Node {
  const { floor, fract, mix, vec2 } = TSL;
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  return mix(mix(hash12Node(i), hash12Node(i.add(vec2(1, 0))), u.x), mix(hash12Node(i.add(vec2(0, 1))), hash12Node(i.add(vec2(1, 1))), u.x), u.y);
}

export interface WaterRippleInput {
  /** The live rain, 0..1 (`livePrecipitation`, a weather transition's mix included). */
  readonly rain: number;
  /** Simulation seconds. */
  readonly seconds: number;
  readonly settings?: Partial<WaterRippleSettings> | null;
  /** The wind the crests follow; absent: none. */
  readonly wind?: { readonly direction: readonly [number, number]; readonly strength: number; readonly gust?: number } | null;
}

export function createWaterRipples() {
  const { uniform } = TSL;
  /** x strength (0: no rain), y active share, z cell size (m), w the wrapped clock (s). */
  const rain = uniform(new Vector4(0, 0, WATER_RIPPLE_DEFAULTS.rippleSize, 0));
  /** The distance fade window (m), scaled by the cell size. */
  const fade = uniform(new Vector2(RIPPLE_FADE[0], RIPPLE_FADE[1]));
  /** x crest slope (0: no wind), y crest scale (m), z phase, w the wrapped clock (s). */
  const wind = uniform(new Vector4(0, PUDDLE_WIND_DEFAULTS.windWorldScale, 0, 0));
  /** The wind's XZ direction (blowing toward). */
  const windDirection = uniform(new Vector2(1, 0));
  const motion = new PuddleWindMotion();

  const rings = (position: Node, footprint: Node): Node => {
    const { cameraPosition, clamp, cos, distance, float, floor, fract, length, max, sin, smoothstep, step, vec2 } = TSL;
    let sum: Node = vec2(0, 0);
    for (const [scale, clock, offset] of RIPPLE_LAYERS) {
      const p = position.xz.div(rain.z.mul(scale));
      const cell = floor(p).add(offset);
      const active = float(1).sub(step(rain.y, hash12Node(cell)));
      const centre = vec2(hash12Node(cell.add(vec2(7.7, 3.1))), hash12Node(cell.add(vec2(2.9, 9.3)))).sub(0.5).mul(RIPPLE_JITTER).add(0.5);
      const t = fract(rain.w.div(RIPPLE_PERIOD).add(hash12Node(cell.add(vec2(5.3, 1.7)))).add(clock));
      const delta = fract(p).sub(centre);
      const d = max(length(delta), 0.0001);
      // rainRipples.ts `ringProfileSlope`: zero past the ring's width (k = 0 at |x| = 1).
      const x = clamp(d.sub(t.mul(RIPPLE_RADIUS)).div(RIPPLE_WIDTH), -1, 1);
      const k = float(1).sub(x.mul(x));
      const profile = k.mul(cos(x.mul(Math.PI)).mul(Math.PI).mul(k).sub(x.mul(4).mul(sin(x.mul(Math.PI))))).div(Math.PI);
      const life = float(1).sub(t);
      sum = sum.add(delta.div(d).mul(profile.mul(life).mul(life).mul(active)));
    }
    // rainRipples.ts `rippleDistanceFade` / `rippleFootprintFade`.
    const ring = rain.z.mul(RIPPLE_WIDTH);
    const shown = float(1).sub(smoothstep(fade.x, fade.y, distance(position, cameraPosition)))
      .mul(float(1).sub(smoothstep(ring.mul(0.5), ring, footprint)));
    return sum.mul(rain.x.mul(RIPPLE_SLOPE).mul(shown));
  };

  const crests = (position: Node, footprint: Node): Node => {
    const { cos, dot, float, max, sin, smoothstep, vec2 } = TSL;
    // puddleWind.ts's crests without its seed's bend and its normal texture.
    const downwind = windDirection;
    const across = vec2(downwind.y.negate(), downwind.x);
    const along = dot(position.xz, downwind);
    const lateral = dot(position.xz, across);
    const patchUV = vec2(along, lateral).div(max(0.7, wind.y.mul(2)));
    const drift = vec2(wind.w.mul(0.13), wind.w.mul(-0.035));
    const broad = valueNoiseNode(patchUV.mul(vec2(0.7, 1.1)).sub(drift).add(8.3));
    const breakup = valueNoiseNode(patchUV.mul(vec2(2.1, 1.3)).sub(drift.mul(0.7)).add(31.7));
    const breeze = float(0.5).add(sin(wind.w.mul(1.35).sub(patchUV.x.mul(0.9)).add(patchUV.y.mul(0.8))).mul(0.32))
      .add(sin(wind.w.mul(0.57).sub(patchUV.x.mul(0.6)).add(2.1)).mul(0.18));
    const packet = smoothstep(0.35, 0.7, broad.mul(0.7).add(breakup.mul(0.3))).mul(smoothstep(0.32, 0.72, breeze));
    const warp = valueNoiseNode(patchUV.mul(1.6).add(17.9)).sub(0.5);
    const wavelength = wind.y.mul(0.24);
    const phase = along.div(wavelength).add(warp.mul(1.3)).sub(wind.z).mul(Math.PI * 2);
    const ridge = cos(phase).add(cos(phase.mul(2).add(warp)).mul(0.22)).div(1.22);
    const resolved = float(1).sub(smoothstep(0.16, 0.48, footprint.div(wavelength)));
    return downwind.mul(ridge.mul(1.6).mul(resolved).mul(packet).mul(wind.x));
  };

  return {
    /**
     * World XZ slope of the water at `position`: rings × `ringMask`, crests × `windMask` (null: no crests). Call it in
     * uniform control flow (the pixel footprint is a derivative); the work is inside its own branches.
     */
    slope(position: Node, ringMask: Node, windMask: Node | null): Node {
      const { Fn, If, fwidth, length, max, vec2 } = TSL;
      return Fn(() => {
        const out = vec2(0, 0).toVar("forgeWaterRipple");
        const footprint = length(fwidth(position.xz)).toVar("forgeWaterFootprint");
        const on = windMask ? rain.x.add(wind.x) : rain.x;
        If(on.greaterThan(0), () => {
          const mask = windMask ? max(ringMask, windMask) : ringMask;
          If(mask.greaterThan(0.001), () => {
            const ringSlope = rings(position, footprint).mul(ringMask);
            out.assign(windMask ? ringSlope.add(crests(position, footprint).mul(windMask)) : ringSlope);
          });
        });
        return out;
      })();
    },
    update(input: WaterRippleInput | null) {
      const settings = input?.settings ?? null;
      const size = rippleSetting(settings, "rippleSize");
      const clock = rippleClock(input?.seconds ?? 0);
      rain.value.set(rippleStrengthNow(input?.rain ?? 0, settings), rippleActiveShare(input?.rain ?? 0, settings), size, clock);
      const scale = size / WATER_RIPPLE_DEFAULTS.rippleSize;
      fade.value.set(RIPPLE_FADE[0] * scale, RIPPLE_FADE[1] * scale);
      const w = input?.wind ?? null;
      const windStrength = rippleSetting(settings, "windRippleStrength");
      if (!input || !w || windStrength <= 0) {
        wind.value.x = 0;
        return;
      }
      motion.update({ directionDeg: 0, direction: w.direction, strength: w.strength, gust: w.gust ?? 0 }, input.seconds);
      wind.value.set(motion.strength * windStrength, PUDDLE_WIND_DEFAULTS.windWorldScale, motion.phase, clock);
      windDirection.value.set(w.direction[0], w.direction[1]);
    },
  };
}

export type WaterRipples = ReturnType<typeof createWaterRipples>;
