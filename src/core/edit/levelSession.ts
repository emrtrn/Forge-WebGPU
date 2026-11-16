// Editing one level (architecture §4.4, §4.6; decisions A11, save service 1H).
//
// A session holds the level as far as it is loaded: the persistent layer plus
// the cells read so far, which file each actor was read from, and the
// revision of every loaded file (the base a save sends). Edits go through
// transactions (history.ts); undo and redo are transactions applied back.
//
// Dirty tracking is versioned (F01): every change to an actor bumps its
// version. A save captures the versions it sends; its answer marks exactly
// those versions saved. An actor edited again while the save was on its way
// stays dirty.
//
// Level settings (phase 5b: view distance, load range) are edited in the
// same transactions (`setSettings`) and versioned the same way; dirty
// settings write `level.json`. The grid's `cellSize` is not edited here: it
// moves every actor to other cells, a world-wide Node operation (A11).
//
// Saving: the dirty actors give the parts to write (`partsToWrite`, which
// also ties the two cells of a misplaced actor), `planLevelFiles` gives their
// text. A part to write that is not loaded stops the plan (`needs-load`). A
// dirty cell cannot be unloaded.
//
// The base (plan phase 4 step 8): every actor as the session read or last
// saved it, the merge base when a save meets a 409. `compare` reads the level
// on disk against it (merge.ts); `rebase` takes the disk's level, either
// dropping this session's changes (Reload) or keeping them over the disk's
// (merge, each conflict by a pick). Both clear the undo history (user
// decision 2026-11-15: a step's "before" no longer holds) and announce the
// actors that changed with the cause "reload".

import type { ActorId } from "../id.ts";
import { cellFileOf, cellKeyOfFile, CELL_INDEX_FILE, LEVEL_FILE } from "../level/cellDocs.ts";
import { assignCells, type CellAssignment, type CellAssignOptions } from "../level/cells.ts";
import { mergeLevelParts, partsToWrite, planLevelFiles, type LevelPartIssue, type PartKey } from "../level/levelParts.ts";
import type { ActorDoc, LevelCellDoc, LevelCellIndexDoc, LevelDoc } from "../level/model.ts";
import { normalizeActorDoc, normalizeLevel } from "../level/normalizeLevel.ts";
import type { LevelSettings } from "../level/settings.ts";
import type { Issue } from "../schema/issues.ts";
import { createHistory, type ActorChange, type History, type SettingsChange, type Transaction } from "./history.ts";
import { jsonEqual, planLevelMerge, type LevelMerge, type MergeKey, type MergeSide } from "./merge.ts";
import type { SaveRequestBody, SaveResponseBody } from "./saveProtocol.ts";

export interface LoadedCell {
  readonly doc: LevelCellDoc;
  readonly revision: string;
}

export interface OpenLevelOptions {
  /** Project-relative level folder, e.g. `content/levels/main`. */
  readonly folder: string;
  readonly persistent: LevelDoc;
  /** Revision of `level.json`; null for a level not saved yet. */
  readonly persistentRevision: string | null;
  /** The level's index; null when it has none (no cells on disk). */
  readonly index: LevelCellIndexDoc | null;
  readonly cells?: readonly LoadedCell[];
  readonly historyLimit?: number;
}

export interface EditTx {
  /** Adds the actor, or replaces the actor with its id. The actor is normalised and copied. */
  setActor(actor: unknown): void;
  removeActor(id: ActorId): void;
  /** Changes level settings (a partial patch over the current ones, normalised); `cellSize` cannot change. */
  setSettings(patch: Readonly<Record<string, unknown>>): void;
}

export interface EditResult {
  readonly ok: boolean;
  /** Issue paths start with the actor id. */
  readonly issues: readonly Issue[];
}

/** One actor as an edit, undo or redo left it: `before` and `after` in the direction it was applied. */
export interface AppliedChange {
  readonly id: ActorId;
  readonly before: ActorDoc | null;
  readonly after: ActorDoc | null;
}

export type SavePlan =
  | { readonly status: "clean" }
  | { readonly status: "needs-load"; readonly cells: readonly string[] }
  | {
      readonly status: "ready";
      readonly request: SaveRequestBody;
      /** Actor -> version this save sends. */
      readonly versions: ReadonlyMap<ActorId, number>;
      /** Project-relative path -> part. */
      readonly parts: ReadonlyMap<string, PartKey>;
      /** Part -> the actors written into it. */
      readonly written: ReadonlyMap<PartKey, readonly ActorId[]>;
      /** Actor -> what this save sends of it (null: removed); the base once saved. */
      readonly docs: ReadonlyMap<ActorId, ActorDoc | null>;
      /** The settings this save sends, when they were dirty; the base once saved. */
      readonly settings?: { readonly version: number; readonly value: LevelSettings };
    };

