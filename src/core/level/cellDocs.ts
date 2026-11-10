// The files of a level besides `level.json` (architecture §4.4, decision A11).
//
// A level is a folder:
//
//   level.json        forge.level/1       persistent layer + settings
//   cells.json        forge.levelCells/1  index: revision of every file
//   cells/<x>_<z>.json forge.levelCell/1  the actors of one cell
//
// Loading and saving each file call its normalise function, like every other
// document (§4.5). A file is checked on its own here; whether its actors are
// in the right cell, and ids across files, is the whole-level check.

import { isId } from "../id.ts";
import { isJsonObject } from "../json.ts";
import {
  childPath,
  createContext,
  finish,
  reportFatal,
  reportLoss,
  type NormalizeResult,
} from "../schema/issues.ts";
import { compareCellKeys, isCellKey } from "./cells.ts";
import {
  LEVEL_CELL_INDEX_SCHEMA,
  LEVEL_CELL_SCHEMA,
  REVISION_PATTERN,
  type LevelCellDoc,
  type LevelCellIndexDoc,
} from "./model.ts";
import { normalizeActorList, reportUnknownKeys, type LevelNormalizeOptions } from "./normalizeLevel.ts";

/** File names inside a level folder. */
export const LEVEL_FILE = "level.json";
export const CELL_INDEX_FILE = "cells.json";
export const CELLS_DIR = "cells";

/** `cells/<key>.json`, relative to the level folder. */
export function cellFileOf(key: string): string {
  return `${CELLS_DIR}/${key}.json`;
}

/** The cell key of a path relative to the level folder; null when it is not a cell file. */
export function cellKeyOfFile(path: string): string | null {
  const prefix = `${CELLS_DIR}/`;
  if (!path.startsWith(prefix) || !path.endsWith(".json")) return null;
  const key = path.slice(prefix.length, -".json".length);
  return isCellKey(key) ? key : null;
}

export function isRevision(value: unknown): value is string {
  return typeof value === "string" && REVISION_PATTERN.test(value);
}

const CELL_KEYS = ["schema", "level", "cell", "actors"];
const INDEX_KEYS = ["schema", "level", "persistent", "cells"];

/** Null when the file cannot be read as a cell at all. */
export function normalizeLevelCell(
  raw: unknown,
  options: LevelNormalizeOptions,
): NormalizeResult<LevelCellDoc | null> {
  const ctx = createContext(options);
  if (!isJsonObject(raw)) {
    reportFatal(ctx, "invalid-document", "", "A level cell must be a JSON object.");
    return finish(ctx, null);
  }
  if (raw.schema !== LEVEL_CELL_SCHEMA) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${LEVEL_CELL_SCHEMA}".`);
    return finish(ctx, null);
  }
  if (!isId(raw.level, "level")) {
    reportFatal(ctx, "invalid-document", "level", "A level cell needs the id of its level.");
    return finish(ctx, null);
  }
  if (!isCellKey(raw.cell)) {
    reportFatal(ctx, "invalid-document", "cell", 'A level cell needs its "<x>_<z>" cell key.');
    return finish(ctx, null);
  }
  const value: LevelCellDoc = {
    schema: LEVEL_CELL_SCHEMA,
    level: raw.level,
    cell: raw.cell,
    actors: normalizeActorList(raw.actors, ctx, options),
  };
  reportUnknownKeys(raw, CELL_KEYS, "", ctx, "A level cell has no such field; dropped.");
  return finish(ctx, value);
}

/** Null when the file cannot be read as an index at all. */
export function normalizeLevelCellIndex(
  raw: unknown,
  options: { readonly strict: boolean },
): NormalizeResult<LevelCellIndexDoc | null> {
  const ctx = createContext(options);
  if (!isJsonObject(raw)) {
    reportFatal(ctx, "invalid-document", "", "A level cell index must be a JSON object.");
    return finish(ctx, null);
  }
  if (raw.schema !== LEVEL_CELL_INDEX_SCHEMA) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${LEVEL_CELL_INDEX_SCHEMA}".`);
    return finish(ctx, null);
  }
  if (!isId(raw.level, "level")) {
    reportFatal(ctx, "invalid-document", "level", "A level cell index needs the id of its level.");
    return finish(ctx, null);
  }
  if (!isRevision(raw.persistent)) {
    reportFatal(ctx, "invalid-document", "persistent", "A level cell index needs the revision of level.json.");
    return finish(ctx, null);
  }

  const cells: Record<string, string> = {};
  if (isJsonObject(raw.cells)) {
    const keys = Object.keys(raw.cells);
    for (const key of keys) {
      const path = childPath("cells", key);
      const revision = raw.cells[key];
      if (!isCellKey(key)) {
        reportLoss(ctx, "invalid-value", path, 'Expected a "<x>_<z>" cell key; entry dropped.');
      } else if (!isRevision(revision)) {
        reportLoss(ctx, "invalid-value", path, "Expected a file revision (16 hex digits); entry dropped.");
      }
    }
    for (const key of keys.filter(isCellKey).sort(compareCellKeys)) {
      const revision = raw.cells[key];
      if (isRevision(revision)) cells[key] = revision;
    }
  } else if (raw.cells !== undefined) {
    reportLoss(ctx, "invalid-value", "cells", "Expected a map of cell revisions; none kept.");
  }

  const value: LevelCellIndexDoc = {
    schema: LEVEL_CELL_INDEX_SCHEMA,
    level: raw.level,
    persistent: raw.persistent,
    cells,
  };
  reportUnknownKeys(raw, INDEX_KEYS, "", ctx, "A level cell index has no such field; dropped.");
  return finish(ctx, value);
}
