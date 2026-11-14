// The editor's edit commands (INV-A08, plan phase 4 step 5c): actorOps.ts
// on the editor session, each one transaction (one undo step) with Forge's
// labels and status texts, the selection following the result (Forge: the
// copies, the group, the ungrouped children). DOM-free: the clipboard is
// handed in (the page gives the system clipboard, user decision 2026-11-14).

import type { ActorId, ClassResolver, SchemaRegistry } from "../../core/index.ts";
import type { EditorSession } from "../session/editorSession.ts";
import {
  copyText,
  deletionOf,
  duplicateActors,
  groupActors,
  pasteActors,
  readClipboard,
  selectTarget,
  ungroupActors,
  type OpsContext,
} from "./actorOps.ts";
import { reparentActors } from "./hierarchy.ts";

export interface EditClipboard {
  write(text: string): Promise<void>;
  read(): Promise<string>;
}

/** The clipboard the page falls back to when the system one refuses (no permission, not focused). */
export function memoryClipboard(): EditClipboard {
  let held = "";
  return {
    write: async (text) => {
      held = text;
    },
    read: async () => held,
  };
}

/** The system clipboard with the page's memory behind it: a refused write still pastes in this page. */
export function pageClipboard(system: { writeText(text: string): Promise<void>; readText(): Promise<string> } | undefined): EditClipboard {
  const memory = memoryClipboard();
  return {
    async write(text) {
      await memory.write(text);
      try {
        await system?.writeText(text);
      } catch {
        // The page's copy stands.
      }
    },
    async read() {
      try {
        const text = await system?.readText();
        if (text) return text;
      } catch {
        // Fall back to the page's copy.
      }
      return memory.read();
    },
  };
}

export interface EditCommands {
  duplicate(): ActorId[];
  remove(): void;
  copy(): Promise<void>;
  cut(): Promise<void>;
  paste(): Promise<void>;
  group(): void;
  ungroup(): void;
  /** The other selected actors under the primary (Forge's Parent to active). */
  parentToActive(): void;
  unparent(): void;
  /** What a viewport click on `id` selects (the outermost group around it). */
  clickTarget(id: ActorId): ActorId;
  /** Alt + gizmo drag: duplicates the selection as the first half of one undo step (`coalesce`); the copies become the selection. */
  duplicateForDrag(coalesce: string): boolean;
}

export interface EditCommandsOptions {
  readonly editor: EditorSession;
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  readonly clipboard: EditClipboard;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  /** New actor GUIDs (tests). */
  readonly newId?: () => ActorId;
}

