// The GPU occlusion test (plan 5c R9a O4): `engine/world/hiZ.ts`
// `sphereOccludedPacked` written in TSL, step for step, for a reversed depth
// Hi-Z (near 1, far 0) in the packed layout `occlusionPass.ts` builds. True
// only when the whole sphere is certainly behind the occluders:
//
// 1. the 8 corners of the sphere's box; any at or behind the eye: not occluded;
// 2. their NDC rectangle (off screen: not occluded; else clamped) and the
//    nearest depth (largest when reversed);
// 3. the level-0 pixel range, then the smallest level whose range spans at
//    most 2 × 2 texels;
// 4. the farthest (smallest) of those texels; occluded when the box's nearest
//    depth is farther (smaller) than it by more than `epsilon`.

import type { Node } from "three/webgpu";
import * as TSLTyped from "three/tsl";

// TSL's generic typings reject integer min / clamp chains; this module builds nodes untyped (as puddleReflections.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Fn, If, Loop, bool, ceil, clamp, float, floor, int, max, min, vec4 } = TSLTyped as unknown as Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

type FloatNode = Node<"float">;
type BoolNode = Node<"bool">;

export interface HiZTestInputs {
  /** The packed Hi-Z (read-only storage, floats). */
  readonly hiz: { element(index: Node<"int">): FloatNode };
  /** (width, height, offset, 0) per level. */
  readonly levels: { element(index: Node<"int">): Node<"vec4"> };
  readonly levelCount: Node<"int">;
  readonly viewProjection: Node<"mat4">;
  readonly epsilon?: number;
}

/** Whether the sphere (world centre, radius) is certainly behind the Hi-Z. */
export function sphereOccludedNode(inputs: HiZTestInputs, center: Node<"vec3">, radius: FloatNode): BoolNode {
  const r: AnyNode = radius, levelsNode: AnyNode = inputs.levels, hizNode: AnyNode = inputs.hiz, levelCount: AnyNode = inputs.levelCount, viewProjection: AnyNode = inputs.viewProjection;
  const epsilon = inputs.epsilon ?? 1e-6;
  return Fn(() => {
    const occluded = bool(false).toVar("hizOccluded");
    const minX = float(1e30).toVar(), maxX = float(-1e30).toVar(), minY = float(1e30).toVar(), maxY = float(-1e30).toVar();
    const nearest = float(-1e30).toVar();
    const behind = bool(false).toVar();
    for (let corner = 0; corner < 8; corner += 1) {
      const offset = vec4((corner & 1) === 0 ? r.negate() : r, (corner & 2) === 0 ? r.negate() : r, (corner & 4) === 0 ? r.negate() : r, 0);
      const clip = viewProjection.mul(vec4(center, 1).add(offset)).toVar();
      If(clip.w.lessThanEqual(1e-6), () => { behind.assign(true); });
      const w = max(clip.w, 1e-6);
      const ndcX = clip.x.div(w), ndcY = clip.y.div(w), depth = clip.z.div(w);
      minX.assign(min(minX, ndcX)); maxX.assign(max(maxX, ndcX));
      minY.assign(min(minY, ndcY)); maxY.assign(max(maxY, ndcY));
      nearest.assign(max(nearest, depth));
    }
    const onScreen = maxX.greaterThanEqual(-1).and(minX.lessThanEqual(1)).and(maxY.greaterThanEqual(-1)).and(minY.lessThanEqual(1));
    If(behind.not().and(onScreen), () => {
      const base = levelsNode.element(int(0));
      const width = int(base.x), height = int(base.y);
      const loX = max(minX, -1), hiX = min(maxX, 1), loY = max(minY, -1), hiY = min(maxY, 1);
      const x0 = clamp(int(floor(loX.mul(0.5).add(0.5).mul(float(width)))), int(0), width.sub(1)).toVar();
      const x1 = max(x0, min(width.sub(1), int(ceil(hiX.mul(0.5).add(0.5).mul(float(width)))).sub(1))).toVar();
      const y0 = clamp(int(floor(float(0.5).sub(hiY.mul(0.5)).mul(float(height)))), int(0), height.sub(1)).toVar();
      const y1 = max(y0, min(height.sub(1), int(ceil(float(0.5).sub(loY.mul(0.5)).mul(float(height)))).sub(1))).toVar();
      const level = int(0).toVar();
      Loop(16, () => {
        If(x1.sub(x0).greaterThan(1).or(y1.sub(y0).greaterThan(1)).and(level.lessThan(levelCount.sub(1))), () => {
          x0.assign(x0.div(2)); x1.assign(x1.div(2)); y0.assign(y0.div(2)); y1.assign(y1.div(2));
          level.addAssign(1);
        });
      });
      const at = levelsNode.element(level);
      const levelWidth = int(at.x), levelHeight = int(at.y), offset = int(at.z);
      x0.assign(min(x0, levelWidth.sub(1))); x1.assign(min(x1, levelWidth.sub(1)));
      y0.assign(min(y0, levelHeight.sub(1))); y1.assign(min(y1, levelHeight.sub(1)));
      // The selection leaves at most 2 × 2 texels (each range spans at most two, or the 1 × 1 top).
      const texel = (x: AnyNode, y: AnyNode): AnyNode => hizNode.element(offset.add(y.mul(levelWidth)).add(x));
      const farthest = texel(x0, y0).toVar();
      If(x1.greaterThan(x0), () => { farthest.assign(min(farthest, texel(x1, y0))); });
      If(y1.greaterThan(y0), () => {
        farthest.assign(min(farthest, texel(x0, y1)));
        If(x1.greaterThan(x0), () => { farthest.assign(min(farthest, texel(x1, y1))); });
      });
      occluded.assign(nearest.lessThan(farthest.sub(epsilon)));
    });
    return occluded;
  })() as BoolNode;
}
