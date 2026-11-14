// The editor's edit operations on actors (INV-A08, plan phase 4 step 5c;
// Forge WebGL editor/scene/EditorSceneController.ts `duplicateSelected`,
// `groupSelected`, `ungroupSelected`, `parentSelectionToActive`,
// `unparentSelected` and the delete @ forge-webgl-final). Three-free and
// DOM-free: documents in, documents out; editCommands.ts makes each one
// transaction.
//
// - Duplicate copies the selection's roots with everything under them: new
//   GUIDs (A1), the copies' links remapped, a root keeps its parent and its
//   place (Forge: in place), its name made unique (Forge's `Name 2`). An actor
//   carrying a singleton component is never duplicated (Forge).
// - Delete takes the roots with everything under them (a child never stays
//   behind without its parent, the session's rule).
// - Copy writes the roots and their subtrees as `forge.actors/1` JSON (user
//   decision 2026-11-14): roots at the level root in world space, so a paste
//   lands in the same place in any level. Paste gives new GUIDs.
// - Group (phase 4 decision 10): a new component-less actor at the roots'
//   centre under their common parent (else the level root); the roots move
//   under it keeping their world placement. Ungroup moves a group's children
//   to the group's parent the same way and removes the group. A group is a
//   plain actor without components that has children.
// - A viewport click on something inside a group selects the outermost group
//   (Forge selected a group's members together).

import { createId, parseComponentTypeTag, type ActorDoc, type ActorId, type ClassResolver, type SchemaRegistry, type Vec3 } from "../../core/index.ts";
import { dragRoots } from "../../engine/gizmo/dragSession.ts";
import { composeMat4, transformPoint } from "../../engine/math/affine.ts";
import { reparentActors, transformUnder, worldMatrixOf, type ActorLookup } from "./hierarchy.ts";

export const CLIPBOARD_SCHEMA = "forge.actors/1";

export interface OpsContext {
  readonly lookup: ActorLookup;
  /** The level's actors, in order. */
  readonly actors: () => readonly ActorDoc[];
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  /** A new actor GUID (tests pass a counter). */
  readonly newId?: () => ActorId;
}

const freshId = (context: OpsContext): ActorId => context.newId?.() ?? createId("actor");

/** Each actor's children, in level order. */
export function childrenIndex(actors: readonly ActorDoc[]): Map<ActorId, ActorId[]> {
  const children = new Map<ActorId, ActorId[]>();
  for (const actor of actors) {
    if (actor.parent === null) continue;
    const list = children.get(actor.parent);
    if (list) list.push(actor.id);
    else children.set(actor.parent, [actor.id]);
  }
  return children;
}

/** The ids with everything under them, in level order. */
export function withDescendants(actors: readonly ActorDoc[], ids: readonly ActorId[]): ActorDoc[] {
  const children = childrenIndex(actors);
  const chosen = new Set<ActorId>();
  const stack = [...ids];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (chosen.has(id)) continue;
    chosen.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return actors.filter((actor) => chosen.has(actor.id));
}

/** A plain actor without components that has children (phase 4 decision 10). */
export function isGroup(doc: ActorDoc, hasChildren: boolean): boolean {
  return hasChildren && doc.class === null && Object.keys(doc.components).length === 0;
}

/** What a viewport click on `id` selects: the outermost group around it, else itself. */
export function selectTarget(context: OpsContext, id: ActorId): ActorId {
  const parents = new Set<ActorId>();
  for (const actor of context.actors()) if (actor.parent !== null) parents.add(actor.parent);
  let target = id;
  const seen = new Set<ActorId>();
  for (let at = context.lookup(id)?.parent ?? null; at !== null && !seen.has(at); at = context.lookup(at)?.parent ?? null) {
    seen.add(at);
    const doc = context.lookup(at);
    if (doc && isGroup(doc, parents.has(at))) target = at;
  }
  return target;
}

