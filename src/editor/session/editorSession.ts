// The editor's session (architecture §4.7, plan phase 4 step 2): the level
// being edited (core `LevelSession`, the edit model), the world the viewport
// draws (`mode: "editor"`), the selection, and the services the shell calls:
//
// - TransactionService: `edit(label, build, { coalesce })`, `undo`, `redo`.
//   Steps outside the level (a terrain stroke, plan 5d step 2) join the same
//   history with `pushStep`: one undo order across both. Each remembers the
//   level step it came after (by identity), so undo takes the level's newer
//   steps first; a new step of either kind drops both redo stacks.
//   Every change the session applies (edit, undo, redo) is mirrored into the
//   world: added actors, then updated ones (`World.updateActors`, so
//   subsystems and render bindings hear `actorsChanged`), then removed ones.
//   That order lets one transaction reparent children onto a new group, or
//   off a group it deletes, without the world refusing a missing parent or
//   taking children down with the group.
// - SaveService: `save()` plans and sends one save of the session (the save
//   service, 2a) and reports what happened in a few words for the status line.
//   A 409 (step 8) is reported as a conflict: `readDisk()` reads the level as
//   it is on disk now and `rebase(disk, how)` takes it (Reload drops this
//   session's changes, merge keeps them over the disk's; conflictUi.ts asks).
//   The world follows the changed actors; the undo history is cleared.
//   Participants (the terrain's edit sessions, 5d) save after the level in
//   the same Save and count in `dirty()`.
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
  readLevelFromServer,
  assignCells,
  saveLevelSession,
  SaveClientError,
  LevelSettingsKey,
  type CellAssignOptions,
  type ReadLevel,
  type RebaseMode,
  type ActorDoc,
  type ActorId,
  type AppliedChange,
  type EditResult,
  type EditTx,
  type LevelSession,
  type SaveClient,
  type Transaction,
} from "../../core/index.ts";
import type { World } from "../../runtime/world.ts";
import type { EditorCellStreaming } from "./cellStreaming.ts";

export interface SaveReport {
  readonly ok: boolean;
  /** Short English status text, e.g. `Saved 2 files`. */
  readonly message: string;
  /** The files changed on disk since they were read (a 409): compare or reload. */
  readonly conflict?: true;
}

/** An undo step outside the level: applying it again and taking it back. */
export interface SessionStep {
  readonly label: string;
  undo(): void;
  redo(): void;
}

/** Something saved with the level that is not in it (a terrain's tiles). */
export interface SessionParticipant {
  /** Unsaved items (tiles, documents). */
  dirty(): number;
  /** Writes what is unsaved; `files` is how many were written. */
  save(): Promise<{ readonly ok: boolean; readonly message: string; readonly files: number; readonly conflict?: true }>;
}

export interface EditorSession {
  /** Attached by the editor host after the session opens. */
  streaming?: EditorCellStreaming;
  readonly level: LevelSession;
  readonly world: World;
  edit(label: string, build: (tx: EditTx) => void, options?: { readonly coalesce?: string }): EditResult;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Records a step already applied outside the level (one undo step); the history's redo is dropped. */
  pushStep(step: SessionStep): void;
  /** Saves with the level from now on; returns the removal. */
  addParticipant(participant: SessionParticipant): () => void;
  /** Unsaved actors, plus one for unsaved level settings, plus the participants' unsaved items. */
  dirty(): number;
  save(): Promise<SaveReport>;
  /** Resolves when no save is running (a file event waits for the save that wrote it, step 9f). */
  idle(): Promise<void>;
  /** The level as it is on disk now, every cell (to compare with, or rebase onto). */
  readDisk(): Promise<ReadLevel>;
  /** Takes the level on disk (Reload or merge); the world, the selection and the toolbar follow. */
  rebase(disk: ReadLevel, how: RebaseMode): EditResult;
  readonly selection: Selection;
  readonly visibility: Visibility;
  /** Any edit, undo, redo, save, selection or visibility change; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /**
   * Takes these actors (with what is under them) out of the world and puts
   * them back, so their bindings read their resources again (a reimported
   * model, step 6e). The level and the undo history do not change.
   */
  reload(ids: readonly ActorId[]): void;
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
  /** Successful saved/clean completion; authoring jobs may check the saved scene. */
  readonly onSaved?: () => void;
  readonly level: LevelSession;
  /** The world the level was assembled into; hidden actors leave it. */
  readonly world: World;
  readonly client: SaveClient;
  /** How the level's files are read (`readDisk`): the registry and the class resolver. */
  readonly read: CellAssignOptions;
  /** Actors hidden when the editor opens (the page remembers them per level). */
  readonly hidden?: readonly ActorId[];
}

