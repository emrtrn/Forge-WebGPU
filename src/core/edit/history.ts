// Edit transactions and undo (architecture §4.6; save service decision 1H).
//
// Every edit is a transaction: a labelled list of actor changes, each the
// actor before and after (null before = added, null after = removed). A
// transaction is the undo unit. Consecutive transactions with the same
// coalesce key (a drag, a slider) merge into one: per actor, the first
// "before" and the last "after" are kept.
//
// The history holds at most `limit` transactions; the oldest falls off.
// A new transaction clears the redo stack.

import type { ActorId } from "../id.ts";
import type { ActorDoc } from "../level/model.ts";

export interface ActorChange {
  readonly id: ActorId;
  readonly before: ActorDoc | null;
  /** Position in the level's actor list before the change (where an undo puts it back). */
  readonly beforeIndex: number;
  readonly after: ActorDoc | null;
}

export interface Transaction {
  readonly label: string;
  /** Transactions with the same key that follow each other merge. */
  readonly coalesce: string | null;
  readonly changes: readonly ActorChange[];
}

export const DEFAULT_HISTORY_LIMIT = 200;

export interface History {
  readonly undoStack: readonly Transaction[];
  readonly redoStack: readonly Transaction[];
  /** Records a transaction that has been applied. */
  push(transaction: Transaction): void;
  /** The transaction to undo, taken off the undo stack and put on the redo stack. */
  takeUndo(): Transaction | undefined;
  /** The transaction to redo, taken off the redo stack and put on the undo stack. */
  takeRedo(): Transaction | undefined;
  /** Ends coalescing: the next transaction starts a new undo step even with the same key. */
  seal(): void;
}

/** One change per actor: the first before, the last after. Changes that cancel out are kept (they still dirty the actor). */
export function mergeChanges(first: readonly ActorChange[], second: readonly ActorChange[]): ActorChange[] {
  const merged = new Map<ActorId, ActorChange>();
  for (const change of first) merged.set(change.id, change);
  for (const change of second) {
    const earlier = merged.get(change.id);
    merged.set(change.id, earlier ? { ...earlier, after: change.after } : change);
  }
  return [...merged.values()];
}

export function createHistory(limit = DEFAULT_HISTORY_LIMIT): History {
  const undo: Transaction[] = [];
  const redo: Transaction[] = [];
  let sealed = true;
  return {
    undoStack: undo,
    redoStack: redo,
    push(transaction) {
      redo.length = 0;
      const top = undo.at(-1);
      if (!sealed && top && transaction.coalesce !== null && top.coalesce === transaction.coalesce) {
        undo[undo.length - 1] = { ...top, changes: mergeChanges(top.changes, transaction.changes) };
      } else {
        undo.push(transaction);
        if (undo.length > limit) undo.shift();
      }
      sealed = transaction.coalesce === null;
    },
    takeUndo() {
      const transaction = undo.pop();
      if (transaction) redo.push(transaction);
      sealed = true;
      return transaction;
    },
    takeRedo() {
      const transaction = redo.pop();
      if (transaction) undo.push(transaction);
      sealed = true;
      return transaction;
    },
    seal() {
      sealed = true;
    },
  };
}
