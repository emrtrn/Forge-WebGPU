// Levels in the asset index (architecture §4.4, §4.6; decisions A10, A11).
//
// A level is a folder: `level.json` (its identity and persistent layer),
// `cells.json` (the index) and `cells/<x>_<z>.json`. The index names the set
// of files that belong together: a cell file it does not list is left out (a
// save that did not finish, or a copied file), a cell it lists must exist.
//
// This pass sees every file of a level at once, so it checks what a running
// game or a streaming editor cannot: ids and singletons across files, actors
// in the wrong cell, and actor references with no target anywhere in the
// level. At runtime "not loaded yet" is a valid state for an actor reference;
// here a reference to an actor in no file is dangling, an error in
// development like a dangling asset reference.
//
// Revisions: the reader that has the bytes (`tools/assets`) puts each file's
// revision on it; this pass compares them with the index. A file that does
// not match was written after the index (a save that did not finish) or
// edited by hand; it is still read, and reported.

import type { LevelId } from "../id.ts";
import type { ClassResolver } from "../level/actorClass.ts";
import {
  CELL_INDEX_FILE,
  CELLS_DIR,
  cellFileOf,
  cellKeyOfFile,
  LEVEL_FILE,
  normalizeLevelCell,
  normalizeLevelCellIndex,
} from "../level/cellDocs.ts";
import { compareCellKeys } from "../level/cells.ts";
import { FOLIAGE_DIR, FOLIAGE_INDEX_FILE, foliageCellFileOf, normalizeLevelFoliageIndex } from "../level/foliage.ts";
import { HLOD_INDEX_FILE, HLOD_DIR, HLOD_LANDMARK_FILE, hlodCellFileOf, hlodClusterFileOf, normalizeHlodIndex } from "../level/hlod.ts";
import { mergeLevelParts } from "../level/levelParts.ts";
import type { LevelCellDoc, LevelCellIndexDoc } from "../level/model.ts";
import { normalizeLevel } from "../level/normalizeLevel.ts";
import { childPath, createContext, reportLoss, type NormalizeContext } from "../schema/issues.ts";
import type { AssetReference } from "./assetIndex.ts";
import { fileLabel, withFile, type AssetEntry, type AssetIndexOptions, type ContentFile, type FileIssue } from "./identity.ts";
import { actorReferences, levelReferences, type FoundReference } from "./references.ts";

export interface LevelFolder {
  readonly level: LevelId;
  readonly root: string;
  /** Folder of `level.json` inside the root; "" when it is at the root. */
  readonly folder: string;
  /** The normalised index; null when the level has none (a level with no cells). */
  readonly index: LevelCellIndexDoc | null;
  /** Cells that are listed in the index and present, in cell order. */
  readonly cells: readonly string[];
}

/** `a/b/level.json` -> `a/b`; null when the file is not named `level.json`. */
export function levelFolderOf(path: string): string | null {
  if (path === LEVEL_FILE) return "";
  return path.endsWith(`/${LEVEL_FILE}`) ? path.slice(0, -LEVEL_FILE.length - 1) : null;
}

/** The level folder a cell or index file would belong to, by its path. */
export function partFolderOf(path: string): string | null {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const parent = slash < 0 ? "" : path.slice(0, slash);
  if (name === CELL_INDEX_FILE || name === HLOD_INDEX_FILE || name === FOLIAGE_INDEX_FILE) return parent;
  for (const dir of [CELLS_DIR, HLOD_DIR, FOLIAGE_DIR]) {
    if (parent === dir) return "";
    if (parent.endsWith(`/${dir}`)) return parent.slice(0, -dir.length - 1);
  }
  return null;
}

/** `<folder>/<relative>`; at the root, just `<relative>`. */
function inFolder(folder: string, relative: string): string {
  return folder === "" ? relative : `${folder}/${relative}`;
}

/** Part files grouped by `<root>\0<folder>`. */
export function groupLevelParts(parts: readonly ContentFile[]): Map<string, ContentFile[]> {
  const groups = new Map<string, ContentFile[]>();
  for (const file of parts) {
    const folder = partFolderOf(file.path);
    const key = `${file.root}\0${folder ?? `\0${file.path}`}`;
    const group = groups.get(key);
    if (group) group.push(file);
    else groups.set(key, [file]);
  }
  return groups;
}

export function levelGroupKey(root: string, folder: string): string {
  return `${root}\0${folder}`;
}

/** Part files that no level claimed. */
export function reportOrphanParts(files: readonly ContentFile[], options: AssetIndexOptions): FileIssue[] {
  const issues: FileIssue[] = [];
  for (const file of files) {
    const ctx = createContext(options);
    reportLoss(ctx, "orphan-part", "", "A level cell or cell index outside a level folder (no level.json next to it); left out.");
    withFile(fileLabel(file.root, file.path), ctx.issues, issues);
  }
  return issues;
}

export interface LevelPassResult {
  readonly folder: LevelFolder | null;
  readonly references: AssetReference[];
  readonly issues: FileIssue[];
}

/**
 * Normalises a level and its parts, merges them and collects their asset
 * references. `parts` are the cell and index files of the level's folder.
 */
