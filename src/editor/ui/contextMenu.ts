// The editor's context menu (Forge WebGL EditorUi.ts `openContextMenu` and
// its `.context-menu` styles @ forge-webgl-final): a list of actions at the
// pointer, kept on screen, closed by a click outside, Escape, the window
// losing focus or a pick. The main menu (step 5e), the Outliner's and the
// viewport's right click (5f) use it. Text is set with textContent.

export interface ContextMenuAction {
  readonly label: string;
  readonly run: () => void;
  /** False shows it disabled. */
  readonly enabled?: boolean;
  /** A destructive action (Delete): the hover is red. */
  readonly danger?: boolean;
  /** Its key, shown dim on the right (`Ctrl+D`). */
  readonly shortcut?: string;
  readonly testId?: string;
}

export type ContextMenuItem = ContextMenuAction | { readonly separator: true };

let closeOpen: (() => void) | null = null;

/** Opens a menu at a page point; closes any other first. Returns the close. */
export function openContextMenu(document: Document, at: { readonly x: number; readonly y: number }, items: readonly ContextMenuItem[], testId = "context-menu"): () => void {
  closeOpen?.();
  const view = document.defaultView!;
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.dataset.testid = testId;
  menu.setAttribute("role", "menu");
  const close = (): void => {
    if (closeOpen !== close) return;
    closeOpen = null;
    menu.remove();
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    view.removeEventListener("blur", close);
  };
  for (const item of items) {
    if ("separator" in item) {
      const divider = document.createElement("div");
      divider.className = "context-menu-separator";
      menu.append(divider);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `context-menu-item${item.danger ? " danger" : ""}`;
    button.setAttribute("role", "menuitem");
    const label = document.createElement("span");
    label.textContent = item.label;
    button.append(label);
    if (item.shortcut) {
      const key = document.createElement("small");
      key.className = "context-menu-shortcut";
      key.textContent = item.shortcut;
      button.append(key);
    }
    button.disabled = item.enabled === false;
    if (item.testId) button.dataset.testid = item.testId;
    button.addEventListener("click", () => {
      close();
      item.run();
    });
    menu.append(button);
  }
  document.body.append(menu);
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(margin, Math.min(at.x, view.innerWidth - rect.width - margin))}px`;
  menu.style.top = `${Math.max(margin, Math.min(at.y, view.innerHeight - rect.height - margin))}px`;

  const onPointerDown = (event: Event): void => {
    if (!menu.contains(event.target as Node)) close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Escape") return;
    event.stopPropagation();
    close();
  };
  // After this event: the press that opened it must not close it.
  view.setTimeout(() => {
    if (closeOpen === close) document.addEventListener("pointerdown", onPointerDown, true);
  }, 0);
  document.addEventListener("keydown", onKeyDown, true);
  view.addEventListener("blur", close);
  closeOpen = close;
  return close;
}

/** Forge's `.context-menu` styles (inside or outside the shell: the menu sits on the body). */
export const CONTEXT_MENU_CSS = `
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 168px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: #1b1f24;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 2px;
  font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.context-menu-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
  text-align: left;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #e8edf0;
  font: inherit;
  cursor: pointer;
}

.context-menu-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu-item:disabled {
  opacity: 0.38;
  cursor: default;
}

.context-menu-item.danger:hover:not(:disabled) {
  background: rgba(225, 91, 91, 0.25);
}

.context-menu-shortcut {
  color: #8a949a;
  font-size: 11px;
}

.context-menu-separator {
  height: 1px;
  margin: 4px 6px;
  background: rgba(255, 255, 255, 0.1);
}
`;

const STYLE_ID = "forge-editor-context-menu-style";

export function installContextMenuStyle(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CONTEXT_MENU_CSS;
  document.head.appendChild(style);
}