/** How `rebase` takes the level on disk. */
export type RebaseMode =
  | { readonly mode: "reload" }
  | { readonly mode: "merge"; readonly pick?: (key: MergeKey) => MergeSide };

/** Why an edit, undo, redo or rebase changed the level. */
export type ApplyCause = "edit" | "undo" | "redo" | "reload";

export interface LevelSession {
  readonly folder: string;
  /** The loaded level. Read only: change it through `edit`. */
  readonly level: LevelDoc;
  readonly history: History;
  actor(id: ActorId): ActorDoc | undefined;
  isLoaded(cell: string): boolean;
  /** Cells on disk that are not loaded; scene-wide authoring must not silently skip them. */
  unloadedCells(): readonly string[];
  edit(label: string, build: (tx: EditTx) => void, options?: { readonly coalesce?: string }): EditResult;
  undo(): boolean;
  redo(): boolean;
  dirtyActors(): ActorId[];
  /** True while the level's settings have unsaved changes. */
  settingsDirty(): boolean;
  /** Adds cells read from disk. Issues are about those cells only. */
  loadCells(cells: readonly LoadedCell[]): LevelPartIssue[];
  /** Drops a loaded cell's actors; refused while the cell has unsaved changes. */
  unloadCell(cell: string): { readonly ok: boolean; readonly reason?: string };
  planSave(): SavePlan;
  /**
   * Hears every change the session applies (an edit, an undo, a redo), in the
   * order applied; the editor mirrors them into its world. A change of only the
   * settings is heard with no actor changes. Returns the unsubscribe.
   */
  onApplied(listener: (changes: readonly AppliedChange[], cause: ApplyCause) => void): () => void;
  /** Applies the server's answer to a plan. Only a saved answer changes the session. */
  applySaveResult(plan: Extract<SavePlan, { status: "ready" }>, response: SaveResponseBody): void;
  /** The actor as last read or saved (the merge base); undefined when the disk did not have it. */
  baseActor(id: ActorId): ActorDoc | undefined;
  /**
   * The revision of a level file (`<folder>/level.json`, `<folder>/cells/<x>_<z>.json`) as last read or saved;
   * undefined for a file the session does not hold (plan phase 4 step 9f: a change on disk is a revision it does not know).
   */
  fileRevision(path: string): string | undefined;
  /** This session against the level on disk (read whole, every cell): what merges by itself and what conflicts. */
  compare(disk: OpenLevelOptions): { readonly merge: LevelMerge; readonly issues: readonly LevelPartIssue[] };
  /**
   * Takes the level on disk (read whole): its revisions and files become the
   * session's. Reload drops this session's changes; merge keeps them (each
   * conflict by `pick`, default mine) and they stay unsaved. Refused, with
   * nothing changed, when the merged level does not check.
   */
  rebase(disk: OpenLevelOptions, how: RebaseMode): EditResult;
}

