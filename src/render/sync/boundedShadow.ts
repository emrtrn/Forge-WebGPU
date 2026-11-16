// r187 ShadowNode tests XY in [0,1] but only Z <= 1. With reversed depth,
// receivers past the shadow camera's far plane have Z < 0: comparison against
// even an empty map shadows its entire footprint (Island from a high camera).
// Keep three's filtering and XY/upper-Z checks, adding the missing lower Z.
// This is the follow directional map; CSM still owns its cascade nodes.
import { ShadowNode, type DirectionalLight, type Node, type NodeBuilder } from "three/webgpu";
import { float, vec3 } from "three/tsl";

interface ShadowFilterInput {
  readonly shadowCoord: ReturnType<typeof vec3>;
}

// r187's runtime exposes this hook; @types/three only declares the constructor.
const filter = (ShadowNode.prototype as unknown as {
  setupShadowFilter(builder: NodeBuilder, input: ShadowFilterInput): Node;
}).setupShadowFilter;

export class BoundedShadowNode extends ShadowNode {
  setupShadowFilter(builder: NodeBuilder, input: ShadowFilterInput): Node {
    const sampled = filter.call(this, builder, input);
    return input.shadowCoord.z.greaterThanEqual(0).select(sampled, float(1));
  }
}

/** Attach once per follow light; camera movement updates matrices, never the graph. */
export function useBoundedFollowShadow(light: DirectionalLight): void {
  const shadow = light.shadow as typeof light.shadow & { shadowNode?: unknown };
  if (!(shadow.shadowNode instanceof BoundedShadowNode)) shadow.shadowNode = new BoundedShadowNode(light, light.shadow);
}

/** A sun switching to CSM releases its previous follow map before replacing it. */
export function releaseBoundedFollowShadow(light: DirectionalLight): void {
  const shadow = light.shadow as typeof light.shadow & { shadowNode?: unknown };
  if (!(shadow.shadowNode instanceof BoundedShadowNode)) return;
  shadow.shadowNode.dispose();
  delete shadow.shadowNode;
}
