import type { ActorId, Transform, WorldActor } from "../../core/index.ts";
import { parentWorldMatrix } from "../gizmo/dragSession.ts";
import { composeMat4, multiplyMat4, type Mat4 } from "../math/affine.ts";

export function actorMatrix(actor: WorldActor, lookup: (id: ActorId) => WorldActor | undefined): Mat4 {
  const { p, r, s } = actor.transform;
  return multiplyMat4(parentWorldMatrix(lookup, actor.parent), composeMat4(p, r, s));
}

export function componentMatrix(actor: WorldActor, key: string, matrix: Mat4): Mat4 {
  const chain: Transform[] = [];
  const seen = new Set<string>();
  let next: string | null | undefined = key;
  while (next != null && !seen.has(next)) {
    seen.add(next);
    const component: WorldActor["components"][string] | undefined = actor.components[next];
    if (component?.local) chain.unshift(component.local);
    next = component?.parent;
  }
  return chain.reduce((parent, local) => multiplyMat4(parent, composeMat4(local.p, local.r, local.s)), matrix);
}
