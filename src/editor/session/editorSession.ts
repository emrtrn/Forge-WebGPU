// The editor's session (architecture §4.7, plan phase 4 step 2): the level
// being edited (core `LevelSession`, the edit model), the world the viewport
// draws (`mode: "editor"`), the selection, and the services the shell calls:
//
// - TransactionService: `edit(label, build, { coalesce })`, `undo`, `redo`.
//   Every change the session applies (edit, undo, redo) is mirrored into the
//   world: added actors, then updated ones (`World.updateActors`, so
//   subsystems and render bindings hear `actorsChanged`), then removed ones.
//   That order lets one transaction reparent children onto a new group, or
//   off a group it deletes, without the world refusing a missing parent or
//   taking children down with the group.
// - SaveService: `save()` plans and sends one save of the session (the save
//   service, 2a) and reports what happened in a few words for the status line.
// - Selection: the selected actor ids, the first is the primary; actors that
//   leave the level leave the selection.
// - Visibility (step 5a, user decision 2026-11-14): Forge's Hide / Show
//   (H, Shift+H, the Outliner's eye) is a view of the editor only: never in
//   the level, never an undo step. A hidden actor and everything under it
//   leave the world (nothing draws or picks them) and the selection; edits to
//   them still go to the level and reach the world when they are shown.
//
// No DOM here: the shell (shell/*.ts) draws it, Node tests drive it.

import {
  saveLevelSession,
  SaveClientError,
  type ActorDoc,
  type ActorId,
  type AppliedChange,
  type EditResult,
  type EditTx,
  type LevelSession,
  type SaveClient,
} from "../../core/index.ts";
import type { World } from "../../runtime/world.ts";

export interface SaveReport {
  readonly ok: boolean;
  /** Short English status text, e.g. `Saved 2 files`. */
  readonly message: string;
}

export interface EditorSession {
  readonly level: LevelSession;
  readonly world: World;
  edit(label: string, build: (tx: EditTx) => void, options?: { readonly coalesce?: string }): EditResult;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Unsaved actors. */
  dirty(): number;
  save(): Promise<SaveReport>;
  readonly selection: Selection;
  readonly visibility: Visibility;
  /** Any edit, undo, redo, save, selection or visibility change; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  dispose(): void;
}

export interface Selection {
  ids(): readonly ActorId[];
  primary(): ActorId | null;
  set(ids: readonly ActorId[]): void;
  /** Adds the actor, or takes it out when it is selected (Forge's Ctrl / Shift click). */
  toggle(id: ActorId): void;
  has(id: ActorId): boolean;
}

export interface Visibility {
  /** Hidden itself (the Outliner's eye). */
  has(id: ActorId): boolean;
  /** Hidden itself or under a hidden ancestor: out of the world. */
  hidden(id: ActorId): boolean;
  /** The actors hidden themselves, in the level. */
  ids(): ActorId[];
  set(ids: readonly ActorId[], hidden: boolean): void;
  /** Shows every hidden actor (Shift+H). */
  showAll(): void;
}

/** `docs` with every parent before its children (an undo applies changes backwards); otherwise in order. */
function parentsFirst(docs: readonly ActorDoc[]): ActorDoc[] {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const placed = new Set<ActorId>();
  const ordered: ActorDoc[] = [];
  const place = (doc: ActorDoc, depth: number): void => {
    if (placed.has(doc.id) || depth > docs.length) return;
    const parent = doc.parent === null ? undefined : byId.get(doc.parent);
    if (parent) place(parent, depth + 1);
    placed.add(doc.id);
    ordered.push(doc);
  };
  for (const doc of docs) place(doc, 0);
  return ordered;
}

/** Applies a session's changes to its world: adds (parents first), then updates, then removes. */
export function mirrorIntoWorld(world: World, changes: readonly AppliedChange[]): void {
  const added: ActorDoc[] = [];
  const updated: ActorDoc[] = [];
  const removed: ActorId[] = [];
  for (const change of changes) {
    if (change.after === null) removed.push(change.id);
    else if (change.before === null) added.push(change.after);
    else updated.push(change.after);
  }
  if (added.length > 0) world.addActors(parentsFirst(added), "level");
  if (updated.length > 0) world.updateActors(updated);
  if (removed.length > 0) world.removeActors(removed);
}

export interface EditorSessionOptions {
  readonly level: LevelSession;
  /** The world the level was assembled into; hidden actors leave it. */
  readonly world: World;
  readonly client: SaveClient;
  /** Actors hidden when the editor opens (the page remembers them per level). */
  readonly hidden?: readonly ActorId[];
}

