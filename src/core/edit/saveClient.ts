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
import { openLevelSession, type LevelSession, type LoadedCell, type SavePlan } from "./levelSession.ts";
import { FORGE_REQUEST_HEADER, type SaveRequestBody, type SaveResponseBody } from "./saveProtocol.ts";

type Fetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array }) => Promise<{
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface SaveClient {
  /** A project file with its revision; null when it does not exist. */
  read(path: string): Promise<{ readonly text: string; readonly revision: string } | null>;
  save(request: SaveRequestBody): Promise<SaveResponseBody>;
  stageBinary(bytes: Uint8Array): Promise<{ readonly id: string; readonly size: number; readonly revision: string }>;
}

export class SaveClientError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SaveClientError";
    this.status = status;
  }
}

export function createSaveClient(options: { readonly fetch: Fetch; readonly baseUrl?: string }): SaveClient {
  const base = (options.baseUrl ?? "").replace(/\/+$/, "");
  const headers = { [FORGE_REQUEST_HEADER]: "1" };
  return {
    async read(path) {
      const response = await options.fetch(`${base}/__forge/read?path=${encodeURIComponent(path)}`, { headers });
      if (response.status === 404) return null;
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
  };
}

export interface OpenedLevel {
  readonly session: LevelSession;
  /** Normalisation and merge issues of the files read. */
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
  client: SaveClient,
  folder: string,
  options: CellAssignOptions,
  pick: (cells: readonly string[]) => readonly string[] = (cells) => cells,
): Promise<OpenedLevel> {
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
  const session = openLevelSession(
    { folder, persistent: persistent.value, persistentRevision: levelFile.revision, index, cells },
    options,
  );
  return { session, issues, cells: listed };
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
