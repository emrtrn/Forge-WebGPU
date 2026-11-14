// Engine-labelled requests use a separate write policy and transaction, but
// keep their public paths in replies (including generated indexes and 409s).
import { resolve } from "node:path";
import { ENGINE_LABEL_PREFIX, ENGINE_CONTENT_DIR, CONTENT_PACKS_DIR } from "../assets/engineContent.ts";
import type { ContentRoot } from "../assets/scan.ts";
import type { SaveRequest, SaveResult } from "../save/transaction.ts";
import { createWritePolicy, normalizeProjectPath, ProjectPathError, resolveWritablePath } from "./projectPaths.ts";

const within = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`);

export function engineContentAccess(engineRoot: string, roots: readonly ContentRoot[]) {
  const samePath = (a: string, b: string): boolean =>
    process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
  const writable = roots.filter(({ label, dir }) => {
    if (!label.startsWith(ENGINE_LABEL_PREFIX)) return false;
    const path = label.slice(ENGINE_LABEL_PREFIX.length);
    const pack = path.startsWith(`${CONTENT_PACKS_DIR}/`) && path.split("/").length === 3;
    return (path === ENGINE_CONTENT_DIR || pack) && samePath(dir, resolve(engineRoot, path));
  });
  const rootOf = (path: string): string | undefined => writable.find((root) => within(path, root.label))?.label;
  const policy = createWritePolicy(engineRoot, writable.map((root) => root.label.slice(ENGINE_LABEL_PREFIX.length)));
  const pathOf = (path: string): string => {
    const label = rootOf(path);
    if (label === undefined || path === label) throw new ProjectPathError("read-only", `Not an engine content file: ${path}`);
    // Normalise the part *inside* this root, so ../ cannot cross into another
    // pack even though that pack is also writable in this mode.
    const inside = normalizeProjectPath(path.slice(label.length + 1));
    return resolveWritablePath(policy, `${label.slice(ENGINE_LABEL_PREFIX.length)}/${inside}`).relative;
  };
  return {
    policy,
    rootOf,
    request(request: SaveRequest): SaveRequest {
      return {
        writes: (request.writes ?? []).map((write) => ({ ...write, path: pathOf(write.path), ...(write.copyOf !== undefined ? { copyOf: pathOf(write.copyOf) } : {}) })),
        deletes: (request.deletes ?? []).map((entry) => ({ ...entry, path: pathOf(entry.path) })),
        moves: (request.moves ?? []).map((move) => ({ from: pathOf(move.from), to: pathOf(move.to) })),
        removeDirs: (request.removeDirs ?? []).map(pathOf),
        mkdirs: (request.mkdirs ?? []).map(pathOf),
      };
    },
  };
}

/** SaveService paths are relative to the engine; editor sessions use labelled paths. */
export function engineContentResult(result: SaveResult): SaveResult {
  const label = (path: string): string => `${ENGINE_LABEL_PREFIX}${path}`;
  if (result.status === "saved") return {
    ...result,
    files: result.files.map((file) => ({ ...file, path: label(file.path) })),
    warnings: result.warnings.map((issue) => ({ ...issue, file: label(issue.file) })),
  };
  if (result.status === "conflict") return { ...result, conflicts: result.conflicts.map((conflict) => ({ ...conflict, path: label(conflict.path) })) };
  return { ...result, issues: result.issues.map((issue) => ({ ...issue, file: label(issue.file) })) };
}
