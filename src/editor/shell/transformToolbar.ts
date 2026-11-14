// The transform toolbar (plan phase 4 step 4; Forge WebGL EditorUi's
// buildToolbar, snap widgets and tool keys @ forge-webgl-final): Select / Move
// / Rotate / Scale, the World / Local toggle and the move / rotate / scale
// snap widgets (a grid-icon toggle joined to a step list, Forge's steps), in
// the work bar before the view menus.
//
// Keys (Forge): Q Select, W Move, E Rotate, R Scale, Space cycles Move ->
// Rotate -> Scale, X toggles World / Local, End snaps the selection to the
// floor. Not while typing in a field, not with Ctrl / Alt / Meta, not while the
// camera flies (its W / E / Q). Escape while dragging cancels the drag before
// it can clear the selection.

import { EDITOR_TOOLS, type EditorTool } from "../../engine/gizmo/axes.ts";
import { SNAP_STEPS, type SnapSettings } from "../../engine/gizmo/snap.ts";
import type { TransformTools } from "../transformTools.ts";

/** Forge's toolbar glyphs (EditorUi TOOLBAR_ICONS). */
export const TOOL_ICONS = {
  select: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2l9 4.4-4 1.1-1.1 4z"/></svg>',
  move: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v12M2 8h12"/><path d="M8 2l-2 2M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2"/></svg>',
  rotate: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.6-3.6"/><path d="M13.2 3v2.6h-2.6"/></svg>',
  scale: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h4.5M3 3v4.5M3 3l6.5 6.5"/><rect x="9" y="9" width="4" height="4"/></svg>',
  world: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2.4 2 2.4 10 0 12M8 2c-2.4 2-2.4 10 0 12"/></svg>',
  local: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l5 3v6l-5 3-5-3V5z"/><path d="M8 8v6M3 5l5 3 5-3"/></svg>',
  snap: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h12M2 10h12M6 2v12M10 2v12"/></svg>',
} as const;

const TOOL_LABELS: Readonly<Record<EditorTool, string>> = { select: "Select", move: "Move", rotate: "Rotate", scale: "Scale" };
const TOOL_KEYS: Readonly<Record<EditorTool, string>> = { select: "Q", move: "W", rotate: "E", scale: "R" };
const KEY_TOOLS: Readonly<Record<string, EditorTool>> = { KeyQ: "select", KeyW: "move", KeyE: "rotate", KeyR: "scale" };
const SNAP_HINTS = {
  move: "Taşıma adımı (metre); simge açar / kapatır.",
  rotate: "Döndürme adımı (derece); simge açar / kapatır.",
  scale: "Ölçek adımı; simge açar / kapatır.",
} as const;

export interface TransformToolbarOptions {
  readonly document: Document;
  readonly tools: TransformTools;
  /** True while the camera flies (right drag): its keys are not the tools'. */
  readonly navigating: () => boolean;
}

/** The tool group and the snap widgets, to put in the work bar. */
export function createTransformToolbar(options: TransformToolbarOptions): HTMLElement[] {
  const { document: doc, tools } = options;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ""): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
  };

  const group = el("div", "editor-tools");
  const toolButtons = EDITOR_TOOLS.map((tool) => {
    const button = el("button", "tool-button");
    button.type = "button";
    button.innerHTML = TOOL_ICONS[tool]; // Static SVG.
    button.dataset.tool = tool;
    button.dataset.testid = `tool-${tool}`;
    button.setAttribute("aria-label", TOOL_LABELS[tool]);
    button.title = `${TOOL_LABELS[tool]} (${TOOL_KEYS[tool]})`;
    button.addEventListener("click", () => tools.setTool(tool));
    group.append(button);
    return button;
  });
  const spaceButton = el("button", "tool-button space-toggle");
  spaceButton.type = "button";
  spaceButton.dataset.testid = "transform-space";
  spaceButton.addEventListener("click", () => tools.toggleSpace());
  group.append(spaceButton);

  const snaps = el("div", "editor-snaps");
  const widgets = (["move", "rotate", "scale"] as const).map((kind) => {
    const label = el("label", "snap-widget");
    label.title = SNAP_HINTS[kind];
    const toggle = el("input");
    toggle.type = "checkbox";
    toggle.dataset.snapToggle = kind;
    toggle.dataset.testid = `snap-${kind}-toggle`;
    const icon = el("span", "snap-icon");
    icon.innerHTML = kind === "move" ? TOOL_ICONS.snap : TOOL_ICONS[kind]; // Static SVG.
    const select = el("select");
    select.dataset.snap = kind;
    select.dataset.testid = `snap-${kind}`;
    select.setAttribute("aria-label", `${TOOL_LABELS[kind]} snap`);
    for (const step of SNAP_STEPS[kind]) {
      const option = el("option");
      option.value = String(step);
      option.textContent = kind === "rotate" ? `${step}°` : String(step);
      select.append(option);
    }
    const enabledKey = `${kind}Enabled` as const;
    toggle.addEventListener("change", () => tools.setSnap({ [enabledKey]: toggle.checked } as Partial<SnapSettings>));
    select.addEventListener("change", () => {
      const value = Number(select.value);
      if (Number.isFinite(value)) tools.setSnap({ [kind]: value } as Partial<SnapSettings>);
    });
    label.append(toggle, icon, select);
    snaps.append(label);
    return { kind, toggle, select, enabledKey };
  });

  const render = (): void => {
    for (const button of toolButtons) {
      const on = button.dataset.tool === tools.tool;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    }
    const local = tools.space === "local";
    spaceButton.innerHTML = local ? TOOL_ICONS.local : TOOL_ICONS.world; // Static SVG.
    spaceButton.setAttribute("aria-label", `${local ? "Local" : "World"} space`);
    spaceButton.title = `${local ? "Local" : "World"} space (X)`;
    spaceButton.classList.toggle("active", local);
    for (const widget of widgets) {
      widget.toggle.checked = tools.snap[widget.enabledKey];
      const value = String(tools.snap[widget.kind]);
      // A stored step that is not one of Forge's choices still shows (Forge's setSnapSelect).
      if (![...widget.select.options].some((option) => option.value === value)) {
        const option = el("option");
        option.value = value;
        option.textContent = widget.kind === "rotate" ? `${value}°` : value;
        widget.select.append(option);
      }
      widget.select.value = value;
    }
  };
  tools.onChange(render);
  render();

  const view = doc.defaultView;
  // Capture: Escape cancels a drag before the shell's Escape clears the selection.
  view?.addEventListener(
    "keydown",
    (event) => {
      if (event.code === "Escape" && tools.dragging && tools.cancel()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  view?.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || options.navigating()) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
    const tool = KEY_TOOLS[event.code];
    if (tool && !event.shiftKey) tools.setTool(tool);
    else if (event.code === "Space" && !event.shiftKey) tools.cycleTool();
    else if (event.code === "KeyX" && !event.shiftKey) tools.toggleSpace();
    else if (event.code === "End") tools.snapToFloor();
    else return;
    event.preventDefault();
  });
  return [group, snaps];
}
