// The boot screen on the page: plain DOM, no renderer, no stylesheet (F10).
// Text goes in through `textContent` only, so an error message cannot inject
// markup. The page needs nothing but a root element. When the GPU device was
// lost the screen offers a reload (phase 3 decision 10).

import type { BootErrorView, BootScreen } from "./boot.ts";

const BOX = "font: 14px/1.5 system-ui, sans-serif; color: #e6e6e6; background: #16181c; padding: 24px; min-height: 100vh; box-sizing: border-box;";
const BUTTON = "font: 14px system-ui, sans-serif; margin: 0 0 12px; padding: 6px 14px; cursor: pointer;";

export function createBootScreen(document: Document, root: HTMLElement): BootScreen {
  const text = (tag: string, content: string, css = ""): HTMLElement => {
    const element = document.createElement(tag);
    element.textContent = content;
    if (css !== "") element.style.cssText = css;
    return element;
  };
  const show = (kind: "info" | "error", title: string, message: string, details: readonly string[], reload = false): void => {
    const box = document.createElement("section");
    box.setAttribute("data-testid", `boot-${kind}`);
    box.setAttribute("role", kind === "error" ? "alert" : "status");
    box.style.cssText = BOX;
    box.append(text("h1", title, `font-size: 18px; margin: 0 0 8px; color: ${kind === "error" ? "#ff8a80" : "#e6e6e6"};`));
    box.append(text("p", message, "margin: 0 0 12px;"));
    if (reload) {
      const button = text("button", "Reload", BUTTON);
      button.setAttribute("type", "button");
      button.setAttribute("data-testid", "boot-reload");
      button.addEventListener("click", () => document.defaultView?.location.reload());
      box.append(button);
    }
    if (details.length > 0) {
      box.append(text("pre", details.join("\n"), "margin: 0; white-space: pre-wrap; font: 12px/1.4 ui-monospace, monospace; color: #b0b0b0;"));
    }
    root.replaceChildren(box);
  };
  return {
    info: (title, message) => show("info", title, message, []),
    error: (view: BootErrorView) => show("error", view.title, view.message, view.details, view.reload === true),
    clear: () => root.replaceChildren(),
  };
}
