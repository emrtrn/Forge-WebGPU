// Level-owned HLOD documents; shared by the asset index and the engine.
import { isId, type LevelId } from '../id.ts';
import { isJsonObject } from '../json.ts';
import { compareCellKeys, isCellKey } from './cells.ts';
import { reportUnknownKeys } from './normalizeLevel.ts';
import { createContext, finish, reportFatal, reportLoss, type NormalizeOptions, type NormalizeResult } from '../schema/issues.ts';

export const HLOD_SCHEMA = "forge.levelHlod/1";
export const HLOD_INDEX_FILE = "hlod.json";
export const HLOD_DIR = "hlod";

/** Proxy path relative to the level folder, like cellFileOf. */
export function hlodCellFileOf(key: string): string {
  return `${HLOD_DIR}/${key}.glb`;
}

export interface HlodCellEntry {
  readonly key: string;
  readonly triangles: number;
  readonly sourceHash: string;
}

export interface HlodIndex {
  readonly schema: typeof HLOD_SCHEMA;
  readonly level: LevelId;
  readonly cellSize: number;
  /** Sorted by compareCellKeys (z, then x). */
  readonly cells: readonly HlodCellEntry[];
}

/** Null for an unreadable document; invalid entries are dropped with loss issues. */
export function normalizeHlodIndex(
  value: unknown,
  options: NormalizeOptions = { strict: true },
): NormalizeResult<HlodIndex | null> {
  const ctx = createContext(options);
  if (!isJsonObject(value)) {
    reportFatal(ctx, "invalid-document", "", "An HLOD index must be a JSON object.");
    return finish(ctx, null);
  }
  if (value.schema !== HLOD_SCHEMA) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${HLOD_SCHEMA}".`);
    return finish(ctx, null);
  }
  if (!isId(value.level, "level")) {
    reportFatal(ctx, "invalid-document", "level", "An HLOD index needs the id of its level.");
    return finish(ctx, null);
  }
  if (typeof value.cellSize !== "number" || !Number.isFinite(value.cellSize) || value.cellSize <= 0) {
    reportFatal(ctx, "invalid-document", "cellSize", "Expected a finite positive cell size.");
    return finish(ctx, null);
  }
  if (!Array.isArray(value.cells)) {
    reportFatal(ctx, "invalid-document", "cells", "Expected an array of HLOD cells.");
    return finish(ctx, null);
  }
  const cells: HlodCellEntry[] = [];
  const seen = new Set<string>();
  for (const [index, cell] of value.cells.entries()) {
    const path = `cells[${index}]`;
    if (!isJsonObject(cell)) {
      reportLoss(ctx, "invalid-value", path, "Expected an HLOD cell object; entry dropped.");
    } else if (!isCellKey(cell.key)) {
      reportLoss(ctx, "invalid-value", `${path}.key`, 'Expected a "<x>_<z>" cell key; entry dropped.');
    } else if (seen.has(cell.key)) {
      reportLoss(ctx, "duplicate-id", `${path}.key`, "Duplicate HLOD cell key; entry dropped.");
    } else if (typeof cell.triangles !== "number" || !Number.isSafeInteger(cell.triangles) || cell.triangles < 0) {
      reportLoss(ctx, "invalid-value", `${path}.triangles`, "Expected a non-negative safe integer; entry dropped.");
    } else if (typeof cell.sourceHash !== "string" || cell.sourceHash.length !== 8 || !/^[0-9a-f]{8}$/.test(cell.sourceHash)) {
      reportLoss(ctx, "invalid-value", `${path}.sourceHash`, "Expected 8 lowercase hex digits; entry dropped.");
    } else {
      seen.add(cell.key);
      cells.push({ key: cell.key, triangles: cell.triangles, sourceHash: cell.sourceHash });
      reportUnknownKeys(cell, ["key", "triangles", "sourceHash"], path, ctx, "Unknown HLOD cell field; dropped.");
    }
  }
  cells.sort((a, b) => compareCellKeys(a.key, b.key));
  reportUnknownKeys(value, ["schema", "level", "cellSize", "cells"], "", ctx, "Unknown HLOD index field; dropped.");
  return finish(ctx, { schema: HLOD_SCHEMA, level: value.level, cellSize: value.cellSize, cells });
}

