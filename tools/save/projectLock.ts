// The project's save lock (architecture §4.6; plan phase 4 step 9a, user
// decision 2026-11-15).
//
// A save service runs its saves one after another, but only within its own
// process. The dev server, `npm run forge -- edit` (A12), `world:random` and
// the importer each have one, on the same project. Without a lock between
// processes:
//
// - recovery, which runs before every save, takes another process's save in
//   progress (journal `prepared`) for an interrupted one and deletes its
//   temporary files;
// - two saves can both pass the revision check of the same file and the
//   later rename wins (a lost update instead of a 409).
//
// So recovery and the save run under `<project>/.forge-journal/save.lock`,
// created exclusively (`wx`) and holding its owner (pid, host, time). A lock
// whose owner process is gone (same host, the pid no longer runs) is stale and
// taken over; a lock nobody could read for a while (its owner died between
// creating and writing it) too. A lock held by another host is never taken
// over: after the wait the error names the file to delete.

import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { JOURNAL_DIR } from "./journal.ts";

export const LOCK_FILE = "save.lock";
/** How long a save waits for the lock by default: a full save of a 50.000-actor level takes seconds. */
export const LOCK_WAIT_MS = 60_000;
/** An unreadable lock (created, owner not written yet) older than this is stale. */
const UNREADABLE_STALE_MS = 10_000;

export interface LockOwner {
  readonly pid: number;
  readonly host: string;
  /** ISO time the lock was taken. */
  readonly since: string;
}

export interface ProjectLockOptions {
  /** Default LOCK_WAIT_MS. */
  readonly waitMs?: number;
  /** Tests: whether a pid runs. Default: `process.kill(pid, 0)`. */
  readonly isAlive?: (pid: number) => boolean;
}

export class ProjectLockTimeout extends Error {}

export function lockPath(root: string): string {
  return join(root, JOURNAL_DIR, LOCK_FILE);
}

export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it runs, under another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function parseOwner(text: string): LockOwner | null {
  try {
    const json = JSON.parse(text) as Partial<LockOwner>;
    if (typeof json.pid === "number" && typeof json.host === "string" && typeof json.since === "string") return json as LockOwner;
  } catch {
    // half written
  }
  return null;
}

async function tryCreate(path: string, owner: LockOwner): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify(owner)}\n`);
  } finally {
    await handle.close();
  }
  return true;
}

/** The lock's text when it is stale (to remove), null when it is held or gone. */
async function staleText(path: string, isAlive: (pid: number) => boolean): Promise<string | null> {
  let text: string;
  let age: number;
  try {
    text = await readFile(path, "utf8");
    age = Date.now() - (await stat(path)).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const owner = parseOwner(text);
  if (owner === null) return age > UNREADABLE_STALE_MS ? text : null;
  if (owner.host !== hostname()) return null;
  if (owner.pid === process.pid) return null; // ours, held by another save of this process
  return isAlive(owner.pid) ? null : text;
}

/** Who holds the lock now, for messages; null when nobody or unreadable. */
export async function lockOwner(root: string): Promise<LockOwner | null> {
  try {
    return parseOwner(await readFile(lockPath(root), "utf8"));
  } catch {
    return null;
  }
}

/** Runs `work` holding the project's save lock; waits for it, takes over a stale one. */
export async function withProjectLock<T>(root: string, work: () => Promise<T>, options: ProjectLockOptions = {}): Promise<T> {
  const path = lockPath(root);
  const isAlive = options.isAlive ?? processIsAlive;
  const deadline = Date.now() + (options.waitMs ?? LOCK_WAIT_MS);
  await mkdir(join(root, JOURNAL_DIR), { recursive: true });
  const owner: LockOwner = { pid: process.pid, host: hostname(), since: new Date().toISOString() };
  for (let attempt = 0; ; attempt += 1) {
    if (await tryCreate(path, owner)) break;
    const stale = await staleText(path, isAlive);
    if (stale !== null) {
      // Removed only while it still holds what was judged stale.
      const now = await readFile(path, "utf8").catch(() => null);
      if (now === stale) await rm(path, { force: true });
      continue;
    }
    if (Date.now() >= deadline) {
      const holder = await lockOwner(root);
      const who = holder ? `process ${holder.pid} on ${holder.host} since ${holder.since}` : "another process";
      throw new ProjectLockTimeout(`The project is being saved by ${who}; if no such process runs, delete ${path}.`);
    }
    await sleep(Math.min(10 * (attempt + 1), 100));
  }
  try {
    return await work();
  } finally {
    await rm(path, { force: true });
  }
}
