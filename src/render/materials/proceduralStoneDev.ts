// Development only (vegetation plan PG1, §6.6): path A of the stone material,
// for the A / C measurement on real WebGPU. The same noise stack as the
// `forge.surfaceTextureRecipe` default (gradient fBm 5 octaves + cellular 2
// octaves × 0.45) evaluated every pixel in model space (3D noise needs no
// projection), a three-stop colour ramp, roughness from height, and the
// normal bumped from the height's screen derivatives. Not a product surface:
// path C (baked tiles + `variation`) is the decision; this only measures what
// moving the detail into the shader would cost.

import { abs, clamp, cross, dot, float, Fn, mix, mx_fractal_noise_float, mx_worley_noise_float, normalize, normalView, positionGeometry, positionView, sign, smoothstep, vec3, vec4 } from "three/tsl";
import type { Material, MeshStandardNodeMaterial, Node, Object3D } from "three/webgpu";

const toLinear = (r: number, g: number, b: number) => vec3(...[r, g, b].map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number]);

const height = Fn(([p]: [Node<"vec3">]) => {
  const gradient = mx_fractal_noise_float(p.mul(4), 5, 2, 0.5, 1).mul(0.5).add(0.5);
  const cells = mx_worley_noise_float(p.mul(8)).add(mx_worley_noise_float(p.mul(16)).mul(0.5)).div(1.5);
  return clamp(gradient.add(cells.mul(0.45)).div(1.45), 0, 1);
});

/** Replaces the colour, roughness and normal nodes of every mesh material named `guid`; the count of materials changed. */
export function applyProceduralStone(root: Object3D, guid: string, metersPerRepeat = 1.5): number {
  const seen = new Set<Material>();
  root.traverse((object) => {
    const material = (object as { material?: Material | Material[] }).material;
    for (const entry of Array.isArray(material) ? material : material ? [material] : []) {
      if (entry.name === guid) seen.add(entry);
    }
  });
  for (const material of seen) {
    const node = material as MeshStandardNodeMaterial;
    const h = height(positionGeometry.div(metersPerRepeat)).toVar("forgeStoneHeight");
    const low = toLinear(0x4a / 255, 0x46 / 255, 0x40 / 255), mid = toLinear(0x7b / 255, 0x76 / 255, 0x6d / 255), high = toLinear(0xa2 / 255, 0x9c / 255, 0x90 / 255);
    const color = mix(mix(low, mid, smoothstep(0, 0.55, h)), high, smoothstep(0.55, 1, h));
    node.colorNode = vec4(color, 1);
    node.roughnessNode = mix(float(0.95), float(0.75), h);
    // Bump from derivatives (Mikkelsen's surface gradient), strength comparable to the baked normal.
    const dpdx = positionView.dFdx(), dpdy = positionView.dFdy();
    const r1 = cross(dpdy, normalView), r2 = cross(normalView, dpdx);
    const det = dot(dpdx, r1);
    const grad = sign(det).mul(r1.mul(h.dFdx()).add(r2.mul(h.dFdy()))).mul(0.04);
    node.normalNode = normalize(abs(det).mul(normalView).sub(grad));
    node.needsUpdate = true;
  }
  return seen.size;
}
