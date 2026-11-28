// Saving edited terrains (plan 5d step 2, decision 3; Forge WebGL
// src/editor/terrainStore.ts @ forge-webgl-final, through this repo's save
// service instead of Forge's per-file endpoints).
//
// A participant of the editor session's Save (editorSession.ts): after the
// level, each terrain edit session with unsaved tiles writes, in one save
// transaction, its dirty tiles (each in the height format it was read with),
// the tiles a widened height range re-encodes, its far map and its definition
// (`captureWorldTerrainSave`). Every write names the revision it was read
// with: a file another writer changed since is a conflict (409) and nothing is
// written; the edits stay. Tiles edited again while the save ran stay dirty.
// A tile made here (Expand, 5d step 4) is written as a new file; a tile file
// the definition no longer lists (an undone Expand) is deleted.
//
// A terrain in engine content or a pack is read only (A9): Save refuses it.
//
// `diskChanged`: when the dev server reports a terrain's files changed by
// someone else, a clean session is dropped (the terrain draws from disk
// again); one with unsaved edits is kept and its next Save reports the
// conflict. The editor's own writes come back with the revisions it already
// holds and change nothing; so does a late event of an earlier own save (a
// tile written, then deleted by the next save): every path and revision this
// editor wrote or deleted is remembered. An event can also arrive after a
// later write and name what was there before it (the bytes the session read,
// then saved over): an unknown revision is checked against the disk, and only
// a disk that differs from what the session holds drops it. Dropping it
// otherwise would leave the drawn terrain on a session Save no longer sees.

