// The editor's keyboard shortcuts (INV-A31; Forge WebGL EditorUi.ts
// `handleKeyDown` and editor/input/keyboard.ts @ forge-webgl-final): which
// action a key press means. One table, DOM-free (Node tests read it); the
// shell runs the actions. Forge's keys as they were, plus Ctrl + C / X / V for
// copy, cut and paste of actors (INV-A08) and Shift + G for ungroup (Forge had
// it only in the Outliner's menu). Ctrl stands for Cmd too.
//
// Not here: the camera's own keys (WASD / QE while flying, editorCamera.ts),
// P (Play, step 8), Ctrl + B / Ctrl + E (Content Browser, asset editors; steps
// 6 and 7).

export type ShortcutId =
  | "undo"
  | "redo"
  | "save"
  | "duplicate"
  | "group"
  | "ungroup"
  | "selectAll"
  | "copy"
  | "cut"
  | "paste"
  | "clearSelection"
  | "toolSelect"
  | "toolMove"
  | "toolRotate"
  | "toolScale"
  | "cycleTool"
  | "delete"
  | "focus"
  | "viewTop"
  | "viewFront"
  | "viewLeft"
  | "viewPerspective"
  | "hide"
  | "showHidden"
  | "toggleSpace"
  | "snapToFloor";

export interface KeyPress {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const CTRL: Readonly<Record<string, ShortcutId>> = {
  KeyZ: "undo",
  KeyY: "redo",
  KeyS: "save",
  KeyD: "duplicate",
  KeyG: "group",
  KeyA: "selectAll",
  KeyC: "copy",
  KeyX: "cut",
  KeyV: "paste",
};

const PLAIN: Readonly<Record<string, ShortcutId>> = {
  Escape: "clearSelection",
  KeyQ: "toolSelect",
  KeyW: "toolMove",
  KeyE: "toolRotate",
  KeyR: "toolScale",
  Space: "cycleTool",
  Delete: "delete",
  KeyF: "focus",
  Digit1: "viewTop",
  Digit2: "viewFront",
  Digit3: "viewLeft",
  Digit4: "viewPerspective",
  KeyH: "hide",
  KeyX: "toggleSpace",
  End: "snapToFloor",
};

/** The action a key press means; null for none. Alt is never a shortcut (Forge). */
export function shortcutOf(key: KeyPress): ShortcutId | null {
  if (key.altKey) return null;
  if (key.ctrlKey || key.metaKey) {
    if (key.code === "KeyZ" && key.shiftKey) return "redo";
    return key.shiftKey ? null : (CTRL[key.code] ?? null);
  }
  if (key.shiftKey) {
    if (key.code === "KeyH") return "showHidden";
    if (key.code === "KeyG") return "ungroup";
    return null;
  }
  return PLAIN[key.code] ?? null;
}

/** Shortcuts that still run while a text field has focus (Forge's Ctrl + S). */
export const IN_FIELDS: ReadonlySet<ShortcutId> = new Set(["save"]);

/** A press in a field the user types into (Forge's `isEditableTarget`). */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!element || typeof element.tagName !== "string") return false;
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable === true;
}
