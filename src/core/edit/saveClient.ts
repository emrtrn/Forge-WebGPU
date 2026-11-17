// The editor's side of the save endpoints (architecture §4.6). `fetch` is
// handed in, so this runs in the browser, in Node and in tests alike, and
// core stays free of the DOM.
//
// `openLevelFromServer` reads a level folder with the revisions the server
// reports; `saveLevelSession` sends what a session's plan says and applies
// the answer.

import { CELL_INDEX_FILE, cellFileOf, LEVEL_FILE, normalizeLevelCell, normalizeLevelCellIndex } from "../level/cellDocs.ts";
import type { CellAssignOptions } from "../level/cells.ts";
import type { LevelPartIssue } from "../level/levelParts.ts";
import { normalizeLevel } from "../level/normalizeLevel.ts";
import { openLevelSession, type LevelSession, type LoadedCell, type OpenLevelOptions, type SavePlan } from "./levelSession.ts";
import {
  FORGE_REQUEST_HEADER,
  type ForgeIdentity,
  type PlayRequestBody,
  type PlayResponseBody,
  type PlaySessionBody,
  type SaveRequestBody,
  type SaveResponseBody,
} from "./saveProtocol.ts";

type Fetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array }) => Promise<{
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
  /** Absent in fakes that only serve text. */
  arrayBuffer?(): Promise<ArrayBuffer>;
}>;

/** What a game reads (plan phase 4 step 2b): the dev server, or the static files of a production build. */
export interface ContentClient {
  /** A project file with its revision; null when it does not exist. */
  read(path: string): Promise<{ readonly text: string; readonly revision: string } | null>;
  /** A project file's bytes (a level's HLOD proxy, phase 5b); null when it does not exist. */
  readBinary?(path: string): Promise<ArrayBuffer | null>;
  /** Which engine and project the server serves. */
  identity(): Promise<ForgeIdentity>;
  /** The project's actor classes as the server holds them (not normalised here). */
  classes(): Promise<readonly unknown[]>;
}

/** The editor's client: reads and writes through the dev server's save service. */
export interface SaveClient extends ContentClient {
  save(request: SaveRequestBody): Promise<SaveResponseBody>;
  stageBinary(bytes: Uint8Array): Promise<{ readonly id: string; readonly size: number; readonly revision: string }>;
  /** Starts (or replaces) a play session: the level's unsaved files in a layer, never the project's files. */
  play(request: PlayRequestBody): Promise<PlayResponseBody>;
  /** A play session's level and camera; null when the session is gone (the server restarted). */
  playSession(id: string): Promise<PlaySessionBody | null>;
}

/**
 * Where a production build keeps its content, under the page's base URL
 * (tools/build-content.ts writes it): `forge/identity.json`,
 * `forge/classes.json`, `forge/asset-files.json`, and every readable file at
 * `forge/files/<path>` with an `engine:` label written as `engine/`.
 */
export const STATIC_CONTENT_DIR = "forge";

/** A project path (`content/levels/main/level.json`, `engine:content/x.png`) as a static file under the content dir. */
export function staticContentFile(path: string): string {
  const colon = path.indexOf(":");
  const relative = colon > 0 && !path.slice(0, colon).includes("/") ? `${path.slice(0, colon)}/${path.slice(colon + 1)}` : `project/${path}`;
  return `files/${relative}`;
}

/** Revision a static read reports: a production build only reads, nothing compares it. */
export const STATIC_REVISION = "0000000000000000";