/** The singleton component an actor carries (class or own), if any. */
export function singletonOf(context: OpsContext, doc: ActorDoc): string | null {
  const components = doc.class === null ? doc.components : (context.resolveClass(doc.class)?.components ?? {});
  for (const component of Object.values(components)) {
    const name = parseComponentTypeTag(component.type)?.name;
    const def = name === undefined ? undefined : context.registry.getComponent(name);
    if (def?.singleton) return def.label;
  }
  return null;
}

/** `name`, or `name N` with the first N from 2 that no other actor has; a trailing number of `name` is the base's (`Cube 2` -> `Cube 3`). */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const base = name.replace(/ \d+$/, "");
  for (let n = 2; ; n += 1) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

export interface CopyResult {
  /** The new documents, parents first. */
  readonly docs: ActorDoc[];
  /** The copies of the roots (what to select). */
  readonly roots: ActorId[];
  /** Roots left out: they carry a singleton (one per level). */
  readonly refused: ActorId[];
}

/** New GUIDs for a set of documents (roots first in their subtrees); links inside the set follow, a root's parent is `rootParent(root)`. */
function copyDocs(context: OpsContext, docs: readonly ActorDoc[], rootIds: ReadonlySet<ActorId>, rootParent: (root: ActorDoc) => ActorId | null): { docs: ActorDoc[]; roots: ActorId[] } {
  const ids = new Map<ActorId, ActorId>(docs.map((doc) => [doc.id, freshId(context)]));
  const taken = new Set(context.actors().map((actor) => actor.name));
  const out: ActorDoc[] = [];
  const roots: ActorId[] = [];
  for (const doc of docs) {
    const copy = structuredClone(doc);
    copy.id = ids.get(doc.id)!;
    if (rootIds.has(doc.id)) {
      copy.parent = rootParent(doc);
      copy.name = uniqueName(doc.name, taken);
      taken.add(copy.name);
      roots.push(copy.id);
    } else {
      copy.parent = doc.parent === null ? null : (ids.get(doc.parent) ?? null);
    }
    out.push(copy);
  }
  return { docs: out, roots };
}

/** Duplicates the roots of `ids` with their subtrees, in place (Forge). */
export function duplicateActors(context: OpsContext, ids: readonly ActorId[]): CopyResult {
  const refused: ActorId[] = [];
  const roots = dragRoots(ids, (id) => context.lookup(id)?.parent).filter((id) => {
    const subtree = withDescendants(context.actors(), [id]);
    if (subtree.some((doc) => singletonOf(context, doc) !== null)) {
      refused.push(id);
      return false;
    }
    return context.lookup(id) !== undefined;
  });
  const docs = withDescendants(context.actors(), roots);
  const copied = copyDocs(context, docs, new Set(roots), (root) => root.parent);
  return { ...copied, refused };
}

/** The roots of `ids` with everything under them: what a delete removes. */
export function deletionOf(context: OpsContext, ids: readonly ActorId[]): ActorId[] {
  return withDescendants(context.actors(), ids.filter((id) => context.lookup(id) !== undefined)).map((doc) => doc.id);
}

/** The clipboard text of the roots of `ids` and their subtrees: roots at the level root, in world space. */
export function copyText(context: OpsContext, ids: readonly ActorId[]): { text: string; count: number } | null {
  const roots = dragRoots(ids, (id) => context.lookup(id)?.parent).filter((id) => context.lookup(id) !== undefined);
  if (roots.length === 0) return null;
  const rootSet = new Set(roots);
  const actors = withDescendants(context.actors(), roots).map((doc) => {
    if (!rootSet.has(doc.id)) return doc;
    const world = transformUnder(context.lookup, worldMatrixOf(context.lookup, doc), null);
    return { ...doc, parent: null, transform: world ?? doc.transform };
  });
  return { text: JSON.stringify({ schema: CLIPBOARD_SCHEMA, actors }), count: roots.length };
}

/** The documents of a clipboard text; null when it is not `forge.actors/1`. Each is normalised again by the edit that adds it. */
export function readClipboard(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text) as { schema?: unknown; actors?: unknown };
    return parsed.schema === CLIPBOARD_SCHEMA && Array.isArray(parsed.actors) ? parsed.actors : null;
  } catch {
    return null;
  }
}

