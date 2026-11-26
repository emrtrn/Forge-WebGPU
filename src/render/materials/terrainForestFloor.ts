import { Color, Vector2 } from "three/webgpu";
import * as TSLTyped from "three/tsl";
import { createStream } from "../../engine/procgen/random.ts";
import { detailNoise } from "./terrainDetail.ts";

// Same TSL types as terrain.ts and terrainDetail.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { dFdx, dFdy, float, length, mat2, max, mix, smoothstep, uniform, vec3 } = TSLTyped as unknown as Record<string, any>;

const ROTATION = 0.57;
const SOIL_GRAIN_METRES = 0.032;

/** Modulates the existing litter tile before the terrain's paint layers are blended. */
export function terrainForestFloor(worldXZ: AnyNode, litter: AnyNode, seed: number): { color: AnyNode; relief: AnyNode } {
  const random = createStream(seed, "world-terrain/forest-floor");
  const phase = uniform(new Vector2(random.range(-512, 512), random.range(-512, 512)));
  const c = Math.cos(ROTATION), s = Math.sin(ROTATION);
  const p = mat2(c, s, -s, c).mul(worldXZ).add(phase).toVar();
  // World XZ is continuous across tile slots and the far map. The two wavelengths
  // vary the pocket widths and break up the edges without distorting leaf UVs.
  const field = detailNoise(p.div(5.4)).mul(0.76).add(detailNoise(p.div(2.2)).mul(0.24)).toVar();
  const leaves = smoothstep(0.38, 0.55, field).toVar();
  const soil = smoothstep(0.65, 0.76, field).toVar();

  const humusColor = litter.mul(vec3(0.56, 0.48, 0.40));
  const leafColor = litter.mul(vec3(1.41, 1.16, 0.89));
  // Exposed soil has fine grain and small clods, with some fine litter still mixed in.
  const footprint = max(length(dFdx(worldXZ)), length(dFdy(worldXZ)));
  const grain = mix(detailNoise(p.div(SOIL_GRAIN_METRES)), float(0.5), smoothstep(0.015, 0.036, footprint));
  const clods = detailNoise(p.div(0.31));
  const soilTone = grain.mul(0.65).add(clods.mul(0.35));
  const soilColor = mix(uniform(new Color("#ac6f41")), uniform(new Color("#dbab73")), soilTone).mul(0.9).add(litter.mul(0.16));
  return {
    color: mix(mix(humusColor, leafColor, leaves), soilColor, soil),
    relief: mix(mix(float(0.58), float(1), leaves), float(0.31), soil),
  };
}
