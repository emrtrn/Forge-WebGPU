// Play sessions (plan phase 4 step 8, decision 8, architecture A6): the
// editor's unsaved level reaches a game tab without a save.
//
//   POST /__forge/play     JSON: { id?, level, camera?, writes: [{ path, text }], deletes: [path] }
//                          -> 200 { status: "ready", id }; 400 request, 403 path, 413 size, 422 document
//   GET  /__forge/play?id= -> 200 { id, level, camera }, 404 when the session is gone
//   GET  /__forge/read?path=&play=<id>   the session's copy of a file when it has one, else the disk's
//
// A session is a layer over the project: the dirty files of one level only
// (its `level.json` and `cells/<x>_<z>.json`), checked and written in their
// canonical form like a save would, plus the level's `cells.json` the server
// builds from the layer and the disk (the index is the server's, as in a
// save). It lives in `<project>/.forge-session/<id>/` and never touches the
// project's files, so a read-only project (the engine's samples) plays too.
// The game tab reads through it, so reloading the tab plays the same state.
//
// The editor tab keeps one id and every Play replaces its session; at most
// `limit` sessions stay (the oldest go). The folder is removed when the
// server starts: a session does not outlive the server that made it.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CELL_INDEX_FILE,
  cellKeyOfFile,
  isJsonObject,
  LEVEL_FILE,
  nextCellIndex,
  normalizeLevelCellIndex,
  stringifyDocument,
  type LevelCellIndexDoc,
  type LevelId,
  type PartKey,
  type PlayCameraBody,
  type PlayResponseBody,
  type PlaySessionBody,
} from "../../src/core/index.ts";
import { fileRevision } from "../assets/revision.ts";
import type { DocumentCheck, SaveContext, SaveIssue } from "../save/transaction.ts";
import { normalizeProjectPath, ProjectPathError } from "./projectPaths.ts";

export const PLAY_SESSION_DIR = ".forge-session";
export const MAX_PLAY_SESSIONS = 8;
export const PLAY_ID = /^[0-9a-f]{32}$/;

interface StoredSession extends PlaySessionBody {
  readonly created: number;
  /** Project path -> stored file name in the session folder; null = the file is deleted in the session. */
  readonly files: Readonly<Record<string, string | null>>;
}

export interface PlaySessions {
  create(body: unknown): Promise<PlayResponseBody>;
  info(id: string): PlaySessionBody | null;
  /**
   * The session's bytes of a project path: undefined when the session does not
   * hold the path (read the disk), null when the session deletes it. Throws
   * `PlaySessionMissing` for an unknown session.
   */
  overlay(id: string, path: string): Promise<Buffer | null | undefined>;
}

export class PlaySessionMissing extends Error {}

export interface PlaySessionOptions {
  /** Project root; sessions live in `<root>/.forge-session/`. */
  readonly root: string;
  /** Absolute path of a readable project path (project content or a labelled engine root); throws `ProjectPathError`. */
  readonly resolve: (path: string) => string;
  /** The save service's document check: a session holds what a save would write. */
  readonly check: DocumentCheck;
  readonly limit?: number;
  readonly now?: () => number;
}

class RequestError extends Error {}

const isFiniteTuple = (value: unknown, length: number): boolean =>
  Array.isArray(value) && value.length === length && value.every((n) => typeof n === "number" && Number.isFinite(n));

function parseCamera(raw: unknown): PlayCameraBody | null {
  if (raw === undefined || raw === null) return null;
  if (!isJsonObject(raw) || !isFiniteTuple(raw.position, 3) || !isFiniteTuple(raw.quaternion, 4)) {
    throw new RequestError("camera is { position: [x, y, z], quaternion: [x, y, z, w] }.");
  }
  return { position: raw.position as unknown as PlayCameraBody["position"], quaternion: raw.quaternion as unknown as PlayCameraBody["quaternion"] };
}