/** Pasted documents with new GUIDs; roots at the level root. Malformed entries are left out; singletons are refused. */
export function pasteActors(context: OpsContext, raw: readonly unknown[]): CopyResult {
  const docs = raw.filter((entry): entry is ActorDoc => typeof entry === "object" && entry !== null && typeof (entry as ActorDoc).id === "string");
  const ids = new Set(docs.map((doc) => doc.id));
  const refused: ActorId[] = [];
  const blocked = new Set<ActorId>();
  for (const doc of docs) {
    if (singletonOf(context, doc) === null) continue;
    refused.push(doc.id);
    for (const one of withDescendants(docs, [doc.id])) blocked.add(one.id);
  }
  const kept = docs.filter((doc) => !blocked.has(doc.id));
  const roots = new Set(kept.filter((doc) => doc.parent === null || !ids.has(doc.parent)).map((doc) => doc.id));
  return { ...copyDocs(context, kept, roots, () => null), refused };
}

export interface GroupResult {
  readonly group: ActorDoc;
  /** The group first, then its new children. */
  readonly docs: ActorDoc[];
}

/** Groups the roots of `ids` (at least two) under a new empty actor at their centre; null when fewer than two. */
export function groupActors(context: OpsContext, ids: readonly ActorId[], name = "Group"): GroupResult | null {
  const roots = dragRoots(ids, (id) => context.lookup(id)?.parent)
    .map((id) => context.lookup(id))
    .filter((doc): doc is ActorDoc => doc !== undefined);
  if (roots.length < 2) return null;
  const parent = roots.every((doc) => doc.parent === roots[0]!.parent) ? roots[0]!.parent : null;
  const centre: Vec3 = [0, 0, 0];
  for (const doc of roots) {
    const at = transformPoint(worldMatrixOf(context.lookup, doc), [0, 0, 0]);
    for (let axis = 0; axis < 3; axis += 1) centre[axis]! += at[axis]! / roots.length;
  }
  const transform = transformUnder(context.lookup, composeMat4(centre, [0, 0, 0, 1], [1, 1, 1]), parent);
  if (!transform) return null;
  const group: ActorDoc = {
    id: freshId(context),
    name: uniqueName(name, new Set(context.actors().map((actor) => actor.name))),
    class: null,
    parent,
    spatiallyLoaded: roots.every((doc) => doc.spatiallyLoaded),
    transform,
    components: {},
  };
  const lookup: ActorLookup = (id) => (id === group.id ? group : context.lookup(id));
  const moved = reparentActors(lookup, roots.map((doc) => doc.id), group.id);
  return { group, docs: [group, ...moved.docs] };
}

export interface UngroupResult {
  /** The groups' children, moved up. */
  readonly docs: ActorDoc[];
  /** The groups to remove. */
  readonly removed: ActorId[];
}

/** The groups among `ids` (or around a selected member) dissolved: children to the group's parent, groups removed; null when none. */
export function ungroupActors(context: OpsContext, ids: readonly ActorId[]): UngroupResult | null {
  const children = childrenIndex(context.actors());
  const groups = new Set<ActorId>();
  for (const id of ids) {
    const doc = context.lookup(id);
    if (!doc) continue;
    if (isGroup(doc, children.has(id))) groups.add(id);
    else if (doc.parent !== null) {
      const parent = context.lookup(doc.parent);
      if (parent && isGroup(parent, true)) groups.add(parent.id);
    }
  }
  if (groups.size === 0) return null;
  // A group inside another dissolved group hands its children to the first kept ancestor.
  const keptParent = (id: ActorId | null): ActorId | null => {
    let at = id;
    while (at !== null && groups.has(at)) at = context.lookup(at)?.parent ?? null;
    return at;
  };
  const docs: ActorDoc[] = [];
  for (const group of groups) {
    const kids = (children.get(group) ?? []).filter((id) => !groups.has(id));
    const target = keptParent(context.lookup(group)!.parent);
    docs.push(...reparentActors(context.lookup, kids, target).docs);
  }
  return { docs, removed: [...groups] };
}
