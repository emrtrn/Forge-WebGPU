// The shading terms a crown family's meshes and impostor share (vegetation
// plan PG5b, §9.8; plantDrawing.ts, impostorMaterial.ts).

import { dot, float, hash, max, min, mix, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";

/** What a place in the crown keeps of its colour: `light` 1 outside, small in the core. */
export const crownShade = (light: Node<"float">, depth: Node<"float">): Node<"float"> => mix(float(1), light.mul(0.6).add(0.4), depth);
/**
 * The season's colour on a leaf. A tint multiplied into green only darkens it (orange on green is brown): the more
 * saturated the tint, the more it takes the leaf's brightness instead of its colour. White leaves the leaf as it is.
 */
export function seasonTint(leaf: Node<"vec3">, tint: Node<"vec3">): Node<"vec3"> {
  const high = max(tint.x, max(tint.y, tint.z)), low = min(tint.x, min(tint.y, tint.z));
  const saturation = high.sub(low).div(high.max(1e-4));
  const bright = dot(leaf, vec3(0.2126, 0.7152, 0.0722)).mul(1.7);
  return mix(leaf.mul(tint), tint.mul(bright), saturation);
}
/** The colour of the light a leaf lets through. */
export const throughColor = (leaf: Node<"vec3">, translucency: Node<"float">): Node<"vec3"> => leaf.mul(vec3(1.3, 1.2, 0.55)).mul(translucency);
/** An instance's own tone: a little lighter or darker, a little warmer or cooler. */
export function instanceTone(seed: Node<"uint">): Node<"vec3"> {
  const tone = float(0.9).add(hash(seed.add(17)).mul(0.2)), warm = hash(seed.add(41)).sub(0.5).mul(0.16);
  return vec3(tone.add(warm), tone, tone.sub(warm.mul(0.6)));
}
