// World matrices of actors and their spatial components (architecture §4.4).
// An actor's transform is relative to its parent actor (the level root when
// it has none); a spatial component's `local` is relative to its `parent`
// component in the same actor (the actor root when null).

import { Matrix4, Quaternion, Vector3 } from "three/webgpu";
import type { ComponentRecord, Transform, WorldActor } from "../../core/index.ts";
import type { RenderWorldView } from "./renderBinding.ts";

const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();

export function composeTransform(transform: Readonly<Transform>, out: Matrix4 = new Matrix4()): Matrix4 {
  position.fromArray(transform.p);
  rotation.fromArray(transform.r);
  scale.fromArray(transform.s);
  return out.compose(position, rotation, scale);
}

export function actorWorldMatrix(world: Pick<RenderWorldView, "actor">, actor: WorldActor, out: Matrix4 = new Matrix4()): Matrix4 {
  composeTransform(actor.transform, out);
  const local = new Matrix4();
  const seen = new Set([actor.id]);
  let parent = actor.parent === null ? undefined : world.actor(actor.parent);
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    out.premultiply(composeTransform(parent.transform, local));
    parent = parent.parent === null ? undefined : world.actor(parent.parent);
  }
  return out;
}

/** The world matrix of the component under `key`: the actor's, then each `local` from the root down. */
export function componentWorldMatrix(
  world: Pick<RenderWorldView, "actor">,
  actor: WorldActor,
  key: string,
  out: Matrix4 = new Matrix4(),
): Matrix4 {
  const chain: ComponentRecord[] = [];
  const seen = new Set<string>();
  let current: string | null | undefined = key;
  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    const component: ComponentRecord | undefined = actor.components[current];
    if (!component) break;
    chain.push(component);
    current = component.parent;
  }
  actorWorldMatrix(world, actor, out);
  const local = new Matrix4();
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const transform = chain[index]!.local;
    if (transform) out.multiply(composeTransform(transform, local));
  }
  return out;
}
