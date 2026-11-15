// The save transaction (architecture §4.6, D9; save service decisions 1A–1C).
//
// One request writes and deletes any number of project files, all or nothing:
//
// 1. Paths are resolved under the write policy; a refused path refuses the
//    request.
// 2. Every write and delete carries the revision its author read (`base`;
//    null for a file that must not exist yet). One mismatch refuses the
//    request with the current revisions: nothing is written (409).
// 3. Documents are checked (`check`, the schema validation of step 2 of the
//    save service); a loss refuses the request (422).
// 4. The index of every level folder touched (`cells.json`) is rebuilt here,
//    from the bytes written: a client never writes it (1B).
// 5. Journal `prepared` -> temporary files -> journal `committed` -> renames
//    and deletes, the indexes last -> journal removed (see journal.ts).
//
// Saves of one service run one after another; recovery and the save run
// under the project's save lock (projectLock.ts), so saves of other processes
// (the dev server, `forge edit`, `world:random`) wait for each other.
//
// The Content Browser's operations (plan phase 4 step 6c) go through the same
// transaction: a move renames a file (its bytes and revision stay; a level's
// `cells.json` moves with its folder), a write can copy a project file's bytes
// (`copyOf`), emptied folders are removed last, and the project manifest can
// change with them (`manifest`: the start level followed a move).

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CELL_INDEX_FILE,
  cellKeyOfFile,
  isJsonObject,
  levelFolderOf,
  nextCellIndex,
  normalizeLevelCellIndex,
  partFolderOf,
  stringifyDocument,
  type LevelCellIndexDoc,
  type LevelId,
  type PartKey,
} from "../../src/core/index.ts";
import { fileRevision } from "../assets/revision.ts";
import { ProjectPathError, resolveWritablePath, type WritePolicy } from "../server/projectPaths.ts";
import { recoverJournals, removeJournal, runSteps, writeJournal, type JournalStep, type RecoveryReport } from "./journal.ts";
import { withProjectLock, type ProjectLockOptions } from "./projectLock.ts";

export interface SaveWrite {
  readonly path: string;
  /** Revision the author read; null when the file must not exist yet. */
  readonly base: string | null;
  /** New content of a text file. */
  readonly text?: string;
  /** Absolute path of a staged binary upload (the binary channel). */
  readonly staged?: string;
  /** A project file whose bytes are written (a Content Browser copy). */
  readonly copyOf?: string;
}

export interface SaveMove {
  readonly from: string;
  /** Must not exist. */
  readonly to: string;
}

/** The project manifest's new text (`forge.project.json`), with the revision read. */
export interface SaveManifest {
  readonly text: string;
  readonly base: string;
}

export interface SaveDelete {
  readonly path: string;
  readonly base: string;
}

export interface SaveRequest {
  readonly writes?: readonly SaveWrite[];
  readonly deletes?: readonly SaveDelete[];
  readonly moves?: readonly SaveMove[];
  /** Folders removed after the moves and deletes, when they are empty then. */
  readonly removeDirs?: readonly string[];
  /** Empty folders made (a new folder, an empty one moved or copied); after everything else. */
  readonly mkdirs?: readonly string[];
  readonly manifest?: SaveManifest;
}

export const MANIFEST_FILE = "forge.project.json";

export interface SaveIssue {
  readonly file: string;
  readonly path: string;
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
}

export type SaveResult =
  | {
      readonly status: "saved";
      /** Every file the save changed, the indexes included; revision null for a deleted file. */
      readonly files: { readonly path: string; readonly revision: string | null }[];
      readonly warnings: SaveIssue[];
    }
  | {
      readonly status: "conflict";
      readonly conflicts: { readonly path: string; readonly base: string | null; readonly current: string | null }[];
    }
  | { readonly status: "rejected"; readonly reason: "path" | "request" | "document"; readonly issues: SaveIssue[] };

/**
 * Checks one document before it is written: returns the text to write (the
 * canonical form) and the issues. An error refuses the save.
 */
