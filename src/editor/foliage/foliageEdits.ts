// The open level's painted foliage in the editor (plan 5d step 6, INV-B09): the
// level part (`foliage.json` + `foliage/<x>_<z>.bin`, 5c F4) read for editing,
// its edits and their save. The edit state is the engine's
// (foliagePaintSession.ts); the foliage binding draws edited cells from here
// (`LevelFoliageSource.edits`) and streams the others from the files.
//
// - `ensure` loads the cells under a rectangle before a tool changes them, each
//   with the revision it was read with.
// - `push` records one undo step of applied patches (a stroke, a fill, an
//   action) in the editor session's one undo order.
// - Save (a participant, after the level): the dirty cells and the index in one
//   save transaction with the revisions read; a changed type list rewrites
//   every cell file (they are loaded first). Nothing painted any more: the
//   files go. A conflict (409) writes nothing and keeps the edits.
// - Files changed by someone else: clean state is dropped and read again; with
//   unsaved edits it stays and the next Save reports the conflict. The editor's
//   own saves come back with revisions it knows and change nothing.

import { stringifyDocument, type ChangedFileBody, type LevelId, type SaveClient } from "../../core/index.ts";
import { FOLIAGE_DIR, FOLIAGE_INDEX_FILE, foliageCellFileOf, normalizeLevelFoliageIndex, type LevelFoliageIndex } from "../../core/level/foliage.ts";
import { decodeFoliageCell } from "../../core/level/foliageCells.ts";
import type { LevelFoliageSource } from "../../engine/foliage/levelFoliageSource.ts";
import { FoliagePaintSession, packFoliage, type FoliagePatch, type FoliageRect } from "../../engine/foliage/foliagePaintSession.ts";
import type { EditorSession, SessionParticipant } from "../session/editorSession.ts";

export interface FoliageEditsOptions {
  readonly editor: Pick<EditorSession, "pushStep">;
  readonly client: SaveClient;
  /** The level's folder in the project. */
  readonly folder: string;
  readonly level: LevelId;
  /** The level's grid, for a level without painted foliage. */
  readonly cellSize: () => number;
  readonly writable: boolean;
  /** A file's bytes with the revision the server reports; null when it does not exist. */
  readonly readFile: (path: string) => Promise<{ readonly bytes: Uint8Array; readonly revision: string } | null>;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
}

export interface FoliageEdits extends SessionParticipant {
  /** What the world reads (`LevelFoliageSourceKey`). */
  readonly source: LevelFoliageSource;
  readonly session: FoliagePaintSession;
  /** Reads the index; a different one (or `force`) starts a new session and restreams. */
  refresh(force?: boolean): Promise<void>;
  /** Draws the level's foliage again (a type's asset changed). */
  restream(): void;
  /** Loads the listed cells under a rectangle. */
  ensure(rect: FoliageRect): Promise<void>;
  ensureAll(): Promise<void>;
  /** Applies patches (a tool's change as it happens, outside the history). */
  apply(patches: readonly FoliagePatch[]): void;
  /** Records applied patches as one undo step. */
  push(label: string, patches: readonly FoliagePatch[]): void;
  /** A batch of files changed on disk: foliage files someone else wrote are followed when nothing is unsaved. */
  diskChanged(files: readonly ChangedFileBody[]): Promise<void>;
  /** A cell changed, or the session was replaced (null); returns the unsubscribe. */
  onChange(listener: (key: string | null) => void): () => void;
}

