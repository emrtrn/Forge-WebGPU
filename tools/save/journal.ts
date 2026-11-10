// The save journal (architecture §4.6, D9; save service decision 1A).
//
// A save writes every new file next to its target under a temporary name
// (`.<name>.<txid>.tmp`, hidden from scans), then renames them over the
// targets. The journal records what to do so a save interrupted at any point
// ends in a consistent state:
//
// - `prepared`: written before any temporary file. Recovery deletes the
//   temporary files it lists: the old files are untouched, the save did not
//   happen.
// - `committed`: every temporary file is complete. Recovery runs the steps
//   that are left (a rename whose temporary file is gone already happened):
//   the save happens completely.
//
// The journal itself changes state by write-and-rename, so it is never half
// written. Journals live in `<project>/.forge-journal/`.

import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const JOURNAL_DIR = ".forge-journal";

export type JournalStep =
  | { readonly op: "rename"; readonly from: string; readonly to: string }
  | { readonly op: "delete"; readonly path: string };

export interface Journal {
  readonly schema: "forge.saveJournal/1";
  readonly txid: string;
  readonly state: "prepared" | "committed";
  /** Project-relative temporary files. */
  readonly temps: readonly string[];
  /** In order; the level indexes come last. Paths are project-relative. */
  readonly steps: readonly JournalStep[];
}

export function journalPath(root: string, txid: string): string {
  return join(root, JOURNAL_DIR, `${txid}.json`);
}

export async function writeJournal(root: string, journal: Journal): Promise<void> {
  const target = journalPath(root, journal.txid);
  await mkdir(join(root, JOURNAL_DIR), { recursive: true });
  const temp = `${target}.tmp`;
  await writeFile(temp, `${JSON.stringify(journal, null, 2)}\n`);
  await renameWithRetry(temp, target);
}

export async function removeJournal(root: string, txid: string): Promise<void> {
  await rm(journalPath(root, txid), { force: true });
}

/**
 * Windows refuses to replace a file another process has open for a moment
 * (an editor, a file watcher, an indexer). Retry briefly before giving up.
 */
export async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 8 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      await sleep(25 * (attempt + 1));
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Runs the steps of a committed journal from wherever it stopped. */
export async function runSteps(root: string, steps: readonly JournalStep[], hook?: (done: number) => void): Promise<void> {
  let done = 0;
  for (const step of steps) {
    if (step.op === "rename") {
      const from = join(root, step.from);
      // A rename whose temporary file is gone happened before an interruption.
      if (await exists(from)) await renameWithRetry(from, join(root, step.to));
    } else {
      await unlink(join(root, step.path)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    done += 1;
    hook?.(done);
  }
}

export interface RecoveryReport {
  /** Saves completed from a committed journal. */
  readonly rolledForward: string[];
  /** Saves undone from a prepared journal. */
  readonly rolledBack: string[];
}

/** Finishes or undoes every save a journal says was interrupted. */
export async function recoverJournals(root: string): Promise<RecoveryReport> {
  const report: RecoveryReport = { rolledForward: [], rolledBack: [] };
  let names: string[];
  try {
    names = await readdir(join(root, JOURNAL_DIR));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return report;
    throw error;
  }
  for (const name of names.sort()) {
    const path = join(root, JOURNAL_DIR, name);
    if (name.endsWith(".json.tmp")) {
      // A journal that was being written: its state change did not happen.
      await rm(path, { force: true });
      continue;
    }
    if (!name.endsWith(".json")) continue;
    const journal = JSON.parse(await readFile(path, "utf8")) as Journal;
    if (journal.state === "committed") {
      await runSteps(root, journal.steps);
      report.rolledForward.push(journal.txid);
    } else {
      for (const temp of journal.temps) await rm(join(root, temp), { force: true });
      report.rolledBack.push(journal.txid);
    }
    await rm(path, { force: true });
  }
  return report;
}
