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
// Saves of one service run one after another.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

export interface SaveWrite {
  readonly path: string;
  /** Revision the author read; null when the file must not exist yet. */
  readonly base: string | null;
  /** New content of a text file. */
  readonly text?: string;
  /** Absolute path of a staged binary upload (the binary channel). */
  readonly staged?: string;
}

export interface SaveDelete {
  readonly path: string;
  readonly base: string;
}

export interface SaveRequest {
  readonly writes?: readonly SaveWrite[];
  readonly deletes?: readonly SaveDelete[];
}

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
    recover: () => serial(() => recoverJournals(policy.root)),
    commit: (request) =>
      serial(async () => {
        const recovered = await recoverJournals(policy.root);
        if (recovered.rolledForward.length > 0) await options.afterSave?.([]);
        const result = await commit(request, options);
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

  const resolve = (path: string): { relative: string; absolute: string } | null => {
    try {
      const resolved = resolveWritablePath(policy, path);
      if (seen.has(resolved.relative)) {
        pathIssues.push(issue(resolved.relative, "duplicate-path", "The request names this file twice."));
        return null;
      }
      seen.add(resolved.relative);
      if (resolved.relative.endsWith(`/${CELL_INDEX_FILE}`) && partFolderOf(resolved.relative) !== null) {
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
  for (const write of request.writes ?? []) {
    const resolved = resolve(write.path);
    if (!resolved) continue;
    if ((write.text === undefined) === (write.staged === undefined)) {
      pathIssues.push(issue(resolved.relative, "bad-write", "A write has either text or a staged upload."));
      continue;
    }
    writes.push({
      ...resolved,
      base: write.base,
      bytes: write.text === undefined ? null : Buffer.from(write.text, "utf8"),
      staged: write.staged ?? null,
    });
  }
  for (const entry of request.deletes ?? []) {
    const resolved = resolve(entry.path);
    if (resolved) deletes.push({ ...resolved, base: entry.base });
  }
  if (pathIssues.length > 0) return { status: "rejected", reason: "path", issues: pathIssues };
  if (writes.length === 0 && deletes.length === 0) {
    return { status: "rejected", reason: "request", issues: [issue("", "empty", "Nothing to save.")] };
  }

  // Base revisions.
  const current = new Map<string, Buffer | null>();
  const conflicts: { path: string; base: string | null; current: string | null }[] = [];
  for (const entry of [...writes, ...deletes]) {
    const bytes = await readBytes(entry.absolute);
    current.set(entry.relative, bytes);
    const revision = bytes === null ? null : fileRevision(bytes);
    if (revision !== entry.base) conflicts.push({ path: entry.relative, base: entry.base, current: revision });
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
  const allWrites = [...writes, ...indexes.writes];
  const steps: JournalStep[] = [
    ...writes.map((write): JournalStep => ({ op: "rename", from: tempOf(write.relative), to: write.relative })),
    ...deletes.map((entry): JournalStep => ({ op: "delete", path: entry.relative })),
    ...indexes.deletes.map((path): JournalStep => ({ op: "delete", path })),
    ...indexes.writes.map((write): JournalStep => ({ op: "rename", from: tempOf(write.relative), to: write.relative })),
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

  const files: { path: string; revision: string | null }[] = [];
  for (const write of allWrites) {
    const bytes = write.bytes ?? (await readFile(join(policy.root, write.relative)));
    files.push({ path: write.relative, revision: fileRevision(bytes) });
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