export type DocumentCheck = (
  file: { readonly path: string; readonly text: string },
  context: SaveContext,
) => Promise<{ readonly text: string; readonly issues: readonly SaveIssue[] }>;

/** What a check may ask about the project as it will be after the save. */
export interface SaveContext {
  /** Text of a project file after this save (null when absent or binary). */
  textAfter(path: string): Promise<string | null>;
  /** The text writes of this save, as submitted (before any check rewrote them). */
  readonly pending: readonly { readonly path: string; readonly text: string }[];
}

export interface SaveServiceOptions {
  readonly policy: WritePolicy;
  readonly check?: DocumentCheck;
  /** Runs after a save completed, before the next one starts (e.g. to refresh caches). */
  readonly afterSave?: (files: readonly { readonly path: string; readonly revision: string | null }[]) => Promise<void>;
  /** Tests: throw after this many journal steps, as if the process died. */
  readonly failAfterSteps?: number;
  /** The project's save lock (waiting time; tests). */
  readonly lock?: ProjectLockOptions;
}

export interface SaveService {
  commit(request: SaveRequest): Promise<SaveResult>;
  /** Finishes or undoes interrupted saves. Also runs before every commit. */
  recover(): Promise<RecoveryReport>;
}

export class SimulatedCrash extends Error {}

interface PlannedWrite {
  readonly relative: string;
  readonly absolute: string;
  readonly base: string | null;
  bytes: Buffer | null;
  readonly staged: string | null;
}