export function indexLevelFolder(
  level: { readonly entry: AssetEntry; readonly json: unknown; readonly revision?: string },
  parts: readonly ContentFile[],
  options: AssetIndexOptions & { readonly resolveClass: ClassResolver },
): LevelPassResult {
  const { entry, json } = level;
  const { registry, resolveClass } = options;
  const levelFile = fileLabel(entry.root, entry.path);
  const issues: FileIssue[] = [];
  const references: AssetReference[] = [];
  const add = (file: string, found: readonly FoundReference[]): void => {
    for (const reference of found) references.push({ ...reference, from: entry.id, file });
  };

  const loaded = normalizeLevel(json, options);
  withFile(levelFile, loaded.issues, issues);
  const persistent = loaded.value;
  if (!persistent) return { folder: null, references, issues };
  add(levelFile, levelReferences(registry, persistent, resolveClass));

  const folder = levelFolderOf(entry.path);
  if (folder === null) {
    const ctx = createContext(options);
    reportLoss(ctx, "invalid-document", "", `A level is a folder: its document must be named ${LEVEL_FILE}. Its cells are not read.`);
    withFile(levelFile, ctx.issues, issues);
    return { folder: null, references, issues };
  }

  const label = (relative: string): string => fileLabel(entry.root, inFolder(folder, relative));
  const report = (relative: string, fill: (ctx: NormalizeContext) => void): void => {
    const ctx = createContext(options);
    fill(ctx);
    withFile(label(relative), ctx.issues, issues);
  };

  const hlodPath = inFolder(folder, HLOD_INDEX_FILE);
  const hlodFile = parts.find((file) => file.path === hlodPath);
  const hlod = hlodFile ? normalizeHlodIndex(hlodFile.json, options) : null;
  if (hlodFile?.parseError) report(HLOD_INDEX_FILE, (ctx) =>
    reportLoss(ctx, "invalid-document", "", `Not valid JSON: ${hlodFile.parseError}`));
  if (hlod) withFile(label(HLOD_INDEX_FILE), hlod.issues, issues);
  if (hlod?.value && hlod.value.level !== persistent.id) report(HLOD_INDEX_FILE, (ctx) =>
    reportLoss(ctx, "invalid-value", "level", `The HLOD index belongs to level ${hlod.value!.level}.`));
  if (hlod?.value && hlod.value.cellSize !== persistent.settings.cellSize) report(HLOD_INDEX_FILE, (ctx) =>
    reportLoss(ctx, "invalid-value", "cellSize", "HLOD cellSize differs from the level's cellSize; rebuild HLOD."));
  const proxyPaths = new Set([
    ...(hlod?.value?.cells ?? []).map((cell) => inFolder(folder, hlodCellFileOf(cell.key))),
    ...(hlod?.value?.clusters ?? []).map((cluster) => inFolder(folder, hlodClusterFileOf(cluster.key))),
    ...(hlod?.value?.landmarks ? [inFolder(folder, HLOD_LANDMARK_FILE)] : []),
  ]);
  const partPaths = new Set(parts.map((file) => file.path));
  for (const path of proxyPaths) if (!partPaths.has(path)) report(HLOD_INDEX_FILE, (ctx) =>
    reportLoss(ctx, "dangling-reference", "cells", `The HLOD proxy ${path} is missing.`));
  for (const file of parts) {
    if (!file.path.startsWith(inFolder(folder, `${HLOD_DIR}/`))) continue;
    if (!proxyPaths.has(file.path)) report(file.path.slice(folder ? folder.length + 1 : 0), (ctx) =>
      reportLoss(ctx, "orphan-part", "", "The HLOD proxy is not listed in hlod.json."));
  }

  // Painted foliage (phase 5c decision 4): index, cell files and the types they name.
  const foliagePath = inFolder(folder, FOLIAGE_INDEX_FILE);
  const foliageFile = parts.find((file) => file.path === foliagePath);
  const foliage = foliageFile ? normalizeLevelFoliageIndex(foliageFile.json, options) : null;
  if (foliageFile?.parseError) report(FOLIAGE_INDEX_FILE, (ctx) =>
    reportLoss(ctx, "invalid-document", "", `Not valid JSON: ${foliageFile.parseError}`));
  if (foliage) withFile(label(FOLIAGE_INDEX_FILE), foliage.issues, issues);
  if (foliage?.value && foliage.value.level !== persistent.id) report(FOLIAGE_INDEX_FILE, (ctx) =>
    reportLoss(ctx, "invalid-value", "level", `The foliage index belongs to level ${foliage.value!.level}.`));
  if (foliage?.value && foliage.value.cellSize !== persistent.settings.cellSize) report(FOLIAGE_INDEX_FILE, (ctx) =>
    reportLoss(ctx, "invalid-value", "cellSize", "Foliage cellSize differs from the level's cellSize; re-save the foliage."));
  if (foliage?.value) add(label(FOLIAGE_INDEX_FILE), foliage.value.types.map((target, index) => ({
    path: `types[${index}]`, target, assetType: "forge.foliageType", via: "field" as const,
  })));
  const foliageCellPaths = new Set((foliage?.value?.cells ?? []).map((cell) => inFolder(folder, foliageCellFileOf(cell.key))));
  for (const path of foliageCellPaths) if (!partPaths.has(path)) report(FOLIAGE_INDEX_FILE, (ctx) =>
    reportLoss(ctx, "dangling-reference", "cells", `The foliage cell ${path} is missing.`));
  for (const file of parts) {
    if (!file.path.startsWith(inFolder(folder, `${FOLIAGE_DIR}/`))) continue;
    if (!foliageCellPaths.has(file.path)) report(file.path.slice(folder ? folder.length + 1 : 0), (ctx) =>
      reportLoss(ctx, "orphan-part", "", "The foliage cell is not listed in foliage.json."));
  }

  // The index.
  let index: LevelCellIndexDoc | null = null;
  const indexPath = inFolder(folder, CELL_INDEX_FILE);
  const indexFile = parts.find((file) => file.path === indexPath);
  if (indexFile) {
    const normalized = normalizeLevelCellIndex(indexFile.json, options);
    withFile(label(CELL_INDEX_FILE), normalized.issues, issues);
    if (normalized.value && normalized.value.level !== persistent.id) {
      report(CELL_INDEX_FILE, (ctx) =>
        reportLoss(ctx, "invalid-value", "level", `The index belongs to level ${normalized.value!.level}; ignored.`),
      );
    } else {
      index = normalized.value;
    }
  }

  const checkRevision = (given: string | undefined, listed: string, path: string, file: string): void => {
    if (given === undefined || given === listed) return;
    report(CELL_INDEX_FILE, (ctx) =>
      reportLoss(
        ctx,
        "revision-mismatch",
        path,
        `${file} is not the file the index was written with (a save that did not finish, or an edit by hand). Re-save the level.`,
      ),
    );
  };
  if (index) checkRevision(level.revision, index.persistent, "persistent", LEVEL_FILE);

  // The cells: named right, listed in the index, of this level.
  const cells: LevelCellDoc[] = [];
  const present = new Set<string>();
  for (const file of parts) {
    if (file.path === indexPath || file.path === hlodPath || file.path.startsWith(inFolder(folder, `${HLOD_DIR}/`))) continue;
    if (file.path === foliagePath || file.path.startsWith(inFolder(folder, `${FOLIAGE_DIR}/`))) continue;
    const relative = folder === "" ? file.path : file.path.slice(folder.length + 1);
    const key = cellKeyOfFile(relative);
    if (key === null) {
      report(relative, (ctx) =>
        reportLoss(ctx, "orphan-part", "", `A cell file is named ${cellFileOf("<x>_<z>")}; left out.`),
      );
      continue;
    }
    const normalized = normalizeLevelCell(file.json, options);
    withFile(label(relative), normalized.issues, issues);
    const cell = normalized.value;
    if (!cell) continue;
    present.add(key);
    if (cell.cell !== key) {
      report(relative, (ctx) =>
        reportLoss(ctx, "invalid-value", "cell", `The file name says cell ${key}, the file says ${cell.cell}; left out.`),
      );
    } else if (!index || !Object.hasOwn(index.cells, key)) {
      report(relative, (ctx) =>
        reportLoss(
          ctx,
          "orphan-part",
          "",
          `The cell is not listed in ${CELL_INDEX_FILE} (a save that did not finish, or a copied file); left out.`,
        ),
      );
    } else {
      checkRevision(file.revision, index.cells[key]!, childPath("cells", key), relative);
      cells.push(cell);
    }
  }
  for (const key of Object.keys(index?.cells ?? {})) {
    if (present.has(key)) continue;
    report(CELL_INDEX_FILE, (ctx) =>
      reportLoss(ctx, "dangling-reference", childPath("cells", key), `The cell file ${cellFileOf(key)} is missing.`),
    );
  }

  // The whole level.
  const merged = mergeLevelParts(persistent, cells, options);
  for (const issue of merged.issues) {
    const { file, ...rest } = issue;
    issues.push({ ...rest, file: label(file) });
  }
  for (const cell of cells) {
    add(label(cellFileOf(cell.cell)), levelReferences(registry, cell, resolveClass));
  }

  // Actor references: the target must be in some file of the level.
  const actorIds = new Set(merged.value.level.actors.map((actor) => actor.id));
  const checkActorRefs = (relative: string, actors: LevelCellDoc["actors"]): void => {
    const dangling = actorReferences(registry, { actors }, resolveClass).filter((found) => !actorIds.has(found.target));
    if (dangling.length === 0) return;
    report(relative, (ctx) => {
      for (const found of dangling) {
        reportLoss(ctx, "dangling-reference", found.path, `Actor ${found.target} is in no file of this level.`);
      }
    });
  };
  checkActorRefs(LEVEL_FILE, persistent.actors);
  for (const cell of cells) checkActorRefs(cellFileOf(cell.cell), cell.actors);

  return {
    folder: {
      level: persistent.id,
      root: entry.root,
      folder,
      index,
      cells: merged.value.cells.filter((key) => present.has(key)).sort(compareCellKeys),
    },
    references,
    issues,
  };
}
