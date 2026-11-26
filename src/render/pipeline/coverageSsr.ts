// three's mirror SSR with a coverage alpha (plan decision 2026-11-26).
//
// three's SSRNode writes the hit's world distance to alpha (0 on a miss). Its
// half-resolution target and the roughness blur mips average hits with misses,
// so at a reflected silhouette the colour is a fraction of the hit's while the
// averaged distance still reads as a full hit: the composite then took out the
// whole environment reflection and the edge went dark. Here the SSR pass writes
// the share of the environment reflection the hit replaces instead: the hit's
// distance fade ratio² (the colour already carries it; its other factor, the
// grazing term 1 - (N.V)², is the composite's own), 0 on a miss. Blur and
// upsampling then mix colour and alpha by the same weights.

import { Fn, dot, float, getViewPosition, nodeObject, normalize, uv, vec3, vec4 } from "three/tsl";
import { PerspectiveCamera, type Matrix4, type Node, type NodeMaterial, type UniformNode } from "three/webgpu";
import SSRNode, { type SSRNodeOptions } from "three/examples/jsm/tsl/display/SSRNode.js";

/** SSRNode members three's types leave out (three 0.187.0, K5). */
interface SSRInternals {
  readonly _ssrMaterial: NodeMaterial;
  readonly _cameraProjectionMatrixInverse: UniformNode<"mat4", Matrix4>;
}

const buildSSRMaterial = (SSRNode.prototype as unknown as { _buildSSRMaterial(this: SSRNode): void })._buildSSRMaterial;

export class CoverageSSRNode extends SSRNode {
  /** Wraps the SSR pass's fragment each time three rebuilds it (setup, compile-time option changes). */
  _buildSSRMaterial(): void {
    buildSSRMaterial.call(this);
    const { _ssrMaterial: material, _cameraProjectionMatrixInverse: projectionInverse } = this as unknown as SSRInternals;
    const reflection = material.fragmentNode as Node<"vec4"> | null;
    if (!reflection) return;
    const perspective = this.camera instanceof PerspectiveCamera;
    material.fragmentNode = Fn(() => {
      const out = reflection.toVar();
      // Any in-frustum depth gives a perspective camera's view ray through the pixel.
      const incident = perspective ? normalize(getViewPosition(uv(), float(0.5), projectionInverse)) : vec3(0, 0, -1);
      const nDotV = dot(this.normalNode.rgb.normalize(), incident.negate()).clamp(0, 1);
      // The hit's height over the surface's plane: the ray length times the reflected ray's N.R (= N.V).
      const ratio = float(1).sub(out.a.mul(nDotV).div(this.maxDistance)).clamp(0, 1);
      return vec4(out.rgb, out.a.greaterThan(0).select(ratio.mul(ratio), float(0)));
    })();
    material.needsUpdate = true;
  }
}

/** `ssr()` with the coverage alpha above. */
export function coverageSsr(color: Node<"vec4">, depth: Node<"float"> | Node<"vec4">, normal: Node<"vec3">, options: SSRNodeOptions): CoverageSSRNode {
  return new CoverageSSRNode(nodeObject(color), nodeObject(depth), nodeObject(normal), options);
}