async function readBytes(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

const issue = (file: string, code: string, message: string): SaveIssue => ({ file, path: "", code, severity: "error", message });

export function createSaveService(options: SaveServiceOptions): SaveService {
  const { policy } = options;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  return {
    recover: () => serial(() => withProjectLock(policy.root, () => recoverJournals(policy.root), options.lock)),
    commit: (request) =>
      serial(async () => {
        const result = await withProjectLock(
          policy.root,
          async () => {
            const recovered = await recoverJournals(policy.root);
            // The caches see a recovered save before this one is checked.
            if (recovered.rolledForward.length > 0) await options.afterSave?.([]);
            return commit(request, options);
          },
          options.lock,
        );
        if (result.status === "saved") await options.afterSave?.(result.files);
        return result;
      }),
  };
}

async function commit(request: SaveRequest, options: SaveServiceOptions): Promise<SaveResult> {
  const { policy } = options;
  const writes: PlannedWrite[] = [];
  const deletes: { relative: string; absolute: string; base: string }[] = [];
  const pathIssues: SaveIssue[] = [];
  const seen = new Set<string>();

  const resolve = (path: string, moving = false): { relative: string; absolute: string } | null => {
    try {
      const resolved = resolveWritablePath(policy, path);
      if (seen.has(resolved.relative)) {
        pathIssues.push(issue(resolved.relative, "duplicate-path", "The request names this file twice."));
        return null;
      }
      seen.add(resolved.relative);
      // A level's index moves with its folder; it is never written or deleted by a client.
      if (!moving && resolved.relative.endsWith(`/${CELL_INDEX_FILE}`) && partFolderOf(resolved.relative) !== null) {
        pathIssues.push(issue(resolved.relative, "server-owned", "A level's cells.json is written by the server only."));
        return null;
      }
      return resolved;
    } catch (error) {
      if (!(error instanceof ProjectPathError)) throw error;
      pathIssues.push(issue(path, error.code, error.message));
      return null;
    }
  };
  const copies: { write: PlannedWrite; source: string }[] = [];
  for (const write of request.writes ?? []) {
    const resolved = resolve(write.path);
    if (!resolved) continue;
    if ([write.text, write.staged, write.copyOf].filter((one) => one !== undefined).length !== 1) {
      pathIssues.push(issue(resolved.relative, "bad-write", "A write has text, a staged upload or a file to copy."));
      continue;
    }
    const planned: PlannedWrite = {
      ...resolved,
      base: write.base,
      bytes: write.text === undefined ? null : Buffer.from(write.text, "utf8"),
      staged: write.staged ?? null,
    };
    writes.push(planned);
    if (write.copyOf !== undefined) {
      try {
        copies.push({ write: planned, source: resolveWritablePath(policy, write.copyOf).absolute });
      } catch (error) {
        if (!(error instanceof ProjectPathError)) throw error;
        pathIssues.push(issue(write.copyOf, error.code, error.message));
      }
    }
  }
  for (const entry of request.deletes ?? []) {
    const resolved = resolve(entry.path);
    if (resolved) deletes.push({ ...resolved, base: entry.base });
  }
  const moves: { from: { relative: string; absolute: string }; to: { relative: string; absolute: string } }[] = [];
  for (const move of request.moves ?? []) {
    const from = resolve(move.from, true);
    const to = resolve(move.to, true);
    if (from && to) moves.push({ from, to });
  }
  const folderPaths = (list: readonly string[] | undefined): { relative: string; absolute: string }[] =>
    (list ?? []).flatMap((folder) => {
      try {
        return [resolveWritablePath(policy, folder)];
      } catch (error) {
        if (!(error instanceof ProjectPathError)) throw error;
        pathIssues.push(issue(folder, error.code, error.message));
        return [];
      }
    });
  const removeDirs = folderPaths(request.removeDirs).map((folder) => folder.relative);
  const mkdirs = folderPaths(request.mkdirs);
  const manifest: PlannedWrite | null = request.manifest
    ? { relative: MANIFEST_FILE, absolute: join(policy.root, MANIFEST_FILE), base: request.manifest.base, bytes: Buffer.from(request.manifest.text, "utf8"), staged: null }
    : null;
  if (pathIssues.length > 0) return { status: "rejected", reason: "path", issues: pathIssues };
  if (writes.length === 0 && deletes.length === 0 && moves.length === 0 && removeDirs.length === 0 && mkdirs.length === 0 && manifest === null) {
    return { status: "rejected", reason: "request", issues: [issue("", "empty", "Nothing to save.")] };
  }

  // Base revisions.
  const current = new Map<string, Buffer | null>();
  const conflicts: { path: string; base: string | null; current: string | null }[] = [];
  for (const entry of [...writes, ...deletes, ...(manifest ? [manifest] : [])]) {
    const bytes = await readBytes(entry.absolute);
    current.set(entry.relative, bytes);
    const revision = bytes === null ? null : fileRevision(bytes);
    if (revision !== entry.base) conflicts.push({ path: entry.relative, base: entry.base, current: revision });
  }
  // A move needs its file there and its target free (its bytes do not change: no revision to compare).
  const isFile = (absolute: string): Promise<boolean> => stat(absolute).then((info) => info.isFile(), () => false);
  const taken = (absolute: string): Promise<boolean> => stat(absolute).then(() => true, () => false);
  for (const move of moves) {
    if (!(await isFile(move.from.absolute))) conflicts.push({ path: move.from.relative, base: null, current: null });
    if (await taken(move.to.absolute)) conflicts.push({ path: move.to.relative, base: null, current: "exists" });
  }
  for (const copy of copies) {
    const bytes = await readBytes(copy.source);
    if (bytes === null) conflicts.push({ path: copy.write.relative, base: null, current: null });
    else copy.write.bytes = bytes;
  }
  if (conflicts.length > 0) return { status: "conflict", conflicts };

  // Documents.
  const after = new Map<string, Buffer | null>();
  for (const write of writes) after.set(write.relative, write.bytes);
  for (const entry of deletes) after.set(entry.relative, null);
  const context: SaveContext = {
    pending: writes
      .filter((write) => write.bytes !== null)
      .map((write) => ({ path: write.relative, text: write.bytes!.toString("utf8") })),
    async textAfter(path) {
      if (after.has(path)) return after.get(path)?.toString("utf8") ?? null;
      const resolved = resolveWritablePathOrNull(policy, path);
      const bytes = resolved ? await readBytes(resolved) : null;
      return bytes?.toString("utf8") ?? null;
    },
  };
  const warnings: SaveIssue[] = [];
  if (options.check) {
    const errors: SaveIssue[] = [];
    for (const write of writes) {
      if (write.bytes === null) continue;
      const checked = await options.check({ path: write.relative, text: write.bytes.toString("utf8") }, context);
      for (const found of checked.issues) (found.severity === "error" ? errors : warnings).push(found);
      write.bytes = Buffer.from(checked.text, "utf8");
      after.set(write.relative, write.bytes);
    }
    if (errors.length > 0) return { status: "rejected", reason: "document", issues: [...errors, ...warnings] };
  }

  // Level indexes.
  const indexes = await planIndexes(writes, deletes, context, policy);
  if ("issues" in indexes) return { status: "rejected", reason: "request", issues: indexes.issues };

  // Journal, temporary files, commit.
  const txid = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const tempOf = (relative: string): string => {
    const slash = relative.lastIndexOf("/");
    return `${relative.slice(0, slash + 1)}.${relative.slice(slash + 1)}.${txid}.tmp`;
  };
  const allWrites = [...writes, ...indexes.writes, ...(manifest ? [manifest] : [])];
  const steps: JournalStep[] = [
    ...writes.map((write): JournalStep => ({ op: "rename", from: tempOf(write.relative), to: write.relative })),
    ...moves.map((move): JournalStep => ({ op: "rename", from: move.from.relative, to: move.to.relative })),
    ...deletes.map((entry): JournalStep => ({ op: "delete", path: entry.relative })),
    ...indexes.deletes.map((path): JournalStep => ({ op: "delete", path })),
    ...indexes.writes.map((write): JournalStep => ({ op: "rename", from: tempOf(write.relative), to: write.relative })),
    ...(manifest ? [{ op: "rename", from: tempOf(manifest.relative), to: manifest.relative } satisfies JournalStep] : []),
    // Deepest first, so a folder emptied by removing its sub-folders goes too.
    ...[...removeDirs].sort((a, b) => b.split("/").length - a.split("/").length).map((path): JournalStep => ({ op: "removeDir", path })),
  ];
  const temps = allWrites.map((write) => tempOf(write.relative));
  const journal = { schema: "forge.saveJournal/1" as const, txid, temps, steps };
  await writeJournal(policy.root, { ...journal, state: "prepared" });
  try {
    for (const write of allWrites) {
      const temp = join(policy.root, tempOf(write.relative));
      await mkdir(dirname(temp), { recursive: true });
      if (write.staged !== null) {
        await writeFile(temp, await readFile(write.staged));
      } else {
        await writeFile(temp, write.bytes!);
      }
    }
  } catch (error) {
    for (const temp of temps) await rm(join(policy.root, temp), { force: true });
    await removeJournal(policy.root, txid);
    throw error;
  }
  await writeJournal(policy.root, { ...journal, state: "committed" });
  await runSteps(policy.root, steps, (done) => {
    if (options.failAfterSteps !== undefined && done >= options.failAfterSteps) {
      throw new SimulatedCrash(`simulated crash after ${done} step(s)`);
    }
  });
  await removeJournal(policy.root, txid);
  for (const write of writes) if (write.staged !== null) await rm(write.staged, { force: true });
  // An empty folder is no file: made after the journal, idempotent.
  for (const folder of mkdirs) await mkdir(folder.absolute, { recursive: true });

  const files: { path: string; revision: string | null }[] = [];
  for (const write of allWrites) {
    const bytes = write.bytes ?? (await readFile(join(policy.root, write.relative)));
    files.push({ path: write.relative, revision: fileRevision(bytes) });
  }
  for (const move of moves) {
    files.push({ path: move.from.relative, revision: null });
    files.push({ path: move.to.relative, revision: fileRevision(await readFile(move.to.absolute)) });
  }
  for (const entry of deletes) files.push({ path: entry.relative, revision: null });
  for (const path of indexes.deletes) files.push({ path, revision: null });
  return { status: "saved", files, warnings };
}

function resolveWritablePathOrNull(policy: WritePolicy, path: string): string | null {
  try {
    return resolveWritablePath(policy, path).absolute;
  } catch {
    return null;
  }
}

/**
 * New `cells.json` of every level folder the save touches. A cell needs its
 * level's `level.json`; deleting `level.json` deletes the index and needs
 * every cell file deleted in the same save.
 */
async function planIndexes(
  writes: readonly PlannedWrite[],
  deletes: readonly { relative: string }[],
  context: SaveContext,
  policy: WritePolicy,
): Promise<{ writes: PlannedWrite[]; deletes: string[] } | { issues: SaveIssue[] }> {
  const touched = new Map<string, { written: Map<PartKey, string>; removed: string[]; levelDeleted: boolean }>();
  const folderOf = (path: string): { folder: string; key: PartKey } | null => {
    const level = levelFolderOf(path);
    if (level !== null) return { folder: level, key: null };
    const folder = partFolderOf(path);
    if (folder === null) return null;
    const key = cellKeyOfFile(folder === "" ? path : path.slice(folder.length + 1));
    return key === null ? null : { folder, key };
  };
  const entry = (folder: string) => {
    let found = touched.get(folder);
    if (!found) {
      found = { written: new Map(), removed: [], levelDeleted: false };
      touched.set(folder, found);
    }
    return found;
  };
  for (const write of writes) {
    const part = folderOf(write.relative);
    if (part) entry(part.folder).written.set(part.key, write.bytes === null ? "" : fileRevision(write.bytes));
  }
  for (const removed of deletes) {
    const part = folderOf(removed.relative);
    if (!part) continue;
    if (part.key === null) entry(part.folder).levelDeleted = true;
    else entry(part.folder).removed.push(part.key);
  }

  const issues: SaveIssue[] = [];
  const indexWrites: PlannedWrite[] = [];
  const indexDeletes: string[] = [];
  for (const [folder, change] of touched) {
    const levelPath = `${folder}/level.json`;
    const indexPath = `${folder}/${CELL_INDEX_FILE}`;
    const indexAbsolute = resolveWritablePath(policy, indexPath).absolute;
    const previousText = (await readBytes(indexAbsolute))?.toString("utf8") ?? null;
    let previous: LevelCellIndexDoc | null = null;
    if (previousText !== null) {
      try {
        previous = normalizeLevelCellIndex(JSON.parse(previousText), { strict: false }).value;
      } catch {
        previous = null;
      }
    }
    if (change.levelDeleted) {
      const left = Object.keys(previous?.cells ?? {}).filter((key) => !change.removed.includes(key));
      if (left.length > 0) {
        issues.push(issue(levelPath, "cells-left", `Deleting a level deletes its cells too; still there: ${left.join(", ")}.`));
      } else if (previousText !== null) {
        indexDeletes.push(indexPath);
      }
      continue;
    }
    const levelText = await context.textAfter(levelPath);
    const level = parseLevelId(levelText);
    if (level === null) {
      issues.push(issue(levelPath, "no-level", "A cell is saved in a level folder: level.json is missing or unreadable."));
      continue;
    }
    if (previous !== null && previous.level !== level) previous = null;
    if (!change.written.has(null) && previous === null) {
      change.written.set(null, fileRevision(Buffer.from(levelText!, "utf8")));
    }
    const next = nextCellIndex(level, previous, change.written, change.removed);
    const text = stringifyDocument(next);
    indexWrites.push({ relative: indexPath, absolute: indexAbsolute, base: null, bytes: Buffer.from(text, "utf8"), staged: null });
  }
  return issues.length > 0 ? { issues } : { writes: indexWrites, deletes: indexDeletes };
}

function parseLevelId(text: string | null): LevelId | null {
  if (text === null) return null;
  try {
    const json: unknown = JSON.parse(text);
    if (isJsonObject(json) && typeof json.id === "string" && json.id.startsWith("lvl_")) return json.id as LevelId;
  } catch {
    // not JSON
  }
  return null;
}
