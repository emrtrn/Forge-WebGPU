// Writes a built world into a project through the save service (plan 2b
// `tools/world`; architecture §4.6): one atomic save, each file with the
// revision it had, documents checked and written canonically, the level's
// cell index written by the service. Binaries (terrain tiles, global map) go
// through the staged channel.
//
// A level folder that exists is replaced only with `force`: its level id stays
// (so references to the level hold) and the files the build owns that it no
// longer writes are deleted (old cells, old terrain files). Anything else in
// the folder (the brief, a reference image) is left alone.

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CELL_INDEX_FILE,
  CELLS_DIR,
  cellFileOf,
  LEVEL_FILE,
  normalizeLevel,
  splitLevel,
  stringifyDocument,
  type LevelDoc,
} from "../../src/core/index.ts";
import type { WorldLevel } from "../../src/engine/worldbuilder/build/worldLevel.ts";
import { fileRevision } from "../assets/revision.ts";
import { createDocumentCheck, createClassStore } from "../save/documentCheck.ts";
import { createSaveService, type SaveDelete, type SaveWrite } from "../save/transaction.ts";
import { createWritePolicy } from "../server/projectPaths.ts";
import type { WorldProject } from "./worldProject.ts";

export interface WorldFiles {
  /** Project-relative level folder, e.g. `content/levels/valley`. */
  readonly folder: string;
  readonly level: WorldLevel;
  /** Terrain tiles by key, and the global map. */
  readonly tileBytes: ReadonlyMap<string, Uint8Array>;
  readonly globalBytes: Uint8Array;
  /** Other text files to write, folder-relative (the recipe and terrain documents are added here). */
  readonly texts?: ReadonlyArray<{ readonly path: string; readonly text: string }>;
}

export interface WorldWriteResult {
  /** Project-relative paths written, the cell index included. */
  readonly written: string[];
  readonly removed: string[];
}

/** Files of the folder the build owns: the level, its cells and index, the terrain folder, the recipe. */
function ownedByBuild(relative: string): boolean {
  return relative === LEVEL_FILE || relative === CELL_INDEX_FILE || relative.startsWith(`${CELLS_DIR}/`)
    || relative.startsWith("terrain/") || relative.endsWith(".worldrecipe.json");
}

async function listFiles(dir: string, relative = ""): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(dir, relative), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(dir, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/**
 * Writes or deletes single project files through the save service (the random
 * world's brief). `base` is the revision read, null for a new file.
 */
export async function commitFiles(
  project: Pick<WorldProject, "root" | "manifest" | "registry">,
  writes: readonly SaveWrite[],
  deletes: readonly SaveDelete[] = [],
): Promise<void> {
  const service = createSaveService({
    policy: createWritePolicy(project.root, project.manifest.contentRoots),
    check: createDocumentCheck(project.registry, createClassStore(project.root, project.registry, { entries: new Map(), resolveClass: () => undefined })),
  });
  const result = await service.commit({ writes, deletes });
  if (result.status === "conflict") throw new Error(`files changed meanwhile: ${result.conflicts.map((conflict) => conflict.path).join(", ")}`);
  if (result.status === "rejected") {
    throw new Error(`the save refused it (${result.reason}): ${result.issues.map((issue) => `${issue.file} ${issue.path} ${issue.message}`.trim()).join("; ")}`);
  }
}

/** Revision of a project file, or null when it does not exist. */
export async function projectFileRevision(projectRoot: string, path: string): Promise<string | null> {
  try {
    return fileRevision(await readFile(join(projectRoot, path)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Splits, normalises and writes the level and its files. Throws with the save's issues when it is refused. */
export async function writeWorld(project: WorldProject, files: WorldFiles): Promise<WorldWriteResult> {
  const { folder, level } = files;
  const absoluteFolder = join(project.root, folder);
  const options = { strict: true, registry: project.registry, resolveClass: project.index.resolveClass };
  const normalized = normalizeLevel(level.level, options);
  if (!normalized.value || !normalized.ok) {
    throw new Error(`the built level is not valid: ${normalized.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
  }
  const split = splitLevel(normalized.value as LevelDoc, options);
  if (split.issues.length) throw new Error(`the built level does not split into cells: ${split.issues.map((issue) => issue.message).join("; ")}`);

  const texts = new Map<string, string>();
  texts.set(LEVEL_FILE, stringifyDocument(split.persistent));
  for (const cell of split.cells) texts.set(cellFileOf(cell.cell), stringifyDocument(cell));
  texts.set(level.terrainFile, stringifyDocument(level.terrain));
  for (const { path, text } of files.texts ?? []) texts.set(path, text);
  const stem = level.terrainFile.slice(0, -".terrain.json".length);
  const binaries = new Map<string, Uint8Array>();
  for (const [key, bytes] of files.tileBytes) binaries.set(`${stem}.tiles/${key}.tile.bin`, bytes);
  binaries.set(`${stem}.global.bin`, files.globalBytes);

  const existing = await listFiles(absoluteFolder);
  const revisionOf = async (relative: string): Promise<string | null> =>
    existing.includes(relative) ? fileRevision(await readFile(join(absoluteFolder, relative))) : null;

  const staging = await mkdtemp(join(project.root, ".forge-staging-world-"));
  try {
    const writes: SaveWrite[] = [];
    for (const [relative, text] of texts) writes.push({ path: `${folder}/${relative}`, base: await revisionOf(relative), text });
    let staged = 0;
    for (const [relative, bytes] of binaries) {
      const file = join(staging, `${(staged += 1)}.bin`);
      await writeFile(file, bytes);
      writes.push({ path: `${folder}/${relative}`, base: await revisionOf(relative), staged: file });
    }
    const keep = new Set([...texts.keys(), ...binaries.keys()]);
    const deletes: SaveDelete[] = [];
    for (const relative of existing) {
      if (relative === CELL_INDEX_FILE || keep.has(relative) || !ownedByBuild(relative)) continue;
      deletes.push({ path: `${folder}/${relative}`, base: fileRevision(await readFile(join(absoluteFolder, relative))) });
    }

    const service = createSaveService({
      policy: createWritePolicy(project.root, project.manifest.contentRoots),
      check: createDocumentCheck(project.registry, createClassStore(project.root, project.registry, project.index)),
    });
    const result = await service.commit({ writes, deletes });
    if (result.status === "conflict") {
      throw new Error(`files changed while the world was built: ${result.conflicts.map((conflict) => conflict.path).join(", ")}`);
    }
    if (result.status === "rejected") {
      throw new Error(`the save refused the world (${result.reason}): ${result.issues.map((issue) => `${issue.file} ${issue.path} ${issue.message}`.trim()).join("; ")}`);
    }
    return {
      written: result.files.filter((file) => file.revision !== null).map((file) => file.path),
      removed: result.files.filter((file) => file.revision === null).map((file) => file.path),
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
