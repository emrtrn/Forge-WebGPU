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
// refresh shows the same strip when a dirty level changes on disk.

import type { LevelConflict, MergeKey, MergeSide, ReadLevel } from "../../core/index.ts";
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
    const picks = new Map<MergeKey, MergeSide>(merge.conflicts.map((conflict) => [conflict.key, "mine"]));

    const backdrop = el("div", "level-compare-backdrop");
    const window = el("div", "level-compare");
    window.dataset.testid = "level-compare";
    window.setAttribute("role", "dialog");
    window.setAttribute("aria-modal", "true");
    window.setAttribute("aria-label", "Compare with disk");
    const head = el("div", "level-compare-head");
    head.append(el("strong", "", "Compare with disk"));
    const summary = el("div", "level-compare-summary");
    summary.dataset.testid = "level-compare-summary";
    const parts = [
      `${merge.fromMine.length} of your change${merge.fromMine.length === 1 ? "" : "s"} kept`,
      `${merge.fromTheirs.length + (merge.settingsFromTheirs ? 1 : 0)} from disk taken`,
      `${merge.conflicts.length} conflict${merge.conflicts.length === 1 ? "" : "s"}`,
    ];
    summary.textContent = `${parts.join(" · ")}. Apply merges them; your changes stay unsaved until you save.`;
    const list = el("div", "level-compare-list");
    const rows: { conflict: LevelConflict; mine: HTMLButtonElement; theirs: HTMLButtonElement }[] = [];
    const paint = (): void => {
      for (const row of rows) {
        const side = picks.get(row.conflict.key);
        row.mine.classList.toggle("active", side === "mine");
        row.theirs.classList.toggle("active", side === "theirs");
      }
    };
    for (const conflict of merge.conflicts) {
      const row = el("div", "level-compare-row");
      row.dataset.testid = "level-compare-row";
      row.dataset.key = conflict.key;
      const rowHead = el("div", "level-compare-row-head");
      const label = el("span", "level-compare-label", conflict.label);
      const pick = el("span", "level-compare-pick");
      const mine = button("Mine", "level-compare-mine", () => {
        picks.set(conflict.key, "mine");
        paint();
      });
      const theirs = button("Theirs", "level-compare-theirs", () => {
        picks.set(conflict.key, "theirs");
        paint();
      });
      pick.append(mine, theirs);
      rowHead.append(label);
      if (conflict.key !== "settings" && editor.level.actor(conflict.key) !== undefined) {
        const id = conflict.key;
        rowHead.append(button("Select", "level-compare-select", () => editor.selection.set([id])));
      }
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
        line.append(el("span", "", field.path.length === 0 ? "(whole actor)" : field.path.join(".")), mineValue, theirsValue);
        row.append(line);
      }
      rows.push({ conflict, mine, theirs });
      list.append(row);
    }
    paint();
    const close = (): void => {
      backdrop.remove();
      doc.removeEventListener("keydown", keydown, true);
    };
    const keydown = (event: KeyboardEvent): void => {
      // The level's shortcuts do not run under the window.
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
    if (merge.conflicts.length > 0) foot.append(button("All mine", "level-compare-all-mine", all("mine")), button("All theirs", "level-compare-all-theirs", all("theirs")));
    foot.append(
      button("Cancel", "level-compare-cancel", close),
      button("Apply", "level-compare-apply", () => {
        const result = editor.rebase(disk, { mode: "merge", pick: (key) => picks.get(key) ?? "mine" });
        if (!result.ok) {
          status(`The merge does not check: ${result.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`, "error");
          return;
        }
        close();
        hide();
        const unsaved = editor.dirty();
        status(unsaved === 0 ? "Merged with the disk; nothing left to save" : `Merged with the disk; ${unsaved} actor${unsaved === 1 ? "" : "s"} to save (undo history cleared)`);
      }),
    );
    window.append(head, summary, list, foot);
    backdrop.append(window);
    options.host.append(backdrop);
    doc.addEventListener("keydown", keydown, true);
    window.querySelector<HTMLButtonElement>("[data-testid=level-compare-apply]")?.focus();
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
