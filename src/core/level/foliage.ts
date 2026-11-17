// Level-owned painted foliage (phase 5c decision 4): `foliage.json` lists, per
// World Partition cell, how many instances of each Foliage Type its
// `foliage/<x>_<z>.bin` holds (`foliageCells.ts`). A level part like HLOD's:
// committed with the level, not an asset; the cell streams with its actors.
import { isId, type AssetId, type LevelId } from "../id.ts";
import { isJsonObject } from "../json.ts";
import { compareCellKeys, isCellKey } from "./cells.ts";
import { reportUnknownKeys } from "./normalizeLevel.ts";
import { createContext, finish, reportFatal, reportLoss, type NormalizeOptions, type NormalizeResult } from "../schema/issues.ts";

export const LEVEL_FOLIAGE_SCHEMA = "forge.levelFoliage/1";
export const FOLIAGE_INDEX_FILE = "foliage.json";
export const FOLIAGE_DIR = "foliage";

/** Cell file path relative to the level folder, like cellFileOf. */
export function foliageCellFileOf(key: string): string {
  return `${FOLIAGE_DIR}/${key}.bin`;
}

export interface LevelFoliageCellEntry {
  readonly key: string;
  /** Instances per entry of the index's `types`, same order. */
  readonly counts: readonly number[];
}

export interface LevelFoliageIndex {
  readonly schema: typeof LEVEL_FOLIAGE_SCHEMA;
  readonly level: LevelId;
  readonly cellSize: number;
  /** `forge.foliageType` assets, ascending. */
  readonly types: readonly AssetId[];
  /** Sorted by compareCellKeys (z, then x); each has at least one instance. */
  readonly cells: readonly LevelFoliageCellEntry[];
}

/** Null for an unreadable document; invalid entries are dropped with loss issues. */
export function normalizeLevelFoliageIndex(
  value: unknown,
  options: NormalizeOptions = { strict: true },
): NormalizeResult<LevelFoliageIndex | null> {
  const ctx = createContext(options);
  if (!isJsonObject(value)) {
    reportFatal(ctx, "invalid-document", "", "A foliage index must be a JSON object.");
    return finish(ctx, null);
  }
  if (value.schema !== LEVEL_FOLIAGE_SCHEMA) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${LEVEL_FOLIAGE_SCHEMA}".`);
    return finish(ctx, null);
  }
  if (!isId(value.level, "level")) {
    reportFatal(ctx, "invalid-document", "level", "A foliage index needs the id of its level.");
    return finish(ctx, null);
  }
  if (typeof value.cellSize !== "number" || !Number.isFinite(value.cellSize) || value.cellSize <= 0) {
    reportFatal(ctx, "invalid-document", "cellSize", "Expected a finite positive cell size.");
    return finish(ctx, null);
  }
  if (!Array.isArray(value.types) || !Array.isArray(value.cells)) {
    reportFatal(ctx, "invalid-document", Array.isArray(value.types) ? "cells" : "types", "Expected an array.");
    return finish(ctx, null);
  }
  // A dropped type would shift every cell's counts: the document is unreadable instead.
  const types = value.types;
  for (const [index, type] of types.entries()) {
    if (!isId(type, "asset")) {
      reportFatal(ctx, "invalid-document", `types[${index}]`, "Expected a foliage type asset id.");
      return finish(ctx, null);
    }
    if (types.indexOf(type) !== index) {
      reportFatal(ctx, "invalid-document", `types[${index}]`, "Duplicate foliage type.");
      return finish(ctx, null);
    }
  }
  const cells: LevelFoliageCellEntry[] = [];
  const seen = new Set<string>();
  for (const [index, cell] of value.cells.entries()) {
    const path = `cells[${index}]`;
    if (!isJsonObject(cell)) {
      reportLoss(ctx, "invalid-value", path, "Expected a foliage cell object; entry dropped.");
    } else if (!isCellKey(cell.key)) {
      reportLoss(ctx, "invalid-value", `${path}.key`, 'Expected a "<x>_<z>" cell key; entry dropped.');
    } else if (seen.has(cell.key)) {
      reportLoss(ctx, "duplicate-id", `${path}.key`, "Duplicate foliage cell key; entry dropped.");
    } else if (!Array.isArray(cell.counts) || cell.counts.length !== types.length
      || !cell.counts.every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0)) {
      reportLoss(ctx, "invalid-value", `${path}.counts`, "Expected one non-negative safe integer per type; entry dropped.");
    } else if (!cell.counts.some((count) => (count as number) > 0)) {
      reportLoss(ctx, "invalid-value", `${path}.counts`, "A listed cell has at least one instance; entry dropped.");
    } else {
      seen.add(cell.key);
      cells.push({ key: cell.key, counts: cell.counts as number[] });
      reportUnknownKeys(cell, ["key", "counts"], path, ctx, "Unknown foliage cell field; dropped.");
    }
  }
  cells.sort((a, b) => compareCellKeys(a.key, b.key));
  if ([...types].sort().some((type, index) => type !== types[index])) {
    reportLoss(ctx, "invalid-value", "types", "Foliage types are written in ascending order; rewrite the index.");
  }
  reportUnknownKeys(value, ["schema", "level", "cellSize", "types", "cells"], "", ctx, "Unknown foliage index field; dropped.");
  return finish(ctx, { schema: LEVEL_FOLIAGE_SCHEMA, level: value.level, cellSize: value.cellSize, types: types as AssetId[], cells });
}