/** A read-only client over a production build's static content; `baseUrl` is the page's base (`import.meta.env.BASE_URL`). */
export function createStaticContentClient(options: { readonly fetch: Fetch; readonly baseUrl: string }): ContentClient {
  const base = `${options.baseUrl.replace(/\/+$/, "")}/${STATIC_CONTENT_DIR}`;
  const json = async (name: string): Promise<unknown> => {
    const response = await options.fetch(`${base}/${name}`);
    if (response.status !== 200) throw new SaveClientError(response.status, `No ${name} in the build: ${response.status}`);
    return response.json();
  };
  return {
    async read(path) {
      const response = await options.fetch(`${base}/${staticContentFile(path).split("/").map(encodeURIComponent).join("/")}`);
      if (response.status === 404) return null;
      if (response.status !== 200) throw new SaveClientError(response.status, `Reading ${path} failed: ${response.status}`);
      // Static SPA hosts may answer an absent optional level part with index.html.
      if (response.headers.get("content-type")?.toLowerCase().includes("text/html")) return null;
      return { text: await response.text(), revision: STATIC_REVISION };
    },
    async readBinary(path) {
      const response = await options.fetch(`${base}/${staticContentFile(path).split("/").map(encodeURIComponent).join("/")}`);
      if (response.status === 404) return null;
      if (response.status !== 200) throw new SaveClientError(response.status, `Reading ${path} failed: ${response.status}`);
      if (response.headers.get("content-type")?.toLowerCase().includes("text/html")) return null;
      if (!response.arrayBuffer) throw new SaveClientError(response.status, `Reading ${path}: no binary body.`);
      return response.arrayBuffer();
    },
    identity: async () => (await json("identity.json")) as ForgeIdentity,
    classes: async () => ((await json("classes.json")) as { classes: unknown[] }).classes,
  };
}

export class SaveClientError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SaveClientError";
    this.status = status;
  }
}

/** The play session a game tab reads through is gone (the dev server restarted). */
export class PlaySessionGoneError extends SaveClientError {
  constructor(message: string) {
    super(410, message);
    this.name = "PlaySessionGoneError";
  }
}

/**
 * The dev server's client. With `play`, reads go through that play session's
 * layer (plan phase 4 step 8): the game tab of the editor's Play.
 */
