// A non-modal editor window (Forge WebGL's ForgeWindow,
// src/editor/panels/world/worldBuilderWindow.ts @ forge-webgl-final, without
// its tab strip): a title bar that drags it, a close button, a resize handle
// at the bottom right and a body the owner fills. The viewport and the other
// panels stay usable behind it, and Escape is left to them. Position and size
// are a per-viewer convenience kept in the page's storage; the window is always
// clamped inside its host so the title bar stays reachable.

const MIN_WIDTH = 380;
const MIN_HEIGHT = 320;
const MARGIN = 12;

interface Geometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ForgeWindowOptions {
  readonly document: Document;
  /** The element the window lives in and is clamped to (the editor's shell). */
  readonly host: HTMLElement;
  /** The region the window opens in (the viewport), in client coordinates; its top is also the highest the window may go. */
  readonly area: () => DOMRect;
  readonly title: string;
  readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  readonly storageKey: string;
  readonly testId: string;
  /** Size until the viewer moves or resizes it; it sits at the top right of `area`. */
  readonly size: { readonly width: number; readonly height: number };
}

export interface ForgeWindow {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
  readonly isOpen: boolean;
  /** Shows the window, or keeps it open where it is. */
  open(): void;
  close(): void;
  dispose(): void;
}

function readGeometry(storage: ForgeWindowOptions["storage"], key: string): Geometry | null {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? "null") as Partial<Geometry> | null;
    return value && [value.x, value.y, value.width, value.height].every((entry) => typeof entry === "number" && Number.isFinite(entry)) ? (value as Geometry) : null;
  } catch {
    return null;
  }
}

export function createForgeWindow(options: ForgeWindowOptions): ForgeWindow {
  const { document: doc, host } = options;
  const view = doc.defaultView!;
  let geometry = readGeometry(options.storage, options.storageKey);

  const element = doc.createElement("section");
  element.className = "forge-window";
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-modal", "false");
  element.setAttribute("aria-label", options.title);
  element.dataset.testid = options.testId;
  element.hidden = true;
  const titlebar = doc.createElement("header");
  titlebar.className = "forge-window-titlebar";
  const title = doc.createElement("span");
  title.className = "forge-window-title";
  title.textContent = options.title;
  const closeButton = doc.createElement("button");
  closeButton.type = "button";
  closeButton.className = "forge-window-close";
  closeButton.dataset.testid = `${options.testId}-close`;
  closeButton.setAttribute("aria-label", `Close ${options.title}`);
  closeButton.title = "Kapat";
  closeButton.textContent = "×";
  titlebar.append(title, closeButton);
  const body = doc.createElement("div");
  body.className = "forge-window-body";
  const grip = doc.createElement("div");
  grip.className = "forge-window-resize";
  grip.setAttribute("aria-hidden", "true");
  element.append(titlebar, body, grip);
  host.append(element);

  /** Host-relative limits: the full host width, from the area's top to the host's bottom. */
  const bounds = (): { width: number; top: number; bottom: number } => {
    const rect = host.getBoundingClientRect();
    return { width: rect.width, top: Math.max(0, options.area().top - rect.top), bottom: rect.height };
  };
  const initial = (): Geometry => {
    const rect = host.getBoundingClientRect();
    const area = options.area();
    return { x: area.right - rect.left - options.size.width - MARGIN, y: area.top - rect.top + MARGIN, ...options.size };
  };
  /** Never smaller than the minimum (unless the host is), never larger than the bounds, wholly inside them. */
  const clamp = (wanted: Geometry): Geometry => {
    const { width: hostWidth, top, bottom } = bounds();
    const room = Math.max(0, bottom - top);
    const width = Math.max(Math.min(MIN_WIDTH, hostWidth), Math.min(wanted.width, hostWidth));
    const height = Math.max(Math.min(MIN_HEIGHT, room), Math.min(wanted.height, room));
    return {
      x: Math.round(Math.min(Math.max(wanted.x, 0), Math.max(0, hostWidth - width))),
      y: Math.round(Math.min(Math.max(wanted.y, top), Math.max(top, bottom - height))),
      width: Math.round(width),
      height: Math.round(height),
    };
  };
  const apply = (wanted: Geometry): void => {
    geometry = clamp(wanted);
    Object.assign(element.style, { left: `${geometry.x}px`, top: `${geometry.y}px`, width: `${geometry.width}px`, height: `${geometry.height}px` });
  };
  /** Resizing grows toward the bottom right and stops at the bounds, so the top-left corner stays put. */
  const resized = (start: Geometry, dx: number, dy: number): Geometry => {
    const { width, bottom } = bounds();
    return {
      ...start,
      width: Math.min(Math.max(MIN_WIDTH, start.width + dx), Math.max(MIN_WIDTH, width - start.x)),
      height: Math.min(Math.max(MIN_HEIGHT, start.height + dy), Math.max(MIN_HEIGHT, bottom - start.y)),
    };
  };
  const bindDrag = (handle: HTMLElement, mode: "move" | "resize"): void => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      const start = geometry ?? initial();
      handle.setPointerCapture(event.pointerId);
      const move = (moved: PointerEvent): void => {
        const dx = moved.clientX - event.clientX;
        const dy = moved.clientY - event.clientY;
        apply(mode === "move" ? { ...start, x: start.x + dx, y: start.y + dy } : resized(start, dx, dy));
      };
      const end = (): void => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        try {
          options.storage?.setItem(options.storageKey, JSON.stringify(geometry));
        } catch {
          // The window then remembers nothing past this page.
        }
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  };
  bindDrag(titlebar, "move");
  bindDrag(grip, "resize");
  const onResize = (): void => {
    if (!element.hidden && geometry) apply(geometry);
  };
  view.addEventListener("resize", onResize);
  const close = (): void => {
    element.hidden = true;
  };
  closeButton.addEventListener("click", close);

  return {
    element,
    body,
    get isOpen() {
      return !element.hidden;
    },
    open() {
      element.hidden = false;
      apply(geometry ?? initial());
    },
    close,
    dispose() {
      view.removeEventListener("resize", onResize);
      element.remove();
    },
  };
}
