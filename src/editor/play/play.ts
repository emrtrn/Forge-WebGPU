// The editor's Play (plan phase 4 step 8; decision 8, architecture A6):
// the level as the editor holds it, saved or not, in a new game tab, without
// a save. Forge's playTest saved first (Play = Save); here the level's dirty
// files go to a play session on the dev server (`POST /__forge/play`, a layer
// the game tab reads through, never the project's files) and the game opens
// at `/?play=<id>`. The tab can be reloaded: it plays the same session.
//
// One session per editor tab (kept in the tab's sessionStorage, so an editor
// reload keeps it): every Play replaces it, and a game tab opened earlier
// plays the new state after its own reload. Each Play opens a new tab, as in
// Forge: a tab opened with `noopener` (its own browsing context group, so its
// own renderer process and GPU device) cannot be found again by name.
//
// The camera starts where the editor's perspective camera is (Forge's
// writePlayCameraPose), carried in the session, so a reload starts there too.
// A read-only project plays: the session is not the project's files.
//
// An asset editor's draft never plays: the asset window is modal, and closing
// it saves or discards the draft.

import type { LevelSession, PlayCameraBody, SaveClient } from "../../core/index.ts";

const SESSION_KEY = "forge.editor.playSession";
const PLAY_ID = /^[0-9a-f]{32}$/;

export interface PlayReport {
  readonly ok: boolean;
  readonly message: string;
  /** The game tab's address when one was asked for. */
  readonly url?: string;
}

export interface EditorPlayOptions {
  /** The level being edited (its dirty files are what plays). */
  readonly level: LevelSession;
  readonly client: SaveClient;
  /** Where the editor's perspective camera is. */
  readonly camera: () => PlayCameraBody;
  /** The editor tab's session storage (the session id); null keeps it for the page only. */
  readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  /** Opens the game tab. */
  readonly open: (url: string) => void;
  /** The game page's address (the dev server's root). */
  readonly gameUrl?: string;
  /** More of the game tab's query, e.g. `&forceWebGL` when the editor runs in the WebGL2 test mode. */
  readonly extraQuery?: string;
  /** 32 hex digits (tests); a random id otherwise. */
  readonly newId?: () => string;
}

export interface EditorPlay {
  play(): Promise<PlayReport>;
  readonly id: string;
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sessionId(storage: EditorPlayOptions["storage"], make: () => string): string {
  try {
    const stored = storage?.getItem(SESSION_KEY) ?? null;
    if (stored !== null && PLAY_ID.test(stored)) return stored;
  } catch {
    // A new id for this page.
  }
  const id = make();
  try {
    storage?.setItem(SESSION_KEY, id);
  } catch {
    // Kept for this page only.
  }
  return id;
}

export function createEditorPlay(options: EditorPlayOptions): EditorPlay {
  const id = sessionId(options.storage, options.newId ?? randomId);
  let running = false;
  return {
    id,
    async play() {
      if (running) return { ok: false, message: "Play is already starting" };
      running = true;
      try {
        const level = options.level;
        const plan = level.planSave();
        if (plan.status === "needs-load") return { ok: false, message: `Load cells ${plan.cells.join(", ")} before Play` };
        const writes = plan.status === "ready" ? plan.request.writes.map((write) => ({ path: write.path, text: write.text ?? "" })) : [];
        const deletes = plan.status === "ready" ? plan.request.deletes.map((entry) => entry.path) : [];
        const response = await options.client.play({ id, level: level.folder, camera: options.camera(), writes, deletes });
        if (response.status !== "ready") {
          const issues = (response.issues ?? []).map((issue) => `${issue.file} ${issue.path}: ${issue.message}`);
          return { ok: false, message: `Play refused: ${[response.message, ...issues].join("; ")}` };
        }
        const url = `${options.gameUrl ?? "/"}?play=${response.id}${options.extraQuery ?? ""}`;
        options.open(url);
        const unsaved = writes.length + deletes.length;
        return { ok: true, url, message: unsaved === 0 ? "Playing the saved level in a new tab" : "Playing the unsaved level in a new tab (nothing was saved)" };
      } catch (error) {
        return { ok: false, message: `Play failed: ${error instanceof Error ? error.message : String(error)}` };
      } finally {
        running = false;
      }
    },
  };
}
