// Where the dev server may read and write (architecture §4.6, §4.8; A9).
//
// `resolveProjectPath` is Forge's rule, taken over as is: a request names a
// project-relative path; an absolute path, a drive letter, a NUL byte, a path
// that climbs out of the root, or a link (symlink or Windows junction) on the
// way is refused. Links below the root are refused rather than followed, so a
// link cannot grant access to what it points at. This is a local authoring
// boundary, not isolation from other processes writing the same disk.
//
// Writes go further (`WritePolicy`): only under a writable root (default
// `content/`), never under `tests/fixtures/` or `samples/` (fixtures and
// samples are changed by code review, not by an editor: A9), never to a name
// starting with "." (the save service's own temporary files and journal, git,
// caches).

import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type ProjectPathErrorCode = "not-relative" | "outside-root" | "link" | "read-only" | "hidden";

export class ProjectPathError extends Error {
  readonly code: ProjectPathErrorCode;
  constructor(code: ProjectPathErrorCode, message: string) {
    super(message);
    this.name = "ProjectPathError";
    this.code = code;
  }
}

/** Project-relative, forward slashes, no `.` segments, no trailing slash. */
export function normalizeProjectPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (normalized === "" || isAbsolute(normalized) || normalized.startsWith("/") || normalized.includes(":") || normalized.includes("\0")) {
    throw new ProjectPathError("not-relative", `Expected a project-relative path: ${path}`);
  }
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) throw new ProjectPathError("outside-root", `Path escapes the project root: ${path}`);
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  if (parts.length === 0) throw new ProjectPathError("not-relative", `Expected a path inside the project: ${path}`);
  return parts.join("/");
}

/**
 * The absolute path of a project-relative path. Existing ancestors and the
 * leaf are checked for links, also for a file that does not exist yet.
 */
export function resolveProjectPath(root: string, path: string): string {
  const normalized = normalizeProjectPath(path);
  const target = resolve(root, normalized);
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new ProjectPathError("outside-root", `Path escapes the project root: ${path}`);
  }
  const exists = (candidate: string): boolean => {
    try {
      if (lstatSync(candidate).isSymbolicLink()) {
        throw new ProjectPathError("link", `Links in the project are not allowed: ${candidate}`);
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  };
  if (!exists(root)) throw new Error(`The project root no longer exists: ${root}`);
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (!exists(current)) break;
  }
  return target;
}

/** Folders no editor writes to, whatever the configuration says (A9). */
export const READ_ONLY_ROOTS = ["tests/fixtures", "samples"] as const;

export interface WritePolicy {
  /** Real path of the project root. */
  readonly root: string;
  /** Project-relative folders writes may go to. */
  readonly writableRoots: readonly string[];
}

const isUnder = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

export function createWritePolicy(root: string, writableRoots: readonly string[] = ["content"]): WritePolicy {
  const real = realpathSync(resolve(root));
  const roots = writableRoots.map(normalizeProjectPath);
  for (const writable of roots) {
    const denied = READ_ONLY_ROOTS.find((folder) => isUnder(writable, folder) || isUnder(folder, writable));
    if (denied) throw new Error(`A writable root may not hold or be inside ${denied}/: ${writable}`);
  }
  return { root: real, writableRoots: roots };
}

/** The normalised relative path and absolute path of a file a save may write or delete. */
export function resolveWritablePath(policy: WritePolicy, path: string): { relative: string; absolute: string } {
  const normalized = normalizeProjectPath(path);
  if (normalized.split("/").some((part) => part.startsWith("."))) {
    throw new ProjectPathError("hidden", `Names starting with "." are not written by a save: ${path}`);
  }
  if (READ_ONLY_ROOTS.some((folder) => isUnder(normalized, folder))) {
    throw new ProjectPathError("read-only", `Fixtures and samples are read-only for the editor: ${path}`);
  }
  if (!policy.writableRoots.some((folder) => normalized.startsWith(`${folder}/`))) {
    throw new ProjectPathError(
      "read-only",
      `Not under a writable root (${policy.writableRoots.join(", ")}): ${path}`,
    );
  }
  return { relative: normalized, absolute: resolveProjectPath(policy.root, normalized) };
}
