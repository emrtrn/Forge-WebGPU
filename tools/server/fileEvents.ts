// Files changed on disk, as the dev server tells the editor (architecture
// §4.11, phase 4 decision 4; plan step 9e, user decision 2026-11-15: Vite's
// HMR channel). The content roots are watched folder by folder with Node's
// `fs.watch` (`watchContentRoots`), not Vite's watcher: in the editor smoke,
// chokidar lost a level folder deleted and made again, and a recursive
// `fs.watch` lost a file once a save had renamed over it. An agent's command (`npm run forge -- edit`),
// another tool or a hand edit writes the project's files without the dev
// server; the server hears the watcher, refreshes its own caches (the asset
// index, the class store) and sends the editor one batch:
//
//   { files: [{ path, revision }] }   path as /__forge/read takes it, revision null when gone
//
// - Only files under a content root count (the project's, and the engine's
//   content and packs by their `engine:` labels); a name starting with "."
//   anywhere on the path never does (a save's temporary files, the journal,
//   caches, the play layer).
// - A save renames several files one after another; changes are gathered
//   until the disk is quiet for `quietMs` (at most `maxWaitMs`), so one save
//   is one batch. The revision is read when the batch goes out.
// - The editor tells its own saves apart by the revision (it knows what it
//   wrote); the server does not say who wrote a file.

import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { FILE_EVENT, type ChangedFileBody, type FileEventsBody } from "../../src/core/index.ts";
import { fileRevision } from "../assets/revision.ts";

export { FILE_EVENT, type FileEventsBody };
export type ChangedFile = ChangedFileBody;

/** Where a content root is on disk and how its files are named (`content` under the project; `engine:content/packs/starter`). */
export interface WatchedRoot {
  readonly dir: string;
  readonly label: string;
}

export interface FileEventsOptions {
  readonly roots: readonly WatchedRoot[];
  /** One batch of changes (never empty). */
  readonly emit: (files: readonly ChangedFile[]) => void | Promise<void>;
  /** Default 120 ms. */
  readonly quietMs?: number;
  /** Default 1.000 ms. */
  readonly maxWaitMs?: number;
}

export interface FileEvents {
  /** A watcher event: an absolute path that was added, changed or removed. */
  push(absolute: string): void;
  /** Sends what is gathered now (tests, shutdown). */
  flush(): Promise<void>;
  dispose(): void;
}

/** The path a watched file goes by, or null when it is not one. */
export function watchedPath(roots: readonly WatchedRoot[], absolute: string): string | null {
  const full = resolve(absolute);
  for (const root of roots) {
    const inside = relative(resolve(root.dir), full);
    if (inside === "" || inside.startsWith("..") || resolve(root.dir, inside) !== full) continue;
    const parts = inside.split(sep);
    if (parts.some((part) => part.startsWith("."))) return null;
    return `${root.label}/${parts.join("/")}`;
  }
  return null;
}

async function revisionOf(absolute: string): Promise<string | null> {
  try {
    return fileRevision(await readFile(absolute));
  } catch {
    return null; // gone (or a folder: folders are not files)
  }
}

export function createFileEvents(options: FileEventsOptions): FileEvents {
  const quiet = options.quietMs ?? 120;
  const maxWait = options.maxWaitMs ?? 1000;
  const pending = new Map<string, string>(); // path -> absolute
  let timer: ReturnType<typeof setTimeout> | null = null;
  let first = 0;
  let disposed = false;
  let sending: Promise<void> = Promise.resolve();

  const send = async (): Promise<void> => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (pending.size === 0) return;
    const batch = [...pending].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    pending.clear();
    const files: ChangedFile[] = [];
    for (const [path, absolute] of batch) files.push({ path, revision: await revisionOf(absolute) });
    // A batch still reading revisions when the events were disposed is dropped, not sent.
    if (disposed) return;
    await options.emit(files);
  };
  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    const wait = Math.max(0, Math.min(quiet, first + maxWait - Date.now()));
    timer = setTimeout(() => {
      sending = sending.then(send, send);
    }, wait);
  };

  return {
    push(absolute) {
      if (disposed) return;
      const path = watchedPath(options.roots, absolute);
      if (path === null) return;
      if (pending.size === 0) first = Date.now();
      pending.set(path, resolve(absolute));
      schedule();
    },
    flush() {
      sending = sending.then(send, send);
      return sending;
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending.clear();
    },
  };
}

/**
 * Watches every content root that exists and pushes each changed path; returns the stop. Each folder is watched
 * on its own (Node's `fs.watch`, not recursive): a folder's events name its entries whatever their inode, so a
 * save that renames a temporary file over its target is seen every time (a recursive watch on Linux lost a file
 * once it had been replaced, and Vite's watcher lost a folder deleted and made again). A folder that appears is
 * watched at once and the files already in it are pushed (they can be written before the watch is armed); one
 * that goes away is let go. Hidden folders are not watched. A root that cannot be watched is reported and
 * skipped: the editor then learns of changes from its own saves and a 409 only.
 */
export function watchContentRoots(roots: readonly WatchedRoot[], events: Pick<FileEvents, "push">, warn: (message: string) => void = () => undefined): () => void {
  const watchers = new Map<string, FSWatcher>();
  let stopped = false;
  const forget = (dir: string): void => {
    for (const [path, watcher] of watchers) {
      if (path === dir || path.startsWith(`${dir}${sep}`)) {
        watcher.close();
        watchers.delete(path);
      }
    }
  };
  /** Watches `dir` and every folder under it (again when it was made anew); pushes the files found when `report`. */
  const arm = async (dir: string, report: boolean): Promise<void> => {
    if (stopped) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      forget(dir);
      return;
    }
    watchers.get(dir)?.close();
    try {
      const watcher = watch(dir, (_event, name) => {
        if (!name) return;
        const path = join(dir, name.toString());
        events.push(path);
        if (!name.toString().startsWith(".")) void stat(path).then((info) => (info.isDirectory() ? arm(path, true) : undefined), () => forget(path));
      });
      watcher.on("error", () => forget(dir));
      watchers.set(dir, watcher);
    } catch (error) {
      warn(`${dir} is not watched: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await arm(path, report);
      else if (report) events.push(path);
    }
  };
  for (const root of roots) {
    void stat(root.dir).then((info) => (info.isDirectory() ? arm(root.dir, false) : undefined), () => undefined);
  }
  return () => {
    stopped = true;
    for (const watcher of watchers.values()) watcher.close();
    watchers.clear();
  };
}
