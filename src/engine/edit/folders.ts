// Outliner folder edits (user decision 2026-11-25; core/level/actorFolder.ts):
// documents in, the edited documents out; the caller makes them one
// transaction. Only root actors are in folders: a child put into one leaves
// its parent, keeping its place in the world. A folder's subfolders move with
// it because a folder is only the path its actors carry.

import { isInFolder, rebaseFolder, type ActorDoc, type ActorId } from "../../core/index.ts";
import { dragRoots } from "../gizmo/dragSession.ts";
import { reparentActors, type ActorLookup } from "./hierarchy.ts";

/** The document in `folder`; "" is the level root (no field). */
export function withFolder(doc: ActorDoc, folder: string): ActorDoc {
  if ((doc.folder ?? "") === folder) return doc;
  const next = { ...doc };
  if (folder === "") delete next.folder;
  else next.folder = folder;
  return next;
}

/** The roots of `ids` in `folder`; only the documents that change. */
export function moveToFolder(lookup: ActorLookup, ids: readonly ActorId[], folder: string): ActorDoc[] {
  const roots = dragRoots(ids, (id) => lookup(id)?.parent);
  const detached = new Map(reparentActors(lookup, roots, null).docs.map((doc) => [doc.id, doc]));
  return roots.flatMap((id) => {
    const doc = lookup(id);
    if (!doc) return [];
    const next = withFolder(detached.get(id) ?? doc, folder);
    return next === doc ? [] : [next];
  });
}

/** Every actor of folder `from` (subfolders too) with `to` in its place; `to` is "" to move them to the root. */
export function rebaseFolderActors(actors: readonly ActorDoc[], from: string, to: string): ActorDoc[] {
  return actors.flatMap((doc) => {
    if (doc.folder === undefined || !isInFolder(doc.folder, from)) return [];
    const next = withFolder(doc, rebaseFolder(doc.folder, from, to));
    return next === doc ? [] : [next];
  });
}
