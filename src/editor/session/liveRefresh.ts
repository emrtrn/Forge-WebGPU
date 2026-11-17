// The editor follows the disk (architecture §4.11, phase 4 decision 4; plan
// step 9f). The dev server tells the editor which files changed on disk
// (tools/server/fileEvents.ts, over Vite's HMR channel); an agent's command,
// another tool or a hand edit wrote them.
//
// - The open level: a change is a level file (`level.json`, a cell) whose
//   revision on disk is not the one the session holds. The editor's own save
//   is no change: the batch waits until no save is running, and by then the
//   session holds the revisions it wrote.
// - A clean level is read again by itself (Reload: the undo history is
//   cleared, user decision 2026-11-15); the selection keeps the actors still
//   there.
// - A dirty level shows the 409 strip (step 8): Compare… or Reload.
// - A level whose `level.json` is gone says so; the session stays (a save
//   would write it again, or the strip's Reload reports the error).
// - Every batch also goes to `others` (the Content Browser, the class list,
//   the asset window), after the level.
//
// No DOM here: the strip and the status line are handed in; Node tests drive it.

import type { ChangedFileBody } from "../../core/index.ts";
import type { EditorSession } from "./editorSession.ts";

export type ChangedFile = ChangedFileBody;

export type LevelChange = "none" | "changed" | "removed";

const CELL_FILE = /^cells\/[^/]+\.json$/;

/**
 * What a batch means for the level open in `folder`: a level file whose
 * revision differs from the one the session holds (`known`: undefined for a
 * file it does not hold). `cells.json` is the server's index of the others.
 */
export function levelChange(folder: string, files: readonly ChangedFile[], known: (path: string) => string | undefined): LevelChange {
  const prefix = `${folder.replace(/\/+$/, "")}/`;
  let changed = false;
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const inside = file.path.slice(prefix.length);
    if (inside !== "level.json" && !CELL_FILE.test(inside)) continue;
    if (inside === "level.json" && file.revision === null) return "removed";
    if ((known(file.path) ?? null) !== file.revision) changed = true;
  }
  return changed ? "changed" : "none";
}

export interface LiveRefreshOptions {
  readonly editor: Pick<EditorSession, "level" | "dirty" | "readDisk" | "rebase" | "idle" | "streaming">;
  /** The 409 strip (conflictUi.ts). */
  readonly strip: { show(message: string): void };
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  /** Everything else that follows the disk, after the level. */
  readonly others?: (files: readonly ChangedFile[]) => void | Promise<void>;
}

export interface LiveRefresh {
  /** One batch from the server; batches are handled one after another. */
  handle(files: readonly ChangedFile[]): Promise<void>;
}

const names = (folder: string, files: readonly ChangedFile[]): string =>
  files
    .filter((file) => file.path.startsWith(`${folder}/`) && !file.path.endsWith("/cells.json"))
    .map((file) => file.path.slice(file.path.lastIndexOf("/") + 1))
    .join(", ");

export function createLiveRefresh(options: LiveRefreshOptions): LiveRefresh {
  const { editor, strip, status } = options;
  let queue: Promise<void> = Promise.resolve();

  const conflict = (files: readonly ChangedFile[]): void => {
    strip.show(`Changed on disk (${names(editor.level.folder, files)}) while you have unsaved changes: compare or reload`);
    status("The level changed on disk; your changes are not saved yet", "warning");
  };

  const level = async (files: readonly ChangedFile[]): Promise<void> => {
    await editor.idle();
    const folder = editor.level.folder;
    // Unloaded cells have no actor edits to compare. Refresh their listing,
    // then read their current bytes only when they enter the camera's range.
    const prefix = `${folder}/cells/`;
    const heldFiles = editor.streaming ? files.filter((file) => {
      if (!file.path.startsWith(prefix) || !file.path.endsWith(".json")) return file.path !== `${folder}/cells.json`;
      const key = file.path.slice(prefix.length, -5);
      return editor.level.isLoaded(key);
    }) : files;
    const change = levelChange(folder, heldFiles, (path) => editor.level.fileRevision(path));
    if (editor.streaming && files.some((file) => file.path === `${folder}/cells.json` || file.path.startsWith(prefix))) {
      try { await editor.streaming.refreshIndex(); }
      catch (error) { status(`Reading the cell index failed: ${error instanceof Error ? error.message : String(error)}`, "error"); return; }
    }
    if (change === "none") return;
    if (change === "removed") {
      status(`${folder}/level.json was removed on disk; saving writes it again`, "warning");
      return;
    }
    if (editor.dirty() > 0) {
      conflict(files);
      return;
    }
    let disk;
    try {
      disk = await editor.readDisk();
    } catch (error) {
      status(`Reading the level from disk failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }
    // An edit made while the disk was read is kept: ask instead.
    if (editor.dirty() > 0) {
      conflict(files);
      return;
    }
    const result = editor.rebase(disk, { mode: "reload" });
    if (!result.ok) {
      status(`The level on disk does not check: ${result.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`, "error");
      return;
    }
    status(`Level updated from disk (${names(folder, files)}; undo history cleared)`);
  };

  const run = async (files: readonly ChangedFile[]): Promise<void> => {
    await level(files);
    await options.others?.(files);
  };

  return {
    handle(files) {
      queue = queue.then(() => run(files), () => run(files));
      return queue;
    },
  };
}
