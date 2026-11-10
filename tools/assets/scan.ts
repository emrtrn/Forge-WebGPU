// Reads content roots from disk into the file list the core asset index takes
// (architecture §4.6, A10). Core never touches the disk; this is the Node side.
//
// - Every `.json` file is read and parsed; a parse failure is kept on the file
//   so the index reports it. Its revision (hash of the bytes) is put on it, so
//   the index can check a level's files against `cells.json`. Other files are
//   listed, not read.
// - Names starting with "." (`.forge-cache`, `.git`, editor droppings) are
//   skipped, files and folders alike.
// - A root that does not exist is listed as missing, not an error: a project
//   may have no samples, and the engine repo has no content yet.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ContentFile } from "../../src/core/index.ts";
import { fileRevision } from "./revision.ts";

export interface ScanResult {
  /** Roots that exist, in the order given. */
  readonly roots: readonly string[];
  /** Roots that do not exist. */
  readonly missing: readonly string[];
  /** Files in root order, then path order. */
  readonly files: readonly ContentFile[];
}

function normalizeRoot(root: string): string {
  return root.replaceAll("\\", "/").replace(/\/+$/, "");
}

/** Roots must not contain one another: a file would be indexed twice. */
function checkRoots(roots: readonly string[]): void {
  for (const a of roots) {
    for (const b of roots) {
      if (a !== b && b.startsWith(`${a}/`)) {
        throw new Error(`Content roots must not nest: "${b}" is inside "${a}".`);
      }
    }
  }
  if (new Set(roots).size !== roots.length) throw new Error("A content root is listed twice.");
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** `roots` are relative to `projectRoot`, with forward slashes. */
export async function scanContentRoots(projectRoot: string, roots: readonly string[]): Promise<ScanResult> {
  const normalized = roots.map(normalizeRoot);
  checkRoots(normalized);
  const present: string[] = [];
  const missing: string[] = [];
  const files: ContentFile[] = [];
  for (const root of normalized) {
    const absolute = join(projectRoot, root);
    if (!(await isDirectory(absolute))) {
      missing.push(root);
      continue;
    }
    present.push(root);
    await walk(absolute, "", root, files);
  }
  return { roots: present, missing, files };
}

async function walk(directory: string, relative: string, root: string, out: ContentFile[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute, path, root, out);
    } else if (entry.isFile()) {
      out.push(await readContentFile(absolute, root, path));
    }
  }
}

async function readContentFile(absolute: string, root: string, path: string): Promise<ContentFile> {
  if (!path.toLowerCase().endsWith(".json")) return { root, path };
  const bytes = await readFile(absolute);
  const revision = fileRevision(bytes);
  try {
    return { root, path, json: JSON.parse(bytes.toString("utf8")) as unknown, revision };
  } catch (error) {
    return { root, path, parseError: error instanceof Error ? error.message : String(error), revision };
  }
}
