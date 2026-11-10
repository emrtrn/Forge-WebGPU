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
// Saving: the dirty actors give the parts to write (`partsToWrite`, which
// also ties the two cells of a misplaced actor), `planLevelFiles` gives their
// text. A part to write that is not loaded stops the plan (`needs-load`). A
// dirty cell cannot be unloaded.

import type { ActorId } from "../id.ts";
import { cellFileOf, CELL_INDEX_FILE, LEVEL_FILE } from "../level/cellDocs.ts";
import { assignCells, type CellAssignment, type CellAssignOptions } from "../level/cells.ts";
import { mergeLevelParts, partsToWrite, planLevelFiles, type LevelPartIssue, type PartKey } from "../level/levelParts.ts";
import type { ActorDoc, LevelCellDoc, LevelCellIndexDoc, LevelDoc } from "../level/model.ts";
import { normalizeActorDoc } from "../level/normalizeLevel.ts";
import type { Issue } from "../schema/issues.ts";
import { createHistory, type ActorChange, type History, type Transaction } from "./history.ts";
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
}

export interface EditResult {
  readonly ok: boolean;
  /** Issue paths start with the actor id. */
  readonly issues: readonly Issue[];
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
    };

export interface LevelSession {
  readonly folder: string;
  /** The loaded level. Read only: change it through `edit`. */
  readonly level: LevelDoc;
  readonly history: History;
  actor(id: ActorId): ActorDoc | undefined;
  isLoaded(cell: string): boolean;
  edit(label: string, build: (tx: EditTx) => void, options?: { readonly coalesce?: string }): EditResult;
  undo(): boolean;
  redo(): boolean;
  dirtyActors(): ActorId[];
  /** Adds cells read from disk. Issues are about those cells only. */
  loadCells(cells: readonly LoadedCell[]): LevelPartIssue[];
  /** Drops a loaded cell's actors; refused while the cell has unsaved changes. */
  unloadCell(cell: string): { readonly ok: boolean; readonly reason?: string };
  planSave(): SavePlan;
  /** Applies the server's answer to a plan. Only a saved answer changes the session. */
  applySaveResult(plan: Extract<SavePlan, { status: "ready" }>, response: SaveResponseBody): void;
}

export function openLevelSession(open: OpenLevelOptions, options: CellAssignOptions): LevelSession {
  const folder = open.folder.replace(/\/+$/, "");
  const pathOf = (key: PartKey): string => `${folder}/${key === null ? LEVEL_FILE : cellFileOf(key)}`;
  const merged = mergeLevelParts(open.persistent, (open.cells ?? []).map((cell) => cell.doc), options);
  const level = merged.value.level;
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

  const indexOf = (id: ActorId): number => level.actors.findIndex((actor) => actor.id === id);

  /** Applies one side of a change and bumps the actor's version. */
  const put = (id: ActorId, actor: ActorDoc | null, at: number): void => {
    const index = indexOf(id);
    if (actor === null) {
      if (index >= 0) level.actors.splice(index, 1);
    } else if (index >= 0) {
      level.actors[index] = actor;
    } else {
      level.actors.splice(Math.min(Math.max(at, 0), level.actors.length), 0, actor);
    }
    clock += 1;
    versions.set(id, clock);
  };

  const applyChanges = (changes: readonly ActorChange[], direction: "forward" | "back"): void => {
    const ordered = direction === "forward" ? changes : [...changes].reverse();
    for (const change of ordered) {
      put(change.id, direction === "forward" ? change.after : change.before, change.beforeIndex);
    }
  };

  const isLoaded = (cell: string): boolean => loaded.has(cell) || !onDisk.has(cell);

  const session: LevelSession = {
    folder,
    level,
    history,
    actor: (id) => level.actors.find((actor) => actor.id === id),
    isLoaded,

    edit(label, build, editOptions = {}) {
      const issues: Issue[] = [];
      const staged = new Map<ActorId, ActorDoc | null>();
      const current = (id: ActorId): ActorDoc | null =>
        staged.has(id) ? staged.get(id)! : (level.actors.find((actor) => actor.id === id) ?? null);
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
        }
      }
      if (issues.some((found) => found.severity === "error") || staged.size === 0) {
        return { ok: !issues.some((found) => found.severity === "error"), issues };
      }
      const changes: ActorChange[] = [];
      for (const [id, after] of staged) {
        const beforeIndex = indexOf(id);
        const before = beforeIndex >= 0 ? level.actors[beforeIndex]! : null;
        if (before === null && after === null) continue;
        changes.push({ id, before, beforeIndex: beforeIndex >= 0 ? beforeIndex : level.actors.length, after });
      }
      applyChanges(changes, "forward");
      const transaction: Transaction = { label, coalesce: editOptions.coalesce ?? null, changes };
      history.push(transaction);
      return { ok: true, issues };
    },

    undo() {
      const transaction = history.takeUndo();
      if (!transaction) return false;
      applyChanges(transaction.changes, "back");
      return true;
    },

    redo() {
      const transaction = history.takeRedo();
      if (!transaction) return false;
      applyChanges(transaction.changes, "forward");
      return true;
    },

    dirtyActors() {
      return [...versions].filter(([id, version]) => saved.get(id) !== version).map(([id]) => id);
    },

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
      if (dirty.length === 0) return { status: "clean" };
      const assignment: CellAssignment = assignCells(level.actors, level.settings, options).value;
      const parts = partsToWrite(fileOf, assignment, dirty);
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
      for (const id of dirty) sent.set(id, versions.get(id)!);
      return { status: "ready", request: { writes, deletes }, versions: sent, parts: pathParts, written };
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
      history.seal();
    },
  };
  return session;
}
