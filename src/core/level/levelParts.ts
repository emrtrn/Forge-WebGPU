// A level and its files (architecture §4.4, §4.6, decision A11).
//
// In memory a level is one `LevelDoc` (all its actors, or the persistent
// layer plus the cells loaded so far) and a map saying which file each actor
// was read from. On disk it is `level.json` + one file per occupied cell +
// `cells.json`. This module moves between the two:
//
// - `mergeLevelParts`: the files read so far -> the in-memory level. Checks
//   what a single file cannot see: ids and singletons across files, cells of
//   another level, and actors standing in the wrong cell (a warning; the next
//   save moves them).
// - `splitLevel`: a whole level -> its part documents.
// - `partsToWrite` + `planLevelFiles`: after an edit, which files change and
//   their new canonical text; a cell left empty is removed.
// - `nextCellIndex`: the index to write last, once the new revisions are known.
//
// Part keys: a cell key, or null for the persistent layer.

import type { ActorId, LevelId } from "../id.ts";
import { isJsonObject } from "../json.ts";
import {
  childPath,
  createContext,
  indexPath,
  reportAdjustment,
  reportLoss,
  type Issue,
  type NormalizeContext,
} from "../schema/issues.ts";
import { componentDefOf } from "../schema/registry.ts";
import { cellFileOf, LEVEL_FILE } from "./cellDocs.ts";
import { assignCells, compareCellKeys, type CellAssignment, type CellAssignOptions } from "./cells.ts";
import {
  LEVEL_CELL_INDEX_SCHEMA,
  LEVEL_CELL_SCHEMA,
  type ActorDoc,
  type LevelCellDoc,
  type LevelCellIndexDoc,
  type LevelDoc,
} from "./model.ts";

/** A cell key, or null for the persistent layer. */
export type PartKey = string | null;

/** Path of a part, relative to the level folder. */
export function partFileOf(key: PartKey): string {
  return key === null ? LEVEL_FILE : cellFileOf(key);
}

/** An issue in one file of a level. `file` is relative to the level folder. */
export interface LevelPartIssue extends Issue {
  readonly file: string;
}

export interface MergedLevel {
  readonly level: LevelDoc;
  /** Actor id -> the part it was read from. */
  readonly fileOf: Map<ActorId, PartKey>;
  /** The cells that were merged, in cell order. */
  readonly cells: string[];
}

export interface MergeResult {
  readonly value: MergedLevel;
  readonly issues: LevelPartIssue[];
  readonly ok: boolean;
}

/**
 * Merges normalised parts into one level: the persistent actors first, then
 * the cells in cell order. Nothing is shared with the inputs.
 */