/** `content/levels/main` (or `engine:content/...`) without a trailing slash; the label stays. */
function levelFolder(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") throw new RequestError("level is the level's folder.");
  const colon = raw.indexOf(":");
  const label = colon > 0 && !raw.slice(0, colon).includes("/") ? raw.slice(0, colon + 1) : "";
  const rest = normalizeProjectPath(raw.slice(label.length));
  if (rest === "" || rest.split("/").some((part) => part.startsWith("."))) throw new RequestError(`Not a level folder: ${raw}`);
  return `${label}${rest}`;
}

/** The part of the level a path is: null for `level.json`, the cell key for a cell file; refuses any other file. */
function partOf(level: string, path: string): PartKey {
  if (path === `${level}/${LEVEL_FILE}`) return null;
  const key = path.startsWith(`${level}/`) ? cellKeyOfFile(path.slice(level.length + 1)) : null;
  if (key === null) throw new ProjectPathError("outside-root", `A play session holds the level's own files only: ${path}`);
  return key;
}

async function readOrNull(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "EISDIR") return null;
    throw error;
  }
}

function levelIdOf(text: string | null): LevelId | null {
  if (text === null) return null;
  try {
    const json: unknown = JSON.parse(text);
    if (isJsonObject(json) && typeof json.id === "string" && json.id.startsWith("lvl_")) return json.id as LevelId;
  } catch {
    // not JSON
  }
  return null;
}