export function createSaveClient(options: { readonly fetch: Fetch; readonly baseUrl?: string; readonly play?: string }): SaveClient {
  const base = (options.baseUrl ?? "").replace(/\/+$/, "");
  const headers = { [FORGE_REQUEST_HEADER]: "1" };
  const layer = options.play === undefined ? "" : `&play=${encodeURIComponent(options.play)}`;
  return {
    async readBinary(path) {
      const response = await options.fetch(`${base}/__forge/read?path=${encodeURIComponent(path)}${layer}`, { headers });
      if (response.status === 404) return null;
      if (response.status !== 200) throw new SaveClientError(response.status, `Reading ${path} failed: ${response.status}`);
      if (!response.arrayBuffer) throw new SaveClientError(response.status, `Reading ${path}: no binary body.`);
      return response.arrayBuffer();
    },
    async read(path) {
      const response = await options.fetch(`${base}/__forge/read?path=${encodeURIComponent(path)}${layer}`, { headers });
      if (response.status === 404) return null;
      if (response.status === 410) throw new PlaySessionGoneError(((await response.json()) as { message?: string }).message ?? "The play session is gone.");
      if (response.status !== 200) throw new SaveClientError(response.status, `Reading ${path} failed: ${await response.text()}`);
      const revision = response.headers.get("x-forge-revision");
      if (revision === null) throw new SaveClientError(response.status, `No revision for ${path}.`);
      return { text: await response.text(), revision };
    },
    async save(request) {
      const response = await options.fetch(`${base}/__forge/save`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = (await response.json()) as SaveResponseBody | { status: "error"; message: string };
      if (body.status === "error") throw new SaveClientError(response.status, body.message);
      return body;
    },
    async stageBinary(bytes) {
      const response = await options.fetch(`${base}/__forge/stage-binary`, { method: "POST", headers, body: bytes });
      if (response.status !== 200) throw new SaveClientError(response.status, `Staging failed: ${await response.text()}`);
      return (await response.json()) as { id: string; size: number; revision: string };
    },
    async play(request) {
      const response = await options.fetch(`${base}/__forge/play`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = (await response.json()) as PlayResponseBody | { status: "error"; message: string };
      if (body.status === "error") throw new SaveClientError(response.status, body.message);
      return body;
    },
    async playSession(id) {
      const response = await options.fetch(`${base}/__forge/play?id=${encodeURIComponent(id)}`, { headers });
      if (response.status === 404) return null;
      if (response.status !== 200) throw new SaveClientError(response.status, `No play session: ${await response.text()}`);
      return (await response.json()) as PlaySessionBody;
    },
    async identity() {
      const response = await options.fetch(`${base}/__forge/identity`, { headers });
      if (response.status !== 200) throw new SaveClientError(response.status, `No identity: ${await response.text()}`);
      return (await response.json()) as ForgeIdentity;
    },
    async classes() {
      const response = await options.fetch(`${base}/__forge/classes`, { headers });
      if (response.status !== 200) throw new SaveClientError(response.status, `No classes: ${await response.text()}`);
      return ((await response.json()) as { classes: unknown[] }).classes;
    },
  };
}

export interface OpenedLevel {
  readonly session: LevelSession;
  /** Normalisation and merge issues of the files read. */
  readonly issues: readonly LevelPartIssue[];
  /** Every cell the index lists (loaded or not). */
  readonly cells: readonly string[];
}

/** A level folder as read from the server: what a session opens with (or rebases onto, step 8). */
export interface ReadLevel {
  readonly open: OpenLevelOptions;
  readonly issues: readonly LevelPartIssue[];
  /** Every cell the index lists (loaded or not). */
  readonly cells: readonly string[];
}

/**
 * Opens a level folder through the server. `pick` chooses the cells to load
 * from those the index lists (all by default; the editor loads around the
 * camera, A11).
 */
export async function openLevelFromServer(
  client: ContentClient,
  folder: string,
  options: CellAssignOptions,
  pick: (cells: readonly string[]) => readonly string[] = (cells) => cells,
): Promise<OpenedLevel> {
  const read = await readLevelFromServer(client, folder, options, pick);
  return { session: openLevelSession(read.open, options), issues: read.issues, cells: read.cells };
}

/** Reads a level folder through the server with each file's revision (`openLevelFromServer` without the session). */
export async function readLevelFromServer(
  client: ContentClient,
  folder: string,
  options: CellAssignOptions,
  pick: (cells: readonly string[]) => readonly string[] = (cells) => cells,
): Promise<ReadLevel> {
  const at = (relative: string) => `${folder}/${relative}`;
  const levelFile = await client.read(at(LEVEL_FILE));
  if (!levelFile) throw new SaveClientError(404, `No level at ${folder}.`);
  const issues: LevelPartIssue[] = [];
  const persistent = normalizeLevel(JSON.parse(levelFile.text), options);
  for (const found of persistent.issues) issues.push({ ...found, file: LEVEL_FILE });
  if (!persistent.value) throw new SaveClientError(422, `${folder}/${LEVEL_FILE} cannot be read as a level.`);

  const indexFile = await client.read(at(CELL_INDEX_FILE));
  const index = indexFile ? normalizeLevelCellIndex(JSON.parse(indexFile.text), options).value : null;
  const listed = Object.keys(index?.cells ?? {});
  const cells: LoadedCell[] = [];
  for (const key of pick(listed)) {
    const file = await client.read(at(cellFileOf(key)));
    if (!file) continue;
    const cell = normalizeLevelCell(JSON.parse(file.text), options);
    for (const found of cell.issues) issues.push({ ...found, file: cellFileOf(key) });
    if (cell.value) cells.push({ doc: cell.value, revision: file.revision });
  }
  return { open: { folder, persistent: persistent.value, persistentRevision: levelFile.revision, index, cells }, issues, cells: listed };
}

export type LevelSaveOutcome =
  | Exclude<SavePlan, { status: "ready" }>
  | { readonly status: "sent"; readonly response: SaveResponseBody };

/** Plans, sends and applies one save of a session. */
export async function saveLevelSession(session: LevelSession, client: SaveClient): Promise<LevelSaveOutcome> {
  const plan = session.planSave();
  if (plan.status !== "ready") return plan;
  const response = await client.save(plan.request);
  session.applySaveResult(plan, response);
  return { status: "sent", response };
}
