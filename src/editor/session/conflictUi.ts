// The level's 409 flow (plan phase 4 step 8; architecture §4.6: "reload /
// compare"). A save refused because the files changed on disk since they
// were read (an agent's command, another editor) shows a strip under the top
// bar: Compare… or Reload.
//
// - Reload reads the level on disk and drops this session's changes (after a
//   confirm when there are any).
// - Compare reads it and opens a window: how many of this session's changes
//   and of the disk's merge by themselves, and every actor (or the level's
//   settings) both changed differently, each field with both values and a
//   Mine / Theirs choice (All mine / All theirs set every row). Apply merges
//   (merge.ts, field level): this session's changes stay unsaved over the
//   disk's level, so the next Save writes them against the disk's revisions.
//
// Both clear the undo history (user decision 2026-11-15). Step 9's live
// refresh shows the same strip when a dirty level changes on disk. The
// Compare window (`openCompareWindow`) is the asset editor's too.

import type { FieldConflict, LevelConflict, MergeKey, MergeSide, ReadLevel } from "../../core/index.ts";
import type { EditorSession } from "./editorSession.ts";

export interface ConflictStrip {
  readonly element: HTMLElement;
  /** Shows the strip with why. */
  show(message: string): void;
  hide(): void;
  readonly visible: boolean;
}

export interface ConflictStripOptions {
  readonly document: Document;
  /** Where the strip and the Compare window go (the shell's root). */
  readonly host: HTMLElement;
  readonly editor: EditorSession;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
}

const CONFLICT_CSS = `
.level-conflict {
  position: absolute;
  top: 52px;
  left: 50%;
  z-index: 62;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(760px, calc(100vw - 48px));
  padding: 7px 8px 7px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-left: 3px solid var(--forge-warning);
  border-radius: 6px;
  background: #1b2128;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  color: var(--forge-warning-text);
  font-size: 12px;
  transform: translateX(-50%);
}
.level-conflict[hidden] { display: none; }
.level-conflict-text { flex: 1 1 auto; min-width: 0; }
.level-compare-backdrop {
  position: absolute;
  inset: 0;
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}
.level-compare {
  display: flex;
  flex-direction: column;
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 96px);
  border: 1px solid var(--forge-border-mid);
  border-radius: 8px;
  background: var(--forge-bg-2);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  font-size: 12px;
}
.level-compare-head, .level-compare-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--forge-border-soft);
}
.level-compare-foot { border-top: 1px solid var(--forge-border-soft); border-bottom: 0; justify-content: flex-end; }
.level-compare-head strong { flex: 1 1 auto; }
.level-compare-summary { padding: 8px 12px; color: var(--forge-text-dim); }
.level-compare-list { overflow-y: auto; padding: 0 12px 8px; }
.level-compare-row { padding: 8px 0; border-top: 1px solid var(--forge-border-soft); }
.level-compare-row-head { display: flex; align-items: center; gap: 8px; }
.level-compare-row-head .level-compare-label { flex: 1 1 auto; font-weight: 600; }
.level-compare-field { display: grid; grid-template-columns: 30% 35% 35%; gap: 6px; padding: 3px 0 0 10px; color: var(--forge-text-dim); }
.level-compare-field code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.editor-shell .level-compare-pick button.active { border-color: var(--forge-accent); background: var(--forge-accent); color: var(--forge-accent-text); }
`;

const STYLE_ID = "forge-level-conflict-style";

function installStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CONFLICT_CSS;
  doc.head.appendChild(style);
}