export function createFoliageEdits(options: FoliageEditsOptions): FoliageEdits {
  const { client, folder, status } = options;
  const path = (file: string): string => `${folder}/${file}`;
  const indexPath = path(FOLIAGE_INDEX_FILE);
  const listeners = new Set<(key: string | null) => void>();
  const notify = (key: string | null): void => {
    for (const listener of [...listeners]) listener(key);
  };
  let index: LevelFoliageIndex | null = null;
  let text: string | null | undefined;
  let revision = 0;
  let session = new FoliagePaintSession({ level: options.level, cellSize: options.cellSize(), index: null });
  /** Revisions on disk as read or written, by project path. */
  const revisions = new Map<string, string>();
  /** `path@revision` of every file this editor wrote, `path@` of every one it deleted. */
  const own = new Set<string>();
  const loading = new Map<string, Promise<void>>();

  const load = (key: string): Promise<void> => {
    const running = loading.get(key);
    if (running) return running;
    const target = session;
    const work = (async () => {
      const file = path(foliageCellFileOf(key));
      const read = await options.readFile(file);
      if (!read) throw new Error(`painted foliage cell ${key} is missing on disk`);
      const perType = decodeFoliageCell(read.bytes);
      if (target !== session) return;
      revisions.set(file, read.revision);
      target.load(key, perType);
    })().finally(() => loading.delete(key));
    loading.set(key, work);
    return work;
  };
  const loadAll = async (keys: readonly string[]): Promise<void> => {
    await Promise.all(keys.map(load));
  };

  const edits: FoliageEdits = {
    get session() {
      return session;
    },
    source: {
      get index() {
        return index;
      },
      get revision() {
        return revision;
      },
      load: (file) => client.readBinary?.(path(file)) ?? Promise.resolve(null),
      edits: {
        keys: () => session.edited(),
        cell: (key) => (session.edited().includes(key) ? [...session.instances(key)].map(([type, list]) => ({ type, instances: packFoliage(list) })) : null),
        onChange: (listener) => edits.onChange((key) => {
          if (key !== null) listener(key);
        }),
      },
    },
    async refresh(force = false) {
      const file = await client.read(indexPath);
      const now = file?.text ?? null;
      if (!force && now === text) return;
      const checked = now !== null ? normalizeLevelFoliageIndex(JSON.parse(now), { strict: false }) : null;
      index = checked?.value?.level === options.level ? checked.value : null;
      text = now;
      revisions.clear();
      if (file) revisions.set(indexPath, file.revision);
      loading.clear();
      session = new FoliagePaintSession({ level: options.level, cellSize: options.cellSize(), index });
      revision += 1;
      notify(null);
    },
    restream() {
      revision += 1;
    },
    ensure: (rect) => loadAll(session.missing(rect)),
    ensureAll: () => loadAll(session.listed().filter((key) => !session.loaded(key))),
    apply(patches) {
      for (const key of session.apply(patches, "after")) notify(key);
    },
    push(label, patches) {
      if (patches.length === 0) return;
      const target = session;
      const write = (side: "before" | "after"): void => {
        if (target !== session) {
          status(`${label}: the foliage was read again from disk since; nothing changed`, "warning");
          return;
        }
        try {
          for (const key of target.apply(patches, side)) notify(key);
        } catch (error) {
          status(`${label}: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
      };
      options.editor.pushStep({ label, undo: () => write("before"), redo: () => write("after") });
    },
    dirty: () => session.dirtyCells().length,
    async save() {
      if (!session.dirty) return { ok: true, message: "Nothing to save", files: 0 };
      if (!options.writable) return { ok: false, message: `${folder} is read only; its foliage is not saved`, files: 0 };
      try {
        const target = session;
        // A changed type list rewrites every cell file.
        await loadAll(target.missingForSave());
        const capture = target.capture();
        if (!capture) return { ok: true, message: "Nothing to save", files: 0 };
        const writes: { path: string; base: string | null; text?: string; staged?: string }[] = [];
        for (const [key, bytes] of capture.cells) {
          const file = path(foliageCellFileOf(key));
          writes.push({ path: file, base: revisions.get(file) ?? null, staged: (await client.stageBinary(bytes)).id });
        }
        const deletes: { path: string; base: string }[] = [];
        for (const key of capture.deletes) {
          const base = revisions.get(path(foliageCellFileOf(key)));
          if (base !== undefined) deletes.push({ path: path(foliageCellFileOf(key)), base });
        }
        const document = capture.index ? stringifyDocument(capture.index) : null;
        if (document !== null) writes.push({ path: indexPath, base: revisions.get(indexPath) ?? null, text: document });
        else if (revisions.has(indexPath)) deletes.push({ path: indexPath, base: revisions.get(indexPath)! });
        const response = await client.save({ writes, deletes });
        if (response.status === "saved") {
          for (const file of response.files) {
            if (file.revision !== null) revisions.set(file.path, file.revision);
            own.add(`${file.path}@${file.revision ?? ""}`);
          }
          for (const gone of deletes) {
            revisions.delete(gone.path);
            own.add(`${gone.path}@`);
          }
          target.acknowledge(capture);
          if (target === session) {
            index = capture.index;
            text = document;
          }
          return { ok: true, message: "Saved", files: writes.length + deletes.length };
        }
        if (response.status === "conflict") {
          const names = response.conflicts.map((conflict) => conflict.path.slice(conflict.path.lastIndexOf("/") + 1));
          return { ok: false, conflict: true, files: 0, message: `Painted foliage changed on disk since it was read (${names.join(", ")}); your edits are kept, reload the page to take the disk's` };
        }
        const issues = (response.issues ?? []).map((issue) => `${issue.file} ${issue.path}: ${issue.message}`);
        return { ok: false, files: 0, message: `Foliage save refused: ${[response.message ?? response.reason, ...issues].join("; ")}` };
      } catch (error) {
        return { ok: false, files: 0, message: `Foliage save failed: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    async diskChanged(files) {
      const foreign = files.some((file) => (file.path === indexPath || file.path.startsWith(`${folder}/${FOLIAGE_DIR}/`))
        && !own.has(`${file.path}@${file.revision ?? ""}`) && (revisions.get(file.path) ?? null) !== file.revision);
      if (!foreign) return;
      if (session.dirty) {
        status("Painted foliage changed on disk; your unsaved edits are kept", "warning");
        return;
      }
      await edits.refresh(true);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return edits;
}