export function openLevelSession(open: OpenLevelOptions, options: CellAssignOptions): LevelSession {
  const folder = open.folder.replace(/\/+$/, "");
  const pathOf = (key: PartKey): string => `${folder}/${key === null ? LEVEL_FILE : cellFileOf(key)}`;
  const merged = mergeLevelParts(open.persistent, (open.cells ?? []).map((cell) => cell.doc), options);
  const level = merged.value.level;
  /** Each actor as read or last saved; documents are never changed in place, so this holds references. */
  const base = new Map<ActorId, ActorDoc>(level.actors.map((actor) => [actor.id, actor]));
  let baseSettings: LevelSettings = structuredClone(level.settings);
  /** Id -> actor: lookups stay constant-time at 50.000 actors (the Outliner, Details and the selection ask often). */
  const byId = new Map<ActorId, ActorDoc>(level.actors.map((actor) => [actor.id, actor]));
  const fileOf = new Map(merged.value.fileOf);
  const loaded = new Set(merged.value.cells);
  const onDisk = new Set(Object.keys(open.index?.cells ?? {}));
  const revisions = new Map<PartKey, string>();
  if (open.persistentRevision !== null) revisions.set(null, open.persistentRevision);
  for (const cell of open.cells ?? []) revisions.set(cell.doc.cell, cell.revision);

  const history = createHistory(open.historyLimit);
  const versions = new Map<ActorId, number>();
  const saved = new Map<ActorId, number>();
  let clock = 0;
  /** The settings' version, like an actor's; 0 is as read. */
  let settingsVersion = 0;
  let savedSettingsVersion = 0;
  const putSettings = (next: LevelSettings): void => {
    level.settings = structuredClone(next);
    clock += 1;
    settingsVersion = clock;
  };

  /** The actor's place in the level's list; -1 when it is not there. */
  const indexOf = (id: ActorId): number => {
    const actor = byId.get(id);
    return actor === undefined ? -1 : level.actors.indexOf(actor);
  };

  /** Applies one side of a change and bumps the actor's version. */
  const put = (id: ActorId, actor: ActorDoc | null, at: number): void => {
    const index = indexOf(id);
    if (actor === null) {
      if (index >= 0) level.actors.splice(index, 1);
      byId.delete(id);
    } else {
      if (index >= 0) level.actors[index] = actor;
      else level.actors.splice(Math.min(Math.max(at, 0), level.actors.length), 0, actor);
      byId.set(id, actor);
    }
    clock += 1;
    versions.set(id, clock);
  };

  const listeners = new Set<(changes: readonly AppliedChange[], cause: ApplyCause) => void>();
  /** Applies changes; returns them as applied. Listeners hear them once the history is up to date (`announce`). */
  const applyChanges = (changes: readonly ActorChange[], direction: "forward" | "back", settings?: SettingsChange): AppliedChange[] => {
    if (settings) putSettings(direction === "forward" ? settings.after : settings.before);
    const ordered = direction === "forward" ? changes : [...changes].reverse();
    const applied: AppliedChange[] = [];
    for (const change of ordered) {
      const before = direction === "forward" ? change.before : change.after;
      const after = direction === "forward" ? change.after : change.before;
      put(change.id, after, change.beforeIndex);
      applied.push({ id: change.id, before, after });
    }
    return applied;
  };
  const announce = (applied: readonly AppliedChange[], cause: ApplyCause): void => {
    for (const listener of [...listeners]) listener(applied, cause);
  };

  const isLoaded = (cell: string): boolean => loaded.has(cell) || !onDisk.has(cell);

  const session: LevelSession = {
    folder,
    level,
    history,
    actor: (id) => byId.get(id),
    isLoaded,
    unloadedCells: () => [...onDisk].filter((cell) => !isLoaded(cell)),
    fileRevision(path) {
      if (!path.startsWith(`${folder}/`)) return undefined;
      const inside = path.slice(folder.length + 1);
      const key = inside === LEVEL_FILE ? null : cellKeyOfFile(inside);
      if (key === null && inside !== LEVEL_FILE) return undefined;
      return revisions.get(key);
    },

    edit(label, build, editOptions = {}) {
      const issues: Issue[] = [];
      const staged = new Map<ActorId, ActorDoc | null>();
      let stagedSettings: LevelSettings | null = null;
      const current = (id: ActorId): ActorDoc | null =>
        staged.has(id) ? staged.get(id)! : (byId.get(id) ?? null);
      build({
        setActor(raw) {
          const result = normalizeActorDoc(raw, options);
          const id = typeof (raw as { id?: unknown } | null)?.id === "string" ? (raw as { id: string }).id : "actor";
          for (const found of result.issues) issues.push({ ...found, path: found.path === "" ? id : `${id}.${found.path}` });
          if (result.value) staged.set(result.value.id, result.value);
        },
        removeActor(id) {
          staged.set(id, null);
        },
        setSettings(patch) {
          const merged = { ...(stagedSettings ?? level.settings), ...structuredClone(patch) };
          const checked = normalizeLevel({ schema: level.schema, id: level.id, settings: merged, actors: [] }, options);
          for (const found of checked.issues) issues.push({ ...found, path: found.path === "" ? "settings" : found.path });
          const next = checked.value?.settings;
          if (!next) return;
          if (next.cellSize !== level.settings.cellSize) {
            issues.push({
              code: "invalid-value",
              severity: "error",
              path: "settings.cellSize",
              message: "Cell Size moves every actor to other cells; change it with the world-wide tool, not an edit.",
            });
            return;
          }
          stagedSettings = next;
        },
      });
      // A parent is another actor of the level (a child is saved with its root).
      for (const [id, actor] of staged) {
        if (actor === null || actor.parent === null) continue;
        if (actor.parent === id || current(actor.parent) === null) {
          issues.push({
            code: "invalid-parent",
            severity: "error",
            path: `${id}.parent`,
            message: `Actor ${actor.parent} is not in the loaded level.`,
          });
          continue;
        }
        // No cycle: walking up from the new parent never comes back to the actor.
        const seen = new Set<ActorId>([id]);
        for (let at: ActorId | null = actor.parent; at !== null; at = current(at)?.parent ?? null) {
          if (!seen.has(at)) {
            seen.add(at);
            continue;
          }
          issues.push({
            code: "invalid-parent",
            severity: "error",
            path: `${id}.parent`,
            message: `Parenting ${id} to ${actor.parent} makes a cycle.`,
          });
          break;
        }
      }
      // A removed actor takes no child with it silently: its children go in the same edit or get another parent.
      const removed = new Set([...staged].filter(([, actor]) => actor === null).map(([id]) => id));
      // (A staged child pointing at a removed actor is caught above: its parent is gone.)
      if (removed.size > 0) {
        for (const other of level.actors) {
          if (other.parent === null || !removed.has(other.parent) || staged.has(other.id)) continue;
          const id = other.parent;
          issues.push({
            code: "invalid-parent",
            severity: "error",
            path: `${other.id}.parent`,
            message: `Actor ${id} is removed but its child ${other.id} stays; remove or reparent the child in the same edit.`,
          });
        }
      }
      const settingsChange: SettingsChange | undefined = stagedSettings !== null && !jsonEqual(stagedSettings, level.settings)
        ? { before: structuredClone(level.settings), after: stagedSettings }
        : undefined;
      if (issues.some((found) => found.severity === "error") || (staged.size === 0 && !settingsChange)) {
        return { ok: !issues.some((found) => found.severity === "error"), issues };
      }
      const changes: ActorChange[] = [];
      for (const [id, after] of staged) {
        const beforeIndex = indexOf(id);
        const before = byId.get(id) ?? null;
        if (before === null && after === null) continue;
        changes.push({ id, before, beforeIndex: beforeIndex >= 0 ? beforeIndex : level.actors.length, after });
      }
      const applied = applyChanges(changes, "forward", settingsChange);
      const transaction: Transaction = { label, coalesce: editOptions.coalesce ?? null, changes, ...(settingsChange ? { settings: settingsChange } : {}) };
      history.push(transaction);
      announce(applied, "edit");
      return { ok: true, issues };
    },

    undo() {
      const transaction = history.takeUndo();
      if (!transaction) return false;
      announce(applyChanges(transaction.changes, "back", transaction.settings), "undo");
      return true;
    },

    redo() {
      const transaction = history.takeRedo();
      if (!transaction) return false;
      announce(applyChanges(transaction.changes, "forward", transaction.settings), "redo");
      return true;
    },

    dirtyActors() {
      return [...versions].filter(([id, version]) => saved.get(id) !== version).map(([id]) => id);
    },

    settingsDirty: () => settingsVersion !== savedSettingsVersion,

    loadCells(cells) {
      const fresh = cells.filter((cell) => !loaded.has(cell.doc.cell));
      const result = mergeLevelParts({ ...level, actors: [] }, fresh.map((cell) => cell.doc), options);
      const issues: LevelPartIssue[] = [];
      const known = new Set(level.actors.map((actor) => actor.id));
      for (const actor of result.value.level.actors) {
        if (known.has(actor.id)) {
          issues.push({
            code: "duplicate-id",
            severity: options.strict ? "error" : "warning",
            path: "actors",
            message: `Actor ${actor.id} is already loaded; the cell's copy is left out.`,
            file: cellFileOf(result.value.fileOf.get(actor.id) ?? ""),
          });
          continue;
        }
        level.actors.push(actor);
        byId.set(actor.id, actor);
        base.set(actor.id, actor);
        fileOf.set(actor.id, result.value.fileOf.get(actor.id) ?? null);
      }
      for (const cell of fresh) {
        if (!result.value.cells.includes(cell.doc.cell)) continue;
        loaded.add(cell.doc.cell);
        revisions.set(cell.doc.cell, cell.revision);
      }
      issues.unshift(...result.issues);
      return issues;
    },

    unloadCell(cell) {
      if (!loaded.has(cell)) return { ok: true };
      const assignment = assignCells(level.actors, level.settings, options).value;
      for (const id of session.dirtyActors()) {
        if (fileOf.get(id) === cell || assignment.get(id) === cell) {
          return { ok: false, reason: `Cell ${cell} has unsaved changes.` };
        }
      }
      for (let index = level.actors.length - 1; index >= 0; index -= 1) {
        const id = level.actors[index]!.id;
        if (fileOf.get(id) === cell) {
          level.actors.splice(index, 1);
          byId.delete(id);
          base.delete(id);
          fileOf.delete(id);
          versions.delete(id);
          saved.delete(id);
        }
      }
      loaded.delete(cell);
      revisions.delete(cell);
      return { ok: true };
    },

    planSave() {
      const dirty = session.dirtyActors();
      const settingsDirty = session.settingsDirty();
      if (dirty.length === 0 && !settingsDirty) return { status: "clean" };
      const assignment: CellAssignment = assignCells(level.actors, level.settings, options).value;
      const parts = new Set(partsToWrite(fileOf, assignment, dirty));
      if (settingsDirty) parts.add(null);
      const loadedNow = new Set([...parts].filter((key): key is string => key !== null && isLoaded(key)));
      const plan = planLevelFiles(level, assignment, parts, loadedNow);
      if (plan.notLoaded.length > 0) return { status: "needs-load", cells: plan.notLoaded };

      const pathParts = new Map<string, PartKey>();
      const written = new Map<PartKey, ActorId[]>();
      for (const key of parts) written.set(key, []);
      for (const actor of level.actors) {
        const key = assignment.get(actor.id) ?? null;
        written.get(key)?.push(actor.id);
      }
      const writes = plan.write.map((file) => {
        const path = pathOf(file.key);
        pathParts.set(path, file.key);
        return { path, base: revisions.get(file.key) ?? null, text: file.text };
      });
      const deletes: { path: string; base: string }[] = [];
      for (const removed of plan.remove) {
        const path = pathOf(removed.key);
        pathParts.set(path, removed.key);
        const base = revisions.get(removed.key);
        if (base !== undefined) deletes.push({ path, base });
      }
      const sent = new Map<ActorId, number>();
      const docs = new Map<ActorId, ActorDoc | null>();
      for (const id of dirty) {
        sent.set(id, versions.get(id)!);
        docs.set(id, byId.get(id) ?? null);
      }
      return {
        status: "ready", request: { writes, deletes }, versions: sent, parts: pathParts, written, docs,
        ...(settingsDirty ? { settings: { version: settingsVersion, value: structuredClone(level.settings) } } : {}),
      };
    },

    applySaveResult(plan, response) {
      if (response.status !== "saved") return;
      const touched = new Set<PartKey>();
      for (const file of response.files) {
        if (file.path === `${folder}/${CELL_INDEX_FILE}`) continue;
        if (!plan.parts.has(file.path)) continue;
        const key = plan.parts.get(file.path)!;
        touched.add(key);
        if (file.revision === null) {
          revisions.delete(key);
          if (key !== null) onDisk.delete(key);
        } else {
          revisions.set(key, file.revision);
          if (key !== null) {
            onDisk.add(key);
            loaded.add(key);
          }
        }
      }
      // What is on disk now: the actors each written part holds.
      for (const [id, part] of [...fileOf]) if (touched.has(part)) fileOf.delete(id);
      for (const key of touched) for (const id of plan.written.get(key) ?? []) fileOf.set(id, key);
      for (const [id, version] of plan.versions) saved.set(id, version);
      if (plan.settings && touched.has(null)) {
        savedSettingsVersion = plan.settings.version;
        baseSettings = structuredClone(plan.settings.value);
      }
      for (const [id, doc] of plan.docs) {
        if (doc === null) base.delete(id);
        else base.set(id, doc);
      }
      history.seal();
    },

    baseActor: (id) => base.get(id),

    compare(disk) {
      const theirs = mergeLevelParts(disk.persistent, (disk.cells ?? []).map((cell) => cell.doc), options);
      return { merge: planLevelMerge({ base: { settings: baseSettings, actors: base }, mine: level, theirs: theirs.value.level }), issues: theirs.issues };
    },

    rebase(disk, how) {
      const theirs = mergeLevelParts(disk.persistent, (disk.cells ?? []).map((cell) => cell.doc), options).value;
      const theirsById = new Map<ActorId, ActorDoc>(theirs.level.actors.map((actor) => [actor.id, actor]));
      const issues: Issue[] = [];
      let nextActors: ActorDoc[];
      let nextSettings: LevelSettings;
      if (how.mode === "reload") {
        nextActors = theirs.level.actors;
        nextSettings = theirs.level.settings;
      } else {
        const resolved = planLevelMerge({ base: { settings: baseSettings, actors: base }, mine: level, theirs: theirs.level }).resolve(how.pick);
        const checkedLevel = normalizeLevel({ schema: level.schema, id: level.id, settings: resolved.settings, actors: [] }, options);
        for (const found of checkedLevel.issues) issues.push({ ...found, path: found.path === "" ? "settings" : found.path });
        nextSettings = checkedLevel.value?.settings ?? theirs.level.settings;
        nextActors = [];
        for (const raw of resolved.actors) {
          const result = normalizeActorDoc(raw, options);
          const id = (raw as { id?: string }).id ?? "actor";
          for (const found of result.issues) issues.push({ ...found, path: found.path === "" ? id : `${id}.${found.path}` });
          if (!result.value) continue;
          // An actor the disk has as it is keeps the disk's document.
          const same = theirsById.get(result.value.id);
          nextActors.push(same && jsonEqual(same, result.value) ? same : result.value);
        }
        // Every parent is in the merged level, and no cycle.
        const nextById = new Map(nextActors.map((actor) => [actor.id, actor]));
        for (const actor of nextActors) {
          if (actor.parent === null) continue;
          const seen = new Set<ActorId>([actor.id]);
          for (let at: ActorId | null = actor.parent; at !== null; at = nextById.get(at)?.parent ?? null) {
            if (!nextById.has(at)) {
              issues.push({ code: "invalid-parent", severity: "error", path: `${actor.id}.parent`, message: `Actor ${at} is not in the merged level (removed on one side).` });
              break;
            }
            if (seen.has(at)) {
              issues.push({ code: "invalid-parent", severity: "error", path: `${actor.id}.parent`, message: `The merged parents of ${actor.id} make a cycle.` });
              break;
            }
            seen.add(at);
          }
        }
        if (issues.some((found) => found.severity === "error")) return { ok: false, issues };
      }

      const before = new Map(byId);
      level.actors.splice(0, level.actors.length, ...nextActors);
      level.settings = structuredClone(nextSettings);
      byId.clear();
      for (const actor of nextActors) byId.set(actor.id, actor);
      fileOf.clear();
      for (const [id, key] of theirs.fileOf) fileOf.set(id, key);
      loaded.clear();
      for (const cell of theirs.cells) loaded.add(cell);
      onDisk.clear();
      for (const cell of Object.keys(disk.index?.cells ?? {})) onDisk.add(cell);
      revisions.clear();
      if (disk.persistentRevision !== null) revisions.set(null, disk.persistentRevision);
      for (const cell of disk.cells ?? []) if (loaded.has(cell.doc.cell)) revisions.set(cell.doc.cell, cell.revision);
      base.clear();
      for (const actor of theirs.level.actors) base.set(actor.id, actor);
      baseSettings = structuredClone(theirs.level.settings);
      // The settings are dirty when the merge kept this session's.
      clock += 1;
      settingsVersion = clock;
      savedSettingsVersion = jsonEqual(level.settings, theirs.level.settings) ? clock : 0;
      // Dirty: what differs from the disk (a merge's own changes, and its removals).
      versions.clear();
      saved.clear();
      for (const id of new Set([...byId.keys(), ...theirsById.keys()])) {
        const now = byId.get(id);
        const disked = theirsById.get(id);
        if (now === disked || (now !== undefined && disked !== undefined && jsonEqual(now, disked))) continue;
        clock += 1;
        versions.set(id, clock);
      }
      history.clear();
      const applied: AppliedChange[] = [];
      for (const id of new Set([...before.keys(), ...byId.keys()])) {
        const was = before.get(id) ?? null;
        const now = byId.get(id) ?? null;
        if (was === now || (was !== null && now !== null && jsonEqual(was, now))) continue;
        applied.push({ id, before: was, after: now });
      }
      announce(applied, "reload");
      return { ok: true, issues };
    },

    onApplied(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return session;
}
