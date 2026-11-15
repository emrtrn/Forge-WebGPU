// Independent asset history: persistent document roots share untouched data
// (notably vertex arrays); one slider/gizmo gesture coalesces to one step.
//
// A save the disk refuses (409) keeps the draft. `compare` reads the disk's
// version against the baseline (plan phase 4 step 8): the same field-level
// three-way merge as the level (core merge.ts); `merge` takes the disk's
// version as the new baseline with the draft's changes over it (each conflict
// by a pick), clears the history (user decision 2026-11-15) and stays dirty
// until saved. Reload drops the draft.
import { jsonEquals, mergeJson, stringifyDocument, type FieldConflict, type MergeSide, type SaveClient, type SaveResponseBody } from "../../core/index.ts";
import { setAtPath, type FormPath } from "../../engine/edit/formPath.ts";
import type { AssetDocument, AssetDocumentAdapter, EditableAsset } from "./assetDocument.ts";

/** The disk's version against the draft (`AssetSession.compare`). */
export interface AssetDiskCompare {
  readonly theirs: AssetDocument;
  readonly revision: string;
  /** Places the draft and the disk both changed differently. */
  readonly conflicts: readonly FieldConflict[];
  /** The disk's version is the baseline (nothing changed there since it was read). */
  readonly unchanged: boolean;
}

export interface AssetSession {
  readonly asset: EditableAsset;
  readonly adapter: AssetDocumentAdapter;
  value(): AssetDocument;
  revision(): string;
  dirty(): boolean;
  busy(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  edit(label: string, path: FormPath, value: unknown, phase?: "input" | "commit"): boolean;
  undo(): void;
  redo(): void;
  save(): Promise<{ readonly ok: boolean; readonly message: string }>;
  reload(): Promise<void>;
  compare(): Promise<AssetDiskCompare>;
  /** The draft over the disk's version read by `compare`, each conflict by `pick` (by its path). */
  merge(disk: AssetDiskCompare, pick: (path: readonly string[]) => MergeSide): { readonly ok: boolean; readonly message: string };
  result(): SaveResponseBody | null;
  onChange(listener: () => void): () => void;
}

export async function openAssetSession(asset: EditableAsset, adapter: AssetDocumentAdapter, client: SaveClient): Promise<AssetSession> {
  const read = async () => {
    const file = await client.read(adapter.path);
    if (!file) throw new Error(`No asset at ${adapter.path}.`);
    const result = adapter.normalize(JSON.parse(file.text));
    if (!result.ok || !result.value) throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    if (result.value.id !== asset.id) throw new Error("The asset's identity changed on disk; refresh the Content Browser.");
    return { doc: result.value, revision: file.revision };
  };
  const initial = await read();
  let current = initial.doc, baseline = initial.doc, revision = initial.revision;
  let busy = false, lastResult: SaveResponseBody | null = null;
  type Change = { before: AssetDocument; after: AssetDocument; key: string | null };
  const undo: Change[] = [], redo: Change[] = [];
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const session: AssetSession = {
    asset, adapter, value: () => current, revision: () => revision,
    dirty: () => !jsonEquals(current, baseline), busy: () => busy,
    canUndo: () => asset.writable && !busy && undo.length > 0,
    canRedo: () => asset.writable && !busy && redo.length > 0,
    edit(label, path, value, phase = "commit") {
      if (!asset.writable || busy || ["schema", "id", "type"].includes(String(path[0]))) return false;
      const next = setAtPath(current, path, value);
      // Root replacement is used by presets; its envelope remains immutable.
      if (next.id !== current.id || next.schema !== current.schema || next.type !== current.type) return false;
      const key = `${label}:${JSON.stringify(path)}`;
      const previous = undo.at(-1);
      if (!jsonEquals(current, next)) {
        if (previous?.key === key) previous.after = next;
        else { undo.push({ before: current, after: next, key: phase === "input" ? key : null }); if (undo.length > 200) undo.shift(); }
        current = next;
        redo.length = 0;
      }
      if (phase === "commit" && undo.at(-1)) undo.at(-1)!.key = null;
      notify();
      return true;
    },
    undo() { if (!session.canUndo()) return; const change = undo.pop()!; change.key = null; redo.push(change); current = change.before; notify(); },
    redo() { if (!session.canRedo()) return; const change = redo.pop()!; change.key = null; undo.push(change); current = change.after; notify(); },
    async save() {
      if (!asset.writable) return { ok: false, message: "This asset is read-only." };
      if (busy) return { ok: false, message: "A save is already in progress." };
      if (!session.dirty()) return { ok: true, message: "No changes to save." };
      const checked = adapter.normalize(current);
      if (!checked.ok || !checked.value) return { ok: false, message: checked.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ") };
      busy = true; notify();
      try {
        lastResult = await client.save({ writes: [{ path: adapter.path, base: revision, text: stringifyDocument(checked.value) }], deletes: [] });
        if (lastResult.status !== "saved") return {
          ok: false, message: lastResult.status === "conflict" ? "Changed on disk (409). Your draft is kept. Compare to merge it, or Reload to read the new version."
            : lastResult.message ?? lastResult.issues?.map((issue) => `${issue.file} ${issue.path}: ${issue.message}`).join("; ") ?? "Save refused.",
        };
        const saved = await read();
        current = baseline = saved.doc; revision = saved.revision;
        undo.length = redo.length = 0;
        return { ok: true, message: `Saved ${asset.name}` };
      } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
      finally { busy = false; notify(); }
    },
    async reload() {
      if (busy) return;
      busy = true; notify();
      try { const loaded = await read(); current = baseline = loaded.doc; revision = loaded.revision; undo.length = redo.length = 0; lastResult = null; }
      finally { busy = false; notify(); }
    },
    async compare() {
      const disk = await read();
      const conflicts = mergeJson(baseline, current, disk.doc).conflicts;
      return { theirs: disk.doc, revision: disk.revision, conflicts, unchanged: jsonEquals(disk.doc, baseline) };
    },
    merge(disk, pick) {
      if (busy) return { ok: false, message: "A save is in progress." };
      const merged = mergeJson(baseline, current, disk.theirs, (conflict) => pick(conflict.path)).value;
      const checked = adapter.normalize(merged);
      if (!checked.ok || !checked.value) return { ok: false, message: `The merge does not check: ${checked.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}` };
      baseline = disk.theirs; revision = disk.revision;
      current = jsonEquals(checked.value, disk.theirs) ? disk.theirs : checked.value;
      undo.length = redo.length = 0; lastResult = null;
      notify();
      return { ok: true, message: session.dirty() ? "Merged with the disk; save to write your changes (undo history cleared)." : "Merged with the disk; nothing left to save." };
    },
    result: () => lastResult,
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return session;
}