export function createEditCommands(options: EditCommandsOptions): EditCommands {
  const { editor, status, clipboard } = options;
  const context: OpsContext = {
    lookup: (id) => editor.level.actor(id),
    actors: () => editor.level.level.actors,
    registry: options.registry,
    resolveClass: options.resolveClass,
    ...(options.newId ? { newId: options.newId } : {}),
  };
  const selected = (): readonly ActorId[] => editor.selection.ids();
  const nameOf = (ids: readonly ActorId[]): string => (ids.length === 1 ? (editor.level.actor(ids[0]!)?.name ?? "actor") : `${ids.length} actors`);
  const failed = (result: { ok: boolean; issues: readonly { message: string }[] }): boolean => {
    if (result.ok) return false;
    status(result.issues.map((issue) => issue.message).join("; "), "error");
    return true;
  };

  const duplicate = (coalesce?: string): ActorId[] => {
    const ids = selected();
    if (ids.length === 0) {
      status("No selected object to duplicate.", "warning");
      return [];
    }
    const copy = duplicateActors(context, ids);
    if (copy.refused.length > 0) status(`${nameOf(copy.refused)} is one per level and is not duplicated.`, "warning");
    if (copy.docs.length === 0) return [];
    const result = editor.edit(`Duplicate ${nameOf(dragRootsOf(ids))}`, (tx) => {
      for (const doc of copy.docs) tx.setActor(doc);
    }, coalesce === undefined ? {} : { coalesce });
    if (failed(result)) return [];
    editor.selection.set(copy.roots);
    return copy.roots;
  };
  const dragRootsOf = (ids: readonly ActorId[]): ActorId[] => ids.filter((id) => !ids.includes(editor.level.actor(id)?.parent as ActorId));

  const remove = (): void => {
    const ids = selected();
    if (ids.length === 0) {
      status("No selected object to delete.", "warning");
      return;
    }
    const doomed = deletionOf(context, ids);
    const label = `Delete ${nameOf(dragRootsOf(ids))}`;
    if (failed(editor.edit(label, (tx) => {
      for (const id of doomed) tx.removeActor(id);
    }))) return;
    status(`Deleted ${doomed.length} actor${doomed.length === 1 ? "" : "s"}`);
  };

  const copy = async (): Promise<boolean> => {
    const text = copyText(context, selected());
    if (!text) {
      status("No selected object to copy.", "warning");
      return false;
    }
    await clipboard.write(text.text);
    status(`Copied ${text.count} actor${text.count === 1 ? "" : "s"}`);
    return true;
  };

  return {
    duplicate: () => duplicate(),
    remove,
    copy: async () => void (await copy()),
    async cut() {
      if (await copy()) remove();
    },
    async paste() {
      const actors = readClipboard(await clipboard.read());
      if (!actors) {
        status("The clipboard holds no actors.", "warning");
        return;
      }
      const pasted = pasteActors(context, actors);
      if (pasted.refused.length > 0) status("A one-per-level actor on the clipboard is not pasted.", "warning");
      if (pasted.docs.length === 0) return;
      if (failed(editor.edit(`Paste ${pasted.roots.length === 1 ? (pasted.docs[0]?.name ?? "actor") : `${pasted.roots.length} actors`}`, (tx) => {
        for (const doc of pasted.docs) tx.setActor(doc);
      }))) return;
      editor.selection.set(pasted.roots);
      status(`Pasted ${pasted.roots.length} actor${pasted.roots.length === 1 ? "" : "s"}`);
    },
    group() {
      const grouped = groupActors(context, selected());
      if (!grouped) {
        status("Select at least two objects to group.", "warning");
        return;
      }
      if (failed(editor.edit(`Group ${grouped.docs.length - 1} objects`, (tx) => {
        for (const doc of grouped.docs) tx.setActor(doc);
      }))) return;
      editor.selection.set([grouped.group.id]);
    },
    ungroup() {
      const ungrouped = ungroupActors(context, selected());
      if (!ungrouped) {
        status("Selection is not grouped.", "warning");
        return;
      }
      if (failed(editor.edit(`Ungroup ${ungrouped.docs.length} objects`, (tx) => {
        for (const doc of ungrouped.docs) tx.setActor(doc);
        for (const id of ungrouped.removed) tx.removeActor(id);
      }))) return;
      editor.selection.set(ungrouped.docs.map((doc) => doc.id));
    },
    parentToActive() {
      const [primary, ...others] = selected();
      if (primary === undefined || others.length === 0) {
        status("Select the children, then the parent last (it is the active one).", "warning");
        return;
      }
      const moved = reparentActors(context.lookup, others, primary);
      if (moved.refused.length > 0) status("An actor cannot go under itself or its own child.", "warning");
      if (moved.docs.length === 0) return;
      failed(editor.edit(`Parent ${moved.docs.length} to ${editor.level.actor(primary)?.name ?? "actor"}`, (tx) => {
        for (const doc of moved.docs) tx.setActor(doc);
      }));
    },
    unparent() {
      const moved = reparentActors(context.lookup, selected(), null);
      if (moved.docs.length === 0) {
        status("Selection has no parent.", "warning");
        return;
      }
      failed(editor.edit(`Unparent ${moved.docs.length} objects`, (tx) => {
        for (const doc of moved.docs) tx.setActor(doc);
      }));
    },
    clickTarget: (id) => selectTarget(context, id),
    duplicateForDrag: (coalesce) => duplicate(coalesce).length > 0,
  };
}
