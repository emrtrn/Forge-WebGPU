// Disk-independent inputs: the same real registry and asset index as authoring.
import { posix } from "node:path";
import { readFile } from "node:fs/promises";
import {
  CELL_INDEX_FILE, LEVEL_FILE, cellFileOf, mergeLevelParts, normalizeLevel,
  normalizeLevelCell, normalizeLevelCellIndex, splitLevel,
  type AssetIndex, type ContentFile, type LevelCellDoc, type LevelDoc, type SchemaRegistry,
} from "../../src/core/index.ts";
import { hlodPlacementsOf, type HlodPlacement } from "../../src/engine/world/hlod.ts";
import type { ContentRoot } from "../assets/scan.ts";
import { resolveProjectPath } from "../server/projectPaths.ts";

export interface HlodBuildIO {
  /** Virtual content path (encoded root label + root-relative path); null if missing. */
  read(path: string): Promise<Uint8Array | null>;
}

export interface HlodInput {
  readonly files: readonly ContentFile[];
  readonly index: AssetIndex;
  readonly registry: SchemaRegistry;
  readonly io: HlodBuildIO;
}

export function diskHlodInput(files: readonly ContentFile[], index: AssetIndex, registry: SchemaRegistry, roots: readonly ContentRoot[]): HlodInput {
  const directories = new Map(roots.map((root) => [encodeURIComponent(root.label), root.dir]));
  return { files, index, registry, io: { async read(path) {
    const safe = resourcePath(path), slash = safe.indexOf("/");
    const root = directories.get(safe.slice(0, slash));
    if (!root || slash < 0) throw new Error(`Unknown content root: ${path}`);
    try { return await readFile(resolveProjectPath(root, safe.slice(slash + 1))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  } } };
}

export function contentPath(file: Pick<ContentFile, "root" | "path">): string {
  return `${encodeURIComponent(file.root)}${file.path ? `/${file.path}` : ""}`;
}

/** Resource traversal may stay in its content root, never escape to another root or URL. */
export function resourcePath(path: string): string {
  const input = path.replaceAll("\\", "/");
  if (input.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(input) || input.includes("\0")) {
    throw new Error(`Path escapes content root: ${path}`);
  }
  const normalized = posix.normalize(input);
  if (normalized === ".." || normalized.startsWith("../")) throw new Error(`Path escapes content root: ${path}`);
  return normalized;
}

export function loadHlodLevel(folder: string, input: HlodInput): LevelDoc {
  const files = new Map(input.files.map((file) => [contentPath(file), file]));
  const options = { strict: true, registry: input.registry, resolveClass: input.index.resolveClass };
  const json = (relative: string): unknown => {
    const file = files.get(`${folder}/${relative}`);
    if (!file) throw new Error(`Missing level resource: ${folder}/${relative}`);
    if (file.parseError) throw new Error(`${relative}: ${file.parseError}`);
    return file.json;
  };
  const level = normalizeLevel(json(LEVEL_FILE), options);
  if (!level.ok || !level.value) throw new Error(`${LEVEL_FILE}: ${level.issues.map((issue) => issue.message).join("; ")}`);
  const cells: LevelCellDoc[] = [];
  if (files.has(`${folder}/${CELL_INDEX_FILE}`)) {
    const index = normalizeLevelCellIndex(json(CELL_INDEX_FILE), options);
    if (!index.ok || !index.value || index.value.level !== level.value.id) throw new Error(`Invalid ${CELL_INDEX_FILE}`);
    for (const key of Object.keys(index.value.cells)) {
      const cell = normalizeLevelCell(json(cellFileOf(key)), options);
      if (!cell.ok || !cell.value || cell.value.cell !== key) throw new Error(`Invalid ${cellFileOf(key)}`);
      cells.push(cell.value);
    }
  }
  const merged = mergeLevelParts(level.value, cells, options);
  if (!merged.ok) throw new Error(merged.issues.map((issue) => `${issue.file}: ${issue.message}`).join("; "));
  return merged.value.level;
}

/** Persistent actors remain loaded and need no cell proxy. Classes and parent chains are resolved. */
export function hlodCellsOf(level: LevelDoc, input: Pick<HlodInput, "registry" | "index">): Map<string, HlodPlacement[]> {
  const lookup = new Map(level.actors.map((actor) => [actor.id, actor]));
  const options = { strict: true, registry: input.registry, resolveClass: input.index.resolveClass };
  const split = splitLevel(level, options);
  if (split.issues.some((issue) => issue.severity === "error")) throw new Error("Cannot assign HLOD cells");
  return new Map(split.cells.map((cell) => [cell.cell,
    hlodPlacementsOf(cell.actors, (id) => lookup.get(id), input.index.resolveClass)]));
}

/** Every landmark placement of the level, persistent actors included (plan 5c R8.4). */
export function hlodLandmarksOf(level: LevelDoc, input: Pick<HlodInput, "index">): HlodPlacement[] {
  const lookup = new Map(level.actors.map((actor) => [actor.id, actor]));
  return hlodPlacementsOf(level.actors, (id) => lookup.get(id), input.index.resolveClass).filter((placement) => placement.landmark === true);
}
