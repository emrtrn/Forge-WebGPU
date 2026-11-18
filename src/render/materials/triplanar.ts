// Triplanar projection in model space (vegetation plan PG1, §6.3 / §6.6):
// three axis projections of the geometry's own position, blended by the
// geometry normal raised to `sharpness`. No UVs are needed (the generated rock
// has none). Model space is the vertex attribute itself, so the texture sticks
// to the object on every draw path (instanced, GPU-driven template space).
//
// Normal maps: each projection's tangent frame comes from screen derivatives
// of the view position and that projection's coordinates (three's
// `tangentViewFrame` formula, thetenthplanet.de/archives/1180, with the
// projection's UV instead of `uv()`), so the frame is right whatever matrices
// the draw path applies; the three perturbed view normals are blended by the
// same weights.

import { abs, float, Fn, normalGeometry, normalView, normalize, positionGeometry, positionView, pow, texture, vec2, vec3 } from "three/tsl";
import type { Node, Texture } from "three/webgpu";

type Pair = readonly [number, number];
type Vec2Node = Node<"vec2">;
type Vec3Node = Node<"vec3">;

export interface TriplanarProjection {
  /** The three projections' samples of `tex`, blended. */
  sample(tex: Texture, tiling: Pair): Node<"vec4">;
  /** A tangent-space normal map (0..1 packed) as a view-space normal, `scale` on its XY. */
  normal(tex: Texture, tiling: Pair, scale?: number): Vec3Node;
}

/** The view-space normal of a packed normal map sample in the frame of `coords` (derivatives, no tangents). */
const perturb = Fn(([packed, coords, scale]: [Vec3Node, Vec2Node, Node<"float">]) => {
  const q0 = positionView.dFdx(), q1 = positionView.dFdy();
  const st0 = coords.dFdx(), st1 = coords.dFdy();
  const n = normalView;
  const q1perp = q1.cross(n), q0perp = n.cross(q0);
  const t = q1perp.mul(st0.x).add(q0perp.mul(st1.x));
  const b = q1perp.mul(st0.y).add(q0perp.mul(st1.y));
  const det = t.dot(t).max(b.dot(b));
  const inv = det.equal(0).select(0, det.inverseSqrt());
  const m = packed.mul(2).sub(1);
  return normalize(t.mul(inv).mul(m.x.mul(scale)).add(b.mul(inv).mul(m.y.mul(scale))).add(n.mul(m.z)));
});

export function triplanarProjection(metersPerRepeat: number, sharpness: number): TriplanarProjection {
  const p = positionGeometry.div(Math.max(1e-4, metersPerRepeat));
  const raw = pow(abs(normalize(normalGeometry)), vec3(sharpness, sharpness, sharpness));
  const weights = raw.div(raw.x.add(raw.y).add(raw.z).max(1e-5)).toVar("forgeTriplanarWeights");
  const coords = (tiling: Pair): [Vec2Node, Vec2Node, Vec2Node] => {
    const t = vec2(tiling[0], tiling[1]);
    return [p.zy.mul(t), p.xz.mul(t), p.xy.mul(t)];
  };
  return {
    sample(tex, tiling) {
      const [x, y, z] = coords(tiling);
      return texture(tex, x).mul(weights.x).add(texture(tex, y).mul(weights.y)).add(texture(tex, z).mul(weights.z)) as unknown as Node<"vec4">;
    },
    normal(tex, tiling, scale = 1) {
      const [x, y, z] = coords(tiling);
      const s = float(scale);
      const nx = perturb(texture(tex, x).xyz, x, s), ny = perturb(texture(tex, y).xyz, y, s), nz = perturb(texture(tex, z).xyz, z, s);
      return normalize(nx.mul(weights.x).add(ny.mul(weights.y)).add(nz.mul(weights.z))) as unknown as Vec3Node;
    },
  };
}