import { dataDocument, stringifyDocument, TerrainAssetType, type AssetId, type ChangedFileBody, type SaveClient, type SaveRequestBody } from "../../core/index.ts";
import type { TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import type { TerrainEditSession } from "../../engine/terrain/terrainEditSession.ts";
import { reencodeTerrainTileRange } from "../../engine/terrain/worldTerrainSave.ts";
import type { SessionParticipant } from "../session/editorSession.ts";

const DOCUMENT_SUFFIX = ".terrain.json";

export interface LandscapeSaveOptions {
  readonly editing: TerrainEditing;
  readonly client: SaveClient;
  /** The project path of a terrain document (`content/…/x.terrain.json`, `engine:…`); null when unknown. */
  readonly documentPath: (guid: string) => string | null;
  /** Whether that path may be written (a project file, not engine content or a pack). */
  readonly writable: (path: string) => boolean;
  /** A file's bytes with the revision the server reports; null when it does not exist. */
  readonly readFile: (path: string) => Promise<{ readonly bytes: Uint8Array; readonly revision: string } | null>;
}

export interface LandscapeSave extends SessionParticipant {
  /**
   * Files changed on disk: the GUIDs of terrains whose drawn data should be
   * read again (their clean sessions were dropped). Dirty ones are kept.
   */
  diskChanged(files: readonly ChangedFileBody[]): Promise<string[]>;
}

/** A terrain document's part paths: `{stem}.global.bin`, `{stem}.tiles/<key>.tile.bin`. */
export function terrainPartPaths(documentPath: string): { readonly global: string; readonly tiles: string; tile(key: string): string } {
  const stem = documentPath.slice(0, -DOCUMENT_SUFFIX.length);
  return { global: `${stem}.global.bin`, tiles: `${stem}.tiles/`, tile: (key) => `${stem}.tiles/${key}.tile.bin` };
}

/** Unsaved items of a session: its dirty tiles, at least one when only the definition is. */
function dirtyCount(session: TerrainEditSession): number {
  return session.dirty ? Math.max(1, session.dirtyKeys().length) : 0;
}

export function createLandscapeSave(options: LandscapeSaveOptions): LandscapeSave {
  const { editing, client } = options;
  /** `path@revision` of every file this editor wrote, `path@` of every one it deleted. */
  const own = new Set<string>();

  const saveOne = async (guid: string, session: TerrainEditSession): Promise<{ ok: boolean; message: string; files: number; conflict?: true }> => {
    const path = options.documentPath(guid);
    if (path === null || !path.endsWith(DOCUMENT_SUFFIX)) return { ok: false, message: `Terrain ${guid} has no document to save into`, files: 0 };
    if (!options.writable(path)) return { ok: false, message: `${path} is read only (engine content or a pack); copy the terrain into the project to edit it`, files: 0 };
    const capture = session.capture();
    if (!capture) return { ok: true, message: "Nothing to save", files: 0 };
    const { snapshot } = capture;
    const parts = terrainPartPaths(path);
    const writes: { path: string; base: string | null; text?: string; staged?: string }[] = [];
    for (const tile of snapshot.tiles) {
      const file = session.files.get(tile.key);
      if (!file || (file.revision === null && !file.created)) return { ok: false, message: `Terrain tile ${tile.key}: its revision is unknown; reload the page before saving`, files: 0 };
      writes.push({ path: parts.tile(tile.key), base: file.created ? null : file.revision, staged: (await client.stageBinary(tile.bytes)).id });
    }
    // Tiles never loaded here, rewritten for the wider range: the disk copy is current.
    for (const key of snapshot.reencode) {
      const read = await options.readFile(parts.tile(key));
      if (!read) return { ok: false, message: `Terrain tile ${key} is missing on disk; cannot widen its range`, files: 0 };
      const bytes = reencodeTerrainTileRange(key, read.bytes, snapshot.def.heightMin, snapshot.def.heightMax);
      writes.push({ path: parts.tile(key), base: read.revision, staged: (await client.stageBinary(bytes)).id });
    }
    // A terrain loaded at once never read its far map (a single tile): the map is derived from the tiles, so the one on disk is replaced as it is now.
    const globalBase = session.globalRevision ?? (await options.readFile(parts.global))?.revision ?? null;
    writes.push({ path: parts.global, base: globalBase, staged: (await client.stageBinary(snapshot.global)).id });
    writes.push({ path, base: session.documentRevision, text: stringifyDocument(dataDocument(TerrainAssetType, guid as AssetId, snapshot.def as unknown as Record<string, unknown>)) });
    const deletes = [...capture.deletes].map(([key, base]) => ({ path: parts.tile(key), base }));
    const request: SaveRequestBody = { writes, deletes };
    const response = await client.save(request);
    if (response.status === "saved") {
      for (const file of response.files) own.add(`${file.path}@${file.revision}`);
      for (const removed of deletes) own.add(`${removed.path}@`);
      const revision = new Map(response.files.map((file) => [file.path, file.revision] as const));
      const tiles = new Map<string, string | null>();
      for (const key of [...snapshot.tiles.map((tile) => tile.key), ...snapshot.reencode]) {
        const written = revision.get(parts.tile(key));
        if (written !== undefined) tiles.set(key, written);
      }
      session.acknowledge(capture, {
        ...(revision.has(path) ? { document: revision.get(path)! } : {}),
        ...(revision.has(parts.global) ? { global: revision.get(parts.global)! } : {}),
        tiles,
      });
      return { ok: true, message: "Saved", files: writes.length + deletes.length };
    }
    if (response.status === "conflict") {
      const names = response.conflicts.map((conflict) => conflict.path.slice(conflict.path.lastIndexOf("/") + 1));
      return { ok: false, conflict: true, files: 0, message: `Terrain changed on disk since it was read (${names.join(", ")}); your edits are kept, reload the page to take the disk's` };
    }
    const issues = (response.issues ?? []).map((issue) => `${issue.file} ${issue.path}: ${issue.message}`);
    return { ok: false, files: 0, message: `Terrain save refused: ${[response.message ?? response.reason, ...issues].join("; ")}` };
  };

  return {
    dirty: () => [...editing.sessions().values()].reduce((sum, session) => sum + dirtyCount(session), 0),
    async save() {
      let files = 0;
      for (const [guid, session] of editing.sessions()) {
        if (!session.dirty) continue;
        try {
          const report = await saveOne(guid, session);
          if (!report.ok) return { ...report, files };
          files += report.files;
        } catch (error) {
          return { ok: false, files, message: `Terrain save failed: ${error instanceof Error ? error.message : String(error)}` };
        }
      }
      return { ok: true, files, message: files > 0 ? `Saved ${files} terrain file${files === 1 ? "" : "s"}` : "Nothing to save" };
    },
    async diskChanged(files) {
      const stale: string[] = [];
      for (const [guid, session] of editing.sessions()) {
        const path = options.documentPath(guid);
        if (path === null) continue;
        const parts = terrainPartPaths(path);
        // A file this session read and still holds at that revision (its own save included); a tile it never read does not matter.
        const held = (file: ChangedFileBody): boolean => {
          if (file.path === path) return file.revision === session.documentRevision;
          if (file.path === parts.global) return file.revision === session.globalRevision;
          if (!file.path.startsWith(parts.tiles) || !file.path.endsWith(".tile.bin")) return true;
          const read = session.files.get(file.path.slice(parts.tiles.length, -".tile.bin".length));
          return read === undefined || file.revision === read.revision;
        };
        const unknown = files.filter((file) => !own.has(`${file.path}@${file.revision ?? ""}`) && !held(file));
        if (unknown.length === 0 || session.dirty) continue;
        let changed = false;
        for (const file of unknown) {
          const now = (await options.readFile(file.path))?.revision ?? null;
          // `held` after the read: a save that ran meanwhile has updated what the session holds.
          if (!held({ path: file.path, revision: now })) {
            changed = true;
            break;
          }
        }
        // `drop` refuses a session edited while the disk was read.
        if (changed && editing.drop(guid)) stale.push(guid);
      }
      return stale;
    },
  };
}