export function createEditorSession(options: EditorSessionOptions): EditorSession {
  const { level, world, client } = options;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };
  let selected: ActorId[] = [];

  const hiddenSet = new Set<ActorId>((options.hidden ?? []).filter((id) => level.actor(id) !== undefined));
  const isHidden = (id: ActorId): boolean => {
    if (hiddenSet.size === 0) return false;
    const seen = new Set<ActorId>();
    for (let at: ActorId | null = id; at !== null && !seen.has(at); at = level.actor(at)?.parent ?? null) {
      if (hiddenSet.has(at)) return true;
      seen.add(at);
    }
    return false;
  };
  /** Each actor's children, from the level as it is now. */
  const childrenIndex = (): Map<ActorId, ActorId[]> => {
    const children = new Map<ActorId, ActorId[]>();
    for (const actor of level.level.actors) {
      if (actor.parent === null) continue;
      const list = children.get(actor.parent);
      if (list) list.push(actor.id);
      else children.set(actor.parent, [actor.id]);
    }
    return children;
  };
  /** Brings the world in line with the level for these actors and their descendants: visible ones in (`changed` ones updated), hidden ones out. */
  const syncWorld = (ids: Iterable<ActorId>, changed: ReadonlySet<ActorId>): void => {
    const children = childrenIndex();
    const affected = new Set<ActorId>();
    const stack = [...ids];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (affected.has(id)) continue;
      affected.add(id);
      stack.push(...(children.get(id) ?? []));
    }
    const added: ActorDoc[] = [];
    const updated: ActorDoc[] = [];
    const removed: ActorId[] = [];
    for (const id of affected) {
      const doc = level.actor(id);
      const inWorld = world.context.actor(id) !== undefined;
      const wanted = doc !== undefined && !isHidden(id);
      if (wanted && !inWorld) added.push(doc);
      else if (wanted && changed.has(id)) updated.push(doc);
      else if (!wanted && inWorld) removed.push(id);
    }
    if (added.length > 0) world.addActors(parentsFirst(added), "level");
    if (updated.length > 0) world.updateActors(updated);
    if (removed.length > 0) world.removeActors(removed);
  };
  if (hiddenSet.size > 0) world.removeActors([...hiddenSet]);

  const selection: Selection = {
    ids: () => selected,
    primary: () => selected[0] ?? null,
    has: (id) => selected.includes(id),
    set(ids) {
      const next = [...new Set(ids)].filter((id) => level.actor(id) !== undefined);
      if (next.length === selected.length && next.every((id, index) => id === selected[index])) return;
      selected = next;
      notify();
    },
    toggle(id) {
      selection.set(selected.includes(id) ? selected.filter((one) => one !== id) : [...selected, id]);
    },
  };

  const visibility: Visibility = {
    has: (id) => hiddenSet.has(id),
    hidden: isHidden,
    ids: () => [...hiddenSet].filter((id) => level.actor(id) !== undefined),
    set(ids, hidden) {
      const touched = ids.filter((id) => level.actor(id) !== undefined && hiddenSet.has(id) !== hidden);
      if (touched.length === 0) return;
      for (const id of touched) {
        if (hidden) hiddenSet.add(id);
        else hiddenSet.delete(id);
      }
      syncWorld(touched, new Set());
      selected = selected.filter((id) => !isHidden(id));
      notify();
    },
    showAll() {
      visibility.set([...hiddenSet], false);
    },
  };

  const stop = level.onApplied((changes) => {
    if (hiddenSet.size === 0) mirrorIntoWorld(world, changes);
    else syncWorld(changes.map((change) => change.id), new Set(changes.filter((change) => change.after !== null).map((change) => change.id)));
    selected = selected.filter((id) => level.actor(id) !== undefined);
    notify();
  });

  let saving = false;

  return {
    level,
    world,
    selection,
    visibility,
    edit: (label, build, editOptions) => level.edit(label, build, editOptions),
    undo: () => level.undo(),
    redo: () => level.redo(),
    canUndo: () => level.history.undoStack.length > 0,
    canRedo: () => level.history.redoStack.length > 0,
    dirty: () => level.dirtyActors().length,
    async save() {
      if (saving) return { ok: false, message: "A save is already running" };
      saving = true;
      try {
        const outcome = await saveLevelSession(level, client);
        if (outcome.status === "clean") return { ok: true, message: "Nothing to save" };
        if (outcome.status === "needs-load") return { ok: false, message: `Load cells ${outcome.cells.join(", ")} before saving` };
        const response = outcome.response;
        if (response.status === "saved") {
          const files = response.files.length;
          return { ok: true, message: `Saved ${files} file${files === 1 ? "" : "s"}` };
        }
        if (response.status === "conflict") return { ok: false, message: "Files changed on disk; reload before saving" };
        const issues = (response.issues ?? []).map((issue) => `${issue.file} ${issue.path}: ${issue.message}`);
        return { ok: false, message: `Save refused: ${[response.message ?? response.reason, ...issues].join("; ")}` };
      } catch (error) {
        const message = error instanceof SaveClientError ? error.message : error instanceof Error ? error.message : String(error);
        return { ok: false, message: `Save failed: ${message}` };
      } finally {
        saving = false;
        notify();
      }
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      stop();
      listeners.clear();
    },
  };
}
