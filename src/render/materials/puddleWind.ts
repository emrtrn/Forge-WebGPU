// Forge terrainPuddleSurface.ts @ forge-webgl-final: its complete wind block,
// expressed in TSL. Two normal layers, curved crests, packets/breeze windows,
// derivative filtering and roughness broadening. No displacement of the bed.
import * as THREE from "three/webgpu";
import * as TSLTyped from "three/tsl";
import { PuddleWindMotion } from "../../engine/environment/puddleWind.ts";
import type { ResolvedWind } from "../../engine/environment/wind.ts";
import { PUDDLE_WIND_DEFAULTS, type PuddleWindSettings } from "../../engine/terrain/puddleWater.ts";

type Node = any;
const TSL = TSLTyped as unknown as Record<string, any>;
const { dot, floor, fract, sin, mix, vec2, vec4, float, max, sqrt, smoothstep, cos, length, fwidth, clamp, texture, uniform, positionWorld } = TSL;

function noise(p: Node): Node {
  const cell = floor(p);
  const f0 = fract(p);
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  const h = fract(sin(vec4(dot(cell, vec2(127.1, 311.7)), dot(cell.add(vec2(1, 0)), vec2(127.1, 311.7)),
    dot(cell.add(vec2(0, 1)), vec2(127.1, 311.7)), dot(cell.add(1), vec2(127.1, 311.7)))).mul(43758.5453));
  return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}

export function createPuddleWind() {
  const motion = new PuddleWindMotion();
  const offset = uniform(new THREE.Vector4());
  const wave = uniform(new THREE.Vector3(0, 1, 0));
  const origin = uniform(new THREE.Vector2());
  const parameters = uniform(new THREE.Vector4(0, PUDDLE_WIND_DEFAULTS.windWorldScale, 0, 0));
  let normal: THREE.Texture | null = null;

  return {
    motion,
    setNormal(next: THREE.Texture | null) { normal = next; },
    update(wind: ResolvedWind, seconds: number, appearance: Partial<PuddleWindSettings>, x: number, z: number) {
      motion.update(wind, seconds, appearance);
      offset.value.fromArray(motion.offset);
      wave.value.set(wind.direction[0], wind.direction[1], motion.phase);
      origin.value.set(x, z);
      parameters.value.set(motion.strength, appearance.windWorldScale ?? PUDDLE_WIND_DEFAULTS.windWorldScale, normal ? 1 : 0, motion.seconds);
    },
    nodes(depth: Node, roughness: Node): { gradient: Node; roughness: Node } {
      // An absent normal compiles no texture read (Forge's z > .5 guard).
      if (!normal) return { gradient: vec2(0), roughness };
      const uv = positionWorld.xz.div(parameters.y);
      const rotate = (p: Node) => vec2(p.x.mul(.8).sub(p.y.mul(.6)), p.x.mul(.6).add(p.y.mul(.8)));
      const unrotate = (p: Node) => vec2(p.x.mul(.8).add(p.y.mul(.6)), p.y.mul(.8).sub(p.x.mul(.6)));
      const n1 = texture(normal, uv.sub(offset.xy)).xyz.mul(2).sub(1);
      const n2 = texture(normal, rotate(uv).mul(1.73).sub(offset.zw).add(17.3)).xyz.mul(2).sub(1);
      const detail = n1.xy.div(max(.35, n1.z)).mul(.65).add(unrotate(n2.xy).div(max(.35, n2.z)).mul(.35));
      const downwind = wave.xy;
      const across = vec2(downwind.y.negate(), downwind.x);
      const local = positionWorld.xz.sub(origin);
      const lateral = dot(local, across);
      const radius = max(.6, parameters.y.mul(1.7));
      const arc = sqrt(lateral.mul(lateral).add(radius.mul(radius)));
      const bend = arc.sub(radius).mul(.65);
      const bendDerivative = lateral.mul(.65).div(arc);
      const along = dot(local, downwind);
      const patchUV = vec2(along, lateral).div(max(.7, parameters.y.mul(2)));
      const drift = vec2(parameters.w.mul(.13), parameters.w.mul(-.035));
      const broad = noise(patchUV.mul(vec2(.7, 1.1)).sub(drift).add(8.3));
      const breakup = noise(patchUV.mul(vec2(2.1, 1.3)).sub(drift.mul(.7)).add(31.7));
      let packet = smoothstep(.35, .7, broad.mul(.7).add(breakup.mul(.3)));
      const breeze = float(.5).add(sin(parameters.w.mul(1.35).sub(patchUV.x.mul(.9)).add(patchUV.y.mul(.8))).mul(.32))
        .add(sin(parameters.w.mul(.57).sub(patchUV.x.mul(.6)).add(2.1)).mul(.18));
      packet = packet.mul(smoothstep(.32, .72, breeze));
      const warp = noise(patchUV.mul(1.6).add(17.9)).sub(.5);
      const cycles = along.add(bend).div(parameters.y.mul(.24)).add(warp.mul(1.3)).sub(wave.z);
      const phase = cycles.mul(6.28318530718);
      const resolved = float(1).sub(smoothstep(.16, .48, fwidth(cycles)));
      const ridge = cos(phase).add(cos(phase.mul(2).add(warp)).mul(.22)).div(1.22);
      const crest = downwind.add(across.mul(bendDerivative));
      const slope = crest.mul(ridge).mul(1.6).mul(resolved).mul(packet).add(detail.mul(float(.08).add(packet.mul(.24))));
      const gradient = slope.mul(parameters.x).mul(smoothstep(0, .025, depth));
      const breezeRoughness = smoothstep(0, .08, parameters.x).mul(packet);
      const wide = mix(roughness, max(roughness, .36), breezeRoughness);
      return { gradient, roughness: TSL.select(parameters.x.greaterThan(0), clamp(wide.add(TSL.min(.18, length(fwidth(slope)).mul(parameters.x).mul(.3))), .04, 1), roughness) };
    },
  };
}
