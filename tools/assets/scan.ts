// Reads content roots from disk into the file list the core asset index takes
// (architecture §4.6, A10). Core never touches the disk; this is the Node side.
//
// - A root has a label and a folder (`ContentRoot`). The label is what files
//   carry in the index (`<label>/<path>`); a project's own roots are labelled
//   by their project-relative path (`content`), the engine's content and packs
//   by `engine:<path in the engine repo>` (A9), since they live outside the
//   project. References are GUIDs, so a label is only where a file is shown.
// - Every `.json` file is read and parsed; a parse failure is kept on the file
//   so the index reports it. Its revision (hash of the bytes) is put on it, so
//   the index can check a level's files against `cells.json`. Other files are
//   listed, not read.
// - Names starting with "." (`.forge-cache`, `.git`, editor droppings) are
//   skipped, files and folders alike; so are `*.md` files (a README in a
//   content folder is documentation, not an asset).
// - A root that does not exist is listed as missing, not an error: a project
//   may have no samples, and the engine repo has no content yet.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { ContentFile } from "../../src/core/index.ts";
import { fileRevision } from "./revision.ts";

/** A content root: the label its files carry, and its folder on disk. */
export interface ContentRoot {
  /** `content`, or `engine:content/packs/starter` for a root outside the project. */
  readonly label: string;
  /** Absolute folder. */
  readonly dir: string;
}

export interface ScanResult {
  /** Labels of the roots that exist, in the order given. */
  readonly roots: readonly string[];
  /** Labels of the roots that do not exist. */
  readonly missing: readonly string[];
  /** Files in root order, then path order. */
  readonly files: readonly ContentFile[];
}

function normalizeRoot(root: string): string {
  return root.replaceAll("\\", "/").replace(/\/+$/, "");
}

/** A project's own roots, given project-relative. */
export function projectContentRoots(projectRoot: string, roots: readonly string[]): ContentRoot[] {
  return roots.map((root) => {
    const label = normalizeRoot(root);
    return { label, dir: join(projectRoot, label) };
  });
}

/** Roots must not contain one another: a file would be indexed twice. */
function checkRoots(roots: readonly ContentRoot[]): void {
  const folder = (root: ContentRoot): string => {
    const absolute = resolve(root.dir);
    return process.platform === "win32" ? absolute.toLowerCase() : absolute;
  };
  for (const a of roots) {
    for (const b of roots) {
      if (a !== b && folder(b).startsWith(`${folder(a)}${sep}`)) {
        throw new Error(`Content roots must not nest: "${b.label}" is inside "${a.label}".`);
      }
    }
  }
  if (new Set(roots.map((root) => root.label)).size !== roots.length || new Set(roots.map(folder)).size !== roots.length) {
    throw new Error("A content root is listed twice.");
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function scanRoots(roots: readonly ContentRoot[]): Promise<ScanResult> {
  checkRoots(roots);
  const present: string[] = [];
  const missing: string[] = [];
  const files: ContentFile[] = [];
  for (const root of roots) {
    if (!(await isDirectory(root.dir))) {
      missing.push(root.label);
      continue;
    }
    present.push(root.label);
    await walk(root.dir, "", root.label, files);
  }
  return { roots: present, missing, files };
}

/** `roots` are relative to `projectRoot`, with forward slashes. */
export async function scanContentRoots(projectRoot: string, roots: readonly string[]): Promise<ScanResult> {
  return scanRoots(projectContentRoots(projectRoot, roots));
}

async function walk(directory: string, relative: string, root: string, out: ContentFile[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) continue;
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