/** A value in a few characters: removed, or short JSON. */
export function shortValue(value: unknown): string {
  if (value === undefined) return "(removed)";
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/** One thing both sides changed differently: an actor, the level's settings, an asset's field. */
export interface CompareRow {
  readonly key: string;
  readonly label: string;
  readonly fields: readonly FieldConflict[];
  /** Shown for a field at the row's root (a removed actor). */
  readonly wholeLabel?: string;
  /** Selects what the row is about (an actor still in the level). */
  readonly select?: () => void;
}

export interface CompareWindowOptions {
  readonly document: Document;
  readonly host: HTMLElement;
  /** `level-compare`, `asset-compare`: the window's test id and its parts' prefix. */
  readonly testId: string;
  readonly summary: string;
  readonly rows: readonly CompareRow[];
  /** Merges with the picks (key -> side, every row mine at first); true closes the window. */
  readonly apply: (picks: ReadonlyMap<string, MergeSide>) => boolean;
}

/** The Compare window: a summary, a row per conflict with Mine / Theirs, All mine / All theirs, Cancel, Apply. */
export function openCompareWindow(options: CompareWindowOptions): { close(): void } {
  const doc = options.document;
  installStyle(doc);
  const id = options.testId;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, testId: string, run: () => void): HTMLButtonElement => {
    const node = el("button", "detail-inline-button", label);
    node.type = "button";
    node.dataset.testid = testId;
    node.addEventListener("click", run);
    return node;
  };
  const picks = new Map<string, MergeSide>(options.rows.map((row) => [row.key, "mine"]));
  const backdrop = el("div", "level-compare-backdrop");
  const window = el("div", "level-compare");
  window.dataset.testid = id;
  window.setAttribute("role", "dialog");
  window.setAttribute("aria-modal", "true");
  window.setAttribute("aria-label", "Compare with disk");
  const head = el("div", "level-compare-head");
  head.append(el("strong", "", "Compare with disk"));
  const summary = el("div", "level-compare-summary", options.summary);
  summary.dataset.testid = `${id}-summary`;
  const list = el("div", "level-compare-list");
  const painted: { key: string; mine: HTMLButtonElement; theirs: HTMLButtonElement }[] = [];
  const paint = (): void => {
    for (const row of painted) {
      const side = picks.get(row.key);
      row.mine.classList.toggle("active", side === "mine");
      row.theirs.classList.toggle("active", side === "theirs");
    }
  };
  for (const conflict of options.rows) {
    const row = el("div", "level-compare-row");
    row.dataset.testid = `${id}-row`;
    row.dataset.key = conflict.key;
    const rowHead = el("div", "level-compare-row-head");
    const pick = el("span", "level-compare-pick");
    const choose = (side: MergeSide) => () => {
      picks.set(conflict.key, side);
      paint();
    };
    const mine = button("Mine", `${id}-mine`, choose("mine"));
    const theirs = button("Theirs", `${id}-theirs`, choose("theirs"));
    pick.append(mine, theirs);
    rowHead.append(el("span", "level-compare-label", conflict.label));
    if (conflict.select) rowHead.append(button("Select", `${id}-select`, conflict.select));
    rowHead.append(pick);
    row.append(rowHead);
    const fieldHead = el("div", "level-compare-field");
    fieldHead.append(el("span", "", "Field"), el("span", "", "Mine"), el("span", "", "Theirs (disk)"));
    row.append(fieldHead);
    for (const field of conflict.fields) {
      const line = el("div", "level-compare-field");
      const mineValue = el("code", "", shortValue(field.mine));
      const theirsValue = el("code", "", shortValue(field.theirs));
      mineValue.title = JSON.stringify(field.mine) ?? "(removed)";
      theirsValue.title = JSON.stringify(field.theirs) ?? "(removed)";
      line.append(el("span", "", field.path.length === 0 ? (conflict.wholeLabel ?? "(whole)") : field.path.join(".")), mineValue, theirsValue);
      row.append(line);
    }
    painted.push({ key: conflict.key, mine, theirs });
    list.append(row);
  }
  paint();
  const close = (): void => {
    backdrop.remove();
    doc.removeEventListener("keydown", keydown, true);
  };
  const keydown = (event: KeyboardEvent): void => {
    // The editor's shortcuts do not run under the window.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  const foot = el("div", "level-compare-foot");
  const all = (side: MergeSide) => () => {
    for (const key of picks.keys()) picks.set(key, side);
    paint();
  };
  if (options.rows.length > 0) foot.append(button("All mine", `${id}-all-mine`, all("mine")), button("All theirs", `${id}-all-theirs`, all("theirs")));
  foot.append(
    button("Cancel", `${id}-cancel`, close),
    button("Apply", `${id}-apply`, () => {
      if (options.apply(picks)) close();
    }),
  );
  window.append(head, summary, list, foot);
  backdrop.append(window);
  options.host.append(backdrop);
  doc.addEventListener("keydown", keydown, true);
  window.querySelector<HTMLButtonElement>(`[data-testid=${id}-apply]`)?.focus();
  return { close };
}

export function createConflictStrip(options: ConflictStripOptions): ConflictStrip {
  const doc = options.document;
  const { editor, status } = options;
  installStyle(doc);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, testId: string, run: () => void): HTMLButtonElement => {
    const node = el("button", "detail-inline-button", label);
    node.type = "button";
    node.dataset.testid = testId;
    node.addEventListener("click", run);
    return node;
  };

  const strip = el("div", "level-conflict");
  strip.dataset.testid = "level-conflict";
  strip.setAttribute("role", "alert");
  strip.hidden = true;
  const text = el("span", "level-conflict-text");
  text.dataset.testid = "level-conflict-text";
  let busy = false;
  const read = async (): Promise<ReadLevel | null> => {
    if (busy) return null;
    busy = true;
    try {
      return await editor.readDisk();
    } catch (error) {
      status(`Reading the level from disk failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      return null;
    } finally {
      busy = false;
    }
  };

  const reload = async (): Promise<void> => {
    if (editor.dirty() > 0 && !doc.defaultView!.confirm("Reload the level from disk?\nYour unsaved level changes will be discarded.")) return;
    const disk = await read();
    if (!disk) return;
    const result = editor.rebase(disk, { mode: "reload" });
    if (!result.ok) {
      status(`Reload refused: ${result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`, "error");
      return;
    }
    hide();
    status("Reloaded the level from disk (undo history cleared)");
  };

  const compare = async (): Promise<void> => {
    if (options.host.querySelector("[data-testid=level-compare]")) return;
    const disk = await read();
    if (!disk) return;
    const { merge } = editor.level.compare(disk.open);
    const parts = [
      `${merge.fromMine.length} of your change${merge.fromMine.length === 1 ? "" : "s"} kept`,
      `${merge.fromTheirs.length + (merge.settingsFromTheirs ? 1 : 0)} from disk taken`,
      `${merge.conflicts.length} conflict${merge.conflicts.length === 1 ? "" : "s"}`,
    ];
    openCompareWindow({
      document: doc,
      host: options.host,
      testId: "level-compare",
      summary: `${parts.join(" · ")}. Apply merges them; your changes stay unsaved until you save.`,
      rows: merge.conflicts.map((conflict: LevelConflict) => ({
        key: conflict.key,
        label: conflict.label,
        fields: conflict.fields,
        wholeLabel: "(whole actor)",
        ...(conflict.key !== "settings" && editor.level.actor(conflict.key) !== undefined
          ? { select: () => editor.selection.set([conflict.key as Exclude<MergeKey, "settings">]) }
          : {}),
      })),
      apply: (picks) => {
        const result = editor.rebase(disk, { mode: "merge", pick: (key) => picks.get(key) ?? "mine" });
        if (!result.ok) {
          status(`The merge does not check: ${result.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`, "error");
          return false;
        }
        hide();
        const unsaved = editor.dirty();
        status(unsaved === 0 ? "Merged with the disk; nothing left to save" : `Merged with the disk; ${unsaved} actor${unsaved === 1 ? "" : "s"} to save (undo history cleared)`);
        return true;
      },
    });
  };

  strip.append(text, button("Compare…", "level-conflict-compare", () => void compare()), button("Reload", "level-conflict-reload", () => void reload()));
  options.host.append(strip);

  const hide = (): void => {
    strip.hidden = true;
  };
  return {
    element: strip,
    show(message) {
      text.textContent = message;
      strip.hidden = false;
    },
    hide,
    get visible() {
      return !strip.hidden;
    },
  };
}