export function mergeLevelParts(
  persistent: LevelDoc,
  cells: readonly LevelCellDoc[],
  options: CellAssignOptions,
): MergeResult {
  const issues: LevelPartIssue[] = [];
  const contextFor = (key: PartKey): NormalizeContext & { file: string } => ({
    ...createContext(options),
    file: partFileOf(key),
  });
  const collect = (ctx: NormalizeContext & { file: string }): void => {
    for (const issue of ctx.issues) issues.push({ ...issue, file: ctx.file });
  };

  const level: LevelDoc = { ...structuredClone(persistent), actors: [] };
  const fileOf = new Map<ActorId, PartKey>();
  const where: { key: PartKey; index: number }[] = [];
  const singletons = new Map<string, PartKey>();
  const merged: string[] = [];

  const add = (key: PartKey, actors: readonly ActorDoc[], ctx: NormalizeContext): void => {
    const seenHere = new Set<string>();
    actors.forEach((actor, index) => {
      const path = indexPath("actors", index);
      if (fileOf.has(actor.id)) {
        reportLoss(
          ctx,
          "duplicate-id",
          childPath(path, "id"),
          `Actor id ${actor.id} is already used in ${partFileOf(fileOf.get(actor.id)!)}; actor dropped.`,
        );
        return;
      }
      for (const name of singletonNames(actor, options)) {
        if (seenHere.has(name)) continue; // a repeat within one file is reported by its normalisation
        seenHere.add(name);
        const first = singletons.get(name);
        if (first === undefined) {
          singletons.set(name, key);
        } else {
          reportLoss(ctx, "singleton-conflict", path, `A level has at most one ${name}; the first is in ${partFileOf(first)}.`);
        }
      }
      fileOf.set(actor.id, key);
      where.push({ key, index });
      level.actors.push(structuredClone(actor));
    });
  };

  const persistentCtx = contextFor(null);
  add(null, persistent.actors, persistentCtx);
  collect(persistentCtx);

  const sorted = [...cells].sort((a, b) => compareCellKeys(a.cell, b.cell));
  for (const cell of sorted) {
    const ctx = contextFor(cell.cell);
    if (cell.level !== persistent.id) {
      reportLoss(ctx, "invalid-value", "level", `The cell belongs to level ${cell.level}, not ${persistent.id}; left out.`);
    } else if (merged.includes(cell.cell)) {
      reportLoss(ctx, "duplicate-id", "cell", `Cell ${cell.cell} is already merged; left out.`);
    } else {
      merged.push(cell.cell);
      add(cell.cell, cell.actors, ctx);
    }
    collect(ctx);
  }

  // Where each actor belongs now. Parents are always in the same file, so
  // this works on a partly loaded level too.
  const assignment = assignCells(level.actors, level.settings, options);
  for (const issue of assignment.issues) {
    const match = /^actors\[(\d+)\]/.exec(issue.path);
    const at = match ? where[Number(match[1])] : undefined;
    issues.push({
      ...issue,
      path: at ? issue.path.replace(/^actors\[\d+\]/, indexPath("actors", at.index)) : issue.path,
      file: partFileOf(at?.key ?? null),
    });
  }
  level.actors.forEach((actor, position) => {
    const from = fileOf.get(actor.id)!;
    const to = assignment.value.get(actor.id) ?? null;
    if (from === to) return;
    const ctx = contextFor(from);
    reportAdjustment(
      ctx,
      "misplaced-actor",
      indexPath("actors", where[position]!.index),
      `The actor belongs in ${partFileOf(to)}; the next save moves it there.`,
    );
    collect(ctx);
  });

  return {
    value: { level, fileOf, cells: merged },
    issues,
    ok: issues.every((issue) => issue.severity !== "error"),
  };
}

function singletonNames(actor: ActorDoc, options: CellAssignOptions): string[] {
  const components =
    actor.class === null ? actor.components : (options.resolveClass(actor.class)?.components ?? {});
  const names: string[] = [];
  for (const component of Object.values(components)) {
    const def = componentDefOf(options.registry, component);
    if (def?.singleton) names.push(def.name);
  }
  return names;
}

/** The document of one part, built from the actors assigned to it, in level order. */
function partDocument(level: LevelDoc, assignment: CellAssignment, key: PartKey): LevelDoc | LevelCellDoc {
  const actors = level.actors
    .filter((actor) => (assignment.get(actor.id) ?? null) === key)
    .map((actor) => structuredClone(actor));
  if (key === null) {
    return { schema: level.schema, id: level.id, settings: structuredClone(level.settings), actors };
  }
  return { schema: LEVEL_CELL_SCHEMA, level: level.id, cell: key, actors };
}

export interface SplitLevel {
  readonly persistent: LevelDoc;
  /** Occupied cells only, in cell order. */
  readonly cells: LevelCellDoc[];
  readonly assignment: CellAssignment;
  readonly issues: readonly Issue[];
}

/** Splits a whole level into its part documents. */
export function splitLevel(level: LevelDoc, options: CellAssignOptions): SplitLevel {
  const assignment = assignCells(level.actors, level.settings, options);
  const keys = new Set<string>();
  for (const key of assignment.value.values()) if (key !== null) keys.add(key);
  return {
    persistent: partDocument(level, assignment.value, null) as LevelDoc,
    cells: [...keys].sort(compareCellKeys).map((key) => partDocument(level, assignment.value, key) as LevelCellDoc),
    assignment: assignment.value,
    issues: assignment.issues,
  };
}