export async function createPlaySessions(options: PlaySessionOptions): Promise<PlaySessions> {
  const dir = join(options.root, PLAY_SESSION_DIR);
  const limit = options.limit ?? MAX_PLAY_SESSIONS;
  const now = options.now ?? Date.now;
  // A session does not outlive the server that made it.
  await rm(dir, { recursive: true, force: true });
  const sessions = new Map<string, StoredSession>();
  let queue: Promise<unknown> = Promise.resolve();

  const diskText = async (path: string): Promise<string | null> => (await readOrNull(options.resolve(path)))?.toString("utf8") ?? null;

  const build = async (body: unknown): Promise<PlayResponseBody> => {
    if (!isJsonObject(body)) throw new RequestError("The body is a JSON object.");
    const id = body.id === undefined ? randomBytes(16).toString("hex") : body.id;
    if (typeof id !== "string" || !PLAY_ID.test(id)) throw new RequestError("id is 32 lowercase hex digits.");
    const level = levelFolder(body.level);
    const camera = parseCamera(body.camera);
    const rawWrites = body.writes ?? [];
    const rawDeletes = body.deletes ?? [];
    if (!Array.isArray(rawWrites) || !Array.isArray(rawDeletes)) throw new RequestError("writes and deletes are arrays.");
    const writes = rawWrites.map((write) => {
      if (!isJsonObject(write) || typeof write.path !== "string" || typeof write.text !== "string") {
        throw new RequestError("A write is { path, text }.");
      }
      return { path: write.path, text: write.text };
    });
    const deletes = rawDeletes.map((path) => {
      if (typeof path !== "string") throw new RequestError("A delete is a path.");
      return path;
    });
    const seen = new Set<string>();
    for (const path of [...writes.map((write) => write.path), ...deletes]) {
      if (seen.has(path)) throw new RequestError(`${path} is named twice.`);
      seen.add(path);
      options.resolve(path); // refuses a path outside the readable roots
    }
    const parts = new Map<string, PartKey>();
    for (const path of seen) parts.set(path, partOf(level, path));
    if (deletes.includes(`${level}/${LEVEL_FILE}`)) throw new RequestError("A play session cannot delete the level's level.json.");

    const pending = writes.map((write) => ({ path: write.path, text: write.text }));
    const deleted = new Set(deletes);
    const context: SaveContext = {
      pending,
      async textAfter(path) {
        const write = pending.find((one) => one.path === path);
        if (write) return write.text;
        if (deleted.has(path)) return null;
        return diskText(path);
      },
    };
    const issues: SaveIssue[] = [];
    const canonical: { path: string; bytes: Buffer }[] = [];
    for (const write of writes) {
      const checked = await options.check(write, context);
      issues.push(...checked.issues);
      canonical.push({ path: write.path, bytes: Buffer.from(checked.text, "utf8") });
    }
    if (issues.some((issue) => issue.severity === "error")) {
      return { status: "rejected", reason: "document", message: "The level does not check.", issues };
    }
    const levelText = await context.textAfter(`${level}/${LEVEL_FILE}`);
    const levelId = levelIdOf(levelText);
    if (levelId === null) return { status: "rejected", reason: "document", message: `No level at ${level}.` };

    // The level's index over the layer: the disk's, with the layer's cells written and deleted.
    const files: { path: string; bytes: Buffer | null }[] = [...canonical, ...deletes.map((path) => ({ path, bytes: null }))];
    if (files.length > 0) {
      const indexPath = `${level}/${CELL_INDEX_FILE}`;
      const indexText = await diskText(indexPath);
      let previous: LevelCellIndexDoc | null = null;
      if (indexText !== null) {
        try {
          previous = normalizeLevelCellIndex(JSON.parse(indexText), { strict: false }).value;
        } catch {
          previous = null;
        }
      }
      if (previous !== null && previous.level !== levelId) previous = null;
      const written = new Map<PartKey, string>();
      for (const file of canonical) written.set(parts.get(file.path)!, fileRevision(file.bytes));
      if (!written.has(null) && previous === null) written.set(null, fileRevision(Buffer.from(levelText!, "utf8")));
      const removed = deletes.map((path) => parts.get(path)!).filter((key): key is string => key !== null);
      const next = nextCellIndex(levelId, previous, written, removed);
      if (next !== null) files.push({ path: indexPath, bytes: Buffer.from(stringifyDocument(next), "utf8") });
    }

    // Written beside the old session, then swapped in: a game tab reading meanwhile sees one whole session.
    await mkdir(dir, { recursive: true });
    const next = join(dir, `.${id}-${randomBytes(4).toString("hex")}`);
    await mkdir(next, { recursive: true });
    const stored: Record<string, string | null> = {};
    let index = 0;
    for (const file of files) {
      if (file.bytes === null) {
        stored[file.path] = null;
        continue;
      }
      const name = `${index++}.json`;
      await writeFile(join(next, name), file.bytes);
      stored[file.path] = name;
    }
    const session: StoredSession = { id, level, camera, created: now(), files: stored };
    await writeFile(join(next, "session.json"), `${JSON.stringify(session, null, 2)}\n`);
    sessions.delete(id);
    await rm(join(dir, id), { recursive: true, force: true });
    await rename(next, join(dir, id));
    sessions.set(id, session);
    // The oldest go past the limit (a Map keeps insertion order; a replaced session went to the end).
    while (sessions.size > limit) {
      const oldest = sessions.keys().next().value!;
      sessions.delete(oldest);
      await rm(join(dir, oldest), { recursive: true, force: true });
    }
    return { status: "ready", id };
  };

  return {
    create(body) {
      const run = queue.then(async (): Promise<PlayResponseBody> => {
        try {
          return await build(body);
        } catch (error) {
          if (error instanceof RequestError) return { status: "rejected", reason: "request", message: error.message };
          if (error instanceof ProjectPathError) return { status: "rejected", reason: "path", message: error.message };
          throw error;
        }
      });
      queue = run.catch(() => undefined);
      return run;
    },
    info(id) {
      const session = sessions.get(id);
      return session ? { id: session.id, level: session.level, camera: session.camera } : null;
    },
    async overlay(id, path) {
      const session = PLAY_ID.test(id) ? sessions.get(id) : undefined;
      if (!session) throw new PlaySessionMissing(`No play session ${id}; press Play in the editor again.`);
      if (!Object.hasOwn(session.files, path)) return undefined;
      const name = session.files[path];
      if (name === null || name === undefined) return null;
      return readFile(join(dir, id, name));
    },
  };
}