export function createEditorSession(options: EditorSessionOptions): EditorSession {
  const { level, world, client } = options;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    world.services.require(LevelSettingsKey).current = structuredClone(level.level.settings);
    for (const listener of [...listeners]) listener();
  };
  let selected: ActorId[] = [];
  world.services.require(LevelSettingsKey).current = structuredClone(level.level.settings);

  const hiddenSet = new Set<ActorId>(options.hidden ?? []);
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
    ids: () => [...hiddenSet],
    set(ids, hidden) {
      const touched = ids.filter((id) => (!hidden || level.actor(id) !== undefined) && hiddenSet.has(id) !== hidden);
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
  let saved: Promise<void> = Promise.resolve();
  const participants = new Set<SessionParticipant>();
  /** Steps outside the level, each with the level step it came after (undo) / the level redo step it was undone over (redo). */
  const outside: { readonly step: SessionStep; readonly after: Transaction | undefined }[] = [];
  const outsideRedo: { readonly step: SessionStep; readonly over: Transaction | undefined }[] = [];
  const levelUndo = (): Transaction | undefined => level.history.undoStack.at(-1);
  const levelRedo = (): Transaction | undefined => level.history.redoStack.at(-1);

  /** Saves the participants after the level; a level that did not save leaves them alone. */
  const saveParticipants = async (level: SaveReport, levelFiles: number): Promise<SaveReport> => {
    if (!level.ok || participants.size === 0) return level;
    let files = levelFiles;
    const failures: SaveReport[] = [];
    for (const participant of [...participants]) {
      if (participant.dirty() === 0) continue;
      const report = await participant.save();
      files += report.files;
      if (!report.ok) failures.push({ ok: false, message: report.message, ...(report.conflict ? { conflict: true as const } : {}) });
    }
    if (failures.length > 0) return failures[0]!;
    if (files === levelFiles) return level;
    options.onSaved?.();
    return { ok: true, message: `Saved ${files} file${files === 1 ? "" : "s"}` };
  };

  return {
    level,
    world,
    selection,
    visibility,
    reload(ids) {
      const wanted = new Set(ids), children = childrenIndex();
      for (const id of wanted) for (const child of children.get(id) ?? []) wanted.add(child);
      const there = [...wanted].filter((id) => world.context.actor(id) !== undefined);
      const set = new Set(there);
      // A child of another one here goes out with it.
      const roots = there.filter((id) => {
        for (let at = level.actor(id)?.parent ?? null; at !== null; at = level.actor(at)?.parent ?? null) if (set.has(at)) return false;
        return true;
      });
      if (roots.length > 0) world.removeActors(roots);
      syncWorld(there, new Set());
      notify();
    },
    edit: (label, build, editOptions) => {
      const result = level.edit(label, build, editOptions);
      // A new level step drops the redo of steps outside the level too.
      if (level.history.redoStack.length === 0 && outsideRedo.length > 0) {
        outsideRedo.length = 0;
        notify();
      }
      return result;
    },
    undo: () => {
      const top = outside.at(-1);
      if (top && (levelUndo() === undefined || levelUndo() === top.after)) {
        outside.pop();
        top.step.undo();
        outsideRedo.push({ step: top.step, over: levelRedo() });
        notify();
        return true;
      }
      return level.undo();
    },
    redo: () => {
      const top = outsideRedo.at(-1);
      if (top && levelRedo() === top.over) {
        outsideRedo.pop();
        top.step.redo();
        outside.push({ step: top.step, after: levelUndo() });
        notify();
        return true;
      }
      return level.redo();
    },
    canUndo: () => outside.length > 0 || level.history.undoStack.length > 0,
    canRedo: () => outsideRedo.length > 0 || level.history.redoStack.length > 0,
    pushStep(step) {
      // The level's next edit starts its own step, and its redo no longer follows.
      level.history.clearRedo();
      outsideRedo.length = 0;
      outside.push({ step, after: levelUndo() });
      notify();
    },
    addParticipant(participant) {
      participants.add(participant);
      return () => void participants.delete(participant);
    },
    dirty: () => level.dirtyActors().length + (level.settingsDirty() ? 1 : 0) + [...participants].reduce((sum, participant) => sum + participant.dirty(), 0),
    async save() {
      if (saving) return { ok: false, message: "A save is already running" };
      saving = true;
      let done!: () => void;
      saved = new Promise<void>((resolve) => (done = resolve));
      try {
        const outcome = await saveLevelSession(level, client);
        if (outcome.status === "clean") {
          const report = await saveParticipants({ ok: true, message: "Nothing to save" }, 0);
          if (report.message === "Nothing to save") options.onSaved?.();
          return report;
        }
        if (outcome.status === "needs-load") return { ok: false, message: `Load cells ${outcome.cells.join(", ")} before saving` };
        const response = outcome.response;
        if (response.status === "saved") {
          const files = response.files.length;
          if (participants.size === 0) {
            options.onSaved?.();
            return { ok: true, message: `Saved ${files} file${files === 1 ? "" : "s"}` };
          }
          return await saveParticipants({ ok: true, message: `Saved ${files} file${files === 1 ? "" : "s"}` }, files);
        }
        if (response.status === "conflict") {
          const files = response.conflicts.map((conflict) => conflict.path.slice(conflict.path.lastIndexOf("/") + 1));
          return { ok: false, conflict: true, message: `Changed on disk since it was read (${files.join(", ")}): compare or reload` };
        }
        const issues = (response.issues ?? []).map((issue) => `${issue.file} ${issue.path}: ${issue.message}`);
        return { ok: false, message: `Save refused: ${[response.message ?? response.reason, ...issues].join("; ")}` };
      } catch (error) {
        const message = error instanceof SaveClientError ? error.message : error instanceof Error ? error.message : String(error);
        return { ok: false, message: `Save failed: ${message}` };
      } finally {
        saving = false;
        done();
        notify();
      }
    },
    idle: () => saved,
    // Compare / Reload reads only the parts held by this partial session.
    readDisk: () => {
      // An agent may have partitioned legacy actors out of level.json. Those
      // actors are still held here: include their source/destination cells.
      const held = new Set<string | null>();
      for (const actors of [level.level.actors, level.level.actors.map((actor) => level.baseActor(actor.id) ?? actor)]) {
        for (const cell of assignCells(actors, level.level.settings, options.read).value.values()) held.add(cell);
      }
      return readLevelFromServer(client, level.folder, options.read, (keys) => keys.filter((key) => level.isLoaded(key) || held.has(key)));
    },
    rebase(disk, how) {
      const result = level.rebase(disk.open, how);
      notify();
      return result;
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