/**
 * The parts an edit touches: for every edited actor, the part it was read
 * from (absent for a new actor) and the part it belongs to now (absent for a
 * deleted one). Moving an actor across a cell edge touches both cells.
 */
export function partsToWrite(
  fileOf: ReadonlyMap<ActorId, PartKey>,
  assignment: CellAssignment,
  edited: Iterable<ActorId>,
): Set<PartKey> {
  const parts = new Set<PartKey>();
  for (const id of edited) {
    if (fileOf.has(id)) parts.add(fileOf.get(id)!);
    if (assignment.has(id)) parts.add(assignment.get(id)!);
  }
  return parts;
}

export interface LevelFileWrite {
  readonly key: PartKey;
  /** Relative to the level folder. */
  readonly path: string;
  readonly text: string;
}

export interface LevelFilePlan {
  readonly write: LevelFileWrite[];
  /** Cells left empty: their files are removed and they leave the index. */
  readonly remove: { readonly key: string; readonly path: string }[];
  /**
   * Cells to write that are not loaded: writing them from this level would
   * drop the actors not in memory. Load them and plan again; nothing in the
   * plan is to be written while this is not empty.
   */
  readonly notLoaded: string[];
}

/**
 * New text of the given parts. `loaded` holds the cells whose actors are all
 * in `level`; the persistent layer is always loaded. Parts are written in
 * order: the persistent layer, then cells in cell order.
 */
export function planLevelFiles(
  level: LevelDoc,
  assignment: CellAssignment,
  parts: Iterable<PartKey>,
  loaded: ReadonlySet<string>,
): LevelFilePlan {
  const keys = [...new Set(parts)];
  const cells = keys.filter((key): key is string => key !== null).sort(compareCellKeys);
  const plan: LevelFilePlan = { write: [], remove: [], notLoaded: cells.filter((key) => !loaded.has(key)) };
  const ordered: PartKey[] = keys.includes(null) ? [null, ...cells] : cells;
  for (const key of ordered) {
    const document = partDocument(level, assignment, key);
    if (key !== null && document.actors.length === 0) {
      plan.remove.push({ key, path: partFileOf(key) });
    } else {
      plan.write.push({ key, path: partFileOf(key), text: stringifyDocument(document) });
    }
  }
  return plan;
}

/**
 * The index after a save: the previous one with the written revisions set and
 * the removed cells taken out. Null when the persistent revision is unknown
 * (no previous index and `level.json` not written).
 */
export function nextCellIndex(
  level: LevelId,
  previous: LevelCellIndexDoc | null,
  written: ReadonlyMap<PartKey, string>,
  removed: Iterable<string> = [],
): LevelCellIndexDoc | null {
  const persistent = written.get(null) ?? previous?.persistent;
  if (persistent === undefined) return null;
  const revisions = new Map<string, string>(Object.entries(previous?.cells ?? {}));
  for (const [key, revision] of written) if (key !== null) revisions.set(key, revision);
  for (const key of removed) revisions.delete(key);
  const cells: Record<string, string> = {};
  for (const key of [...revisions.keys()].sort(compareCellKeys)) cells[key] = revisions.get(key)!;
  return { schema: LEVEL_CELL_INDEX_SCHEMA, level, persistent, cells };
}

/**
 * The canonical text of a document: two-space indent, an array of plain
 * values on one line (`"p": [0, 1, 0]`), a final newline. The same document
 * always gives the same bytes, so the revision only changes with the content.
 */
export function stringifyDocument(value: unknown): string {
  return `${stringifyValue(value, "")}\n`;
}

function stringifyValue(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((item) => item === null || typeof item !== "object")) {
      return `[${value.map((item) => JSON.stringify(item ?? null)).join(", ")}]`;
    }
    const inner = `${indent}  `;
    return `[\n${value.map((item) => `${inner}${stringifyValue(item, inner)}`).join(",\n")}\n${indent}]`;
  }
  if (isJsonObject(value)) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (entries.length === 0) return "{}";
    const inner = `${indent}  `;
    const lines = entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${stringifyValue(item, inner)}`);
    return `{\n${lines.join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value ?? null);
}
