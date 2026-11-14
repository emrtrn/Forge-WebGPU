// Parenting actors in the editor (INV-A08, plan phase 4 step 5; Forge WebGL
// editor/scene/EditorSceneController.ts `parentObjectsTo` /
// `parentSelectionToActive` / `unparentSelected` @ forge-webgl-final).
// Three-free and DOM-free: the documents in, the edited documents out; the
// caller makes them one transaction.
//
// - An actor keeps its place in the world: its transform is re-expressed in
//   the new parent's space (a parent with a non-uniform scale and a turned
//   child cannot be matched exactly; the decomposition is three's).
// - Only the roots of the given actors move: a selected child follows its
//   selected parent. An actor cannot go under itself or its own descendant
//   (Forge's cycle guard); those are skipped and reported.

import type { ActorDoc, ActorId, Transform } from "../../core/index.ts";
import { dragRoots, parentWorldMatrix } from "../../engine/gizmo/dragSession.ts";
import { composeMat4, decomposeMat4, invertMat4, multiplyMat4, type Mat4 } from "../../engine/math/affine.ts";

export type ActorLookup = (id: ActorId) => ActorDoc | undefined;

/** An actor's world matrix. */
export function worldMatrixOf(lookup: ActorLookup, doc: ActorDoc): Mat4 {
  return multiplyMat4(parentWorldMatrix(lookup, doc.parent), composeMat4(doc.transform.p, doc.transform.r, doc.transform.s));
}

/** True when `ancestor` is `id` or one of its ancestors. */
export function isSelfOrAncestor(lookup: ActorLookup, ancestor: ActorId, id: ActorId): boolean {
  const seen = new Set<ActorId>();
  for (let at: ActorId | null = id; at !== null && !seen.has(at); at = lookup(at)?.parent ?? null) {
    if (at === ancestor) return true;
    seen.add(at);
  }
  return false;
}

/** Rounds float noise off a composed value (0.30000000000000004 -> 0.3) so saved files stay readable. */
const tidy = (value: number): number => (Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12)));

/** `world` (a world matrix) in the space of `parent`; null when the parent's matrix cannot be inverted (a zero scale). */
export function transformUnder(lookup: ActorLookup, world: Mat4, parent: ActorId | null): Transform | null {
  const inverse = invertMat4(parentWorldMatrix(lookup, parent));
  if (!inverse) return null;
  const parts = decomposeMat4(multiplyMat4(inverse, world));
  return {
    p: parts.p.map(tidy) as Transform["p"],
    r: parts.r.map(tidy) as Transform["r"],
    s: parts.s.map(tidy) as Transform["s"],
  };
}

export interface ReparentResult {
  /** The edited documents (only actors whose parent changes). */
  readonly docs: ActorDoc[];
  /** Actors left where they were: the new parent is the actor itself or below it. */
  readonly refused: ActorId[];
}

/** Puts the roots of `ids` under `parent` (null: the level root), keeping each one's world placement. */
export function reparentActors(lookup: ActorLookup, ids: readonly ActorId[], parent: ActorId | null): ReparentResult {
  const docs: ActorDoc[] = [];
  const refused: ActorId[] = [];
  for (const id of dragRoots(ids, (one) => lookup(one)?.parent)) {
    const doc = lookup(id);
    if (!doc || doc.parent === parent) continue;
    if (parent !== null && isSelfOrAncestor(lookup, id, parent)) {
      refused.push(id);
      continue;
    }
    const transform = transformUnder(lookup, worldMatrixOf(lookup, doc), parent);
    if (!transform) {
      refused.push(id);
      continue;
    }
    docs.push({ ...doc, parent, transform });
  }
  return { docs, refused };
}
