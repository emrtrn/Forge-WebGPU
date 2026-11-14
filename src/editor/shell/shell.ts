// The editor shell (plan phase 4 step 2): Forge WebGL's editor layout
// (src/editor/EditorUi.ts @ forge-webgl-final: the top bar with the level
// name and Save / Undo / Redo, the Outliner on the left, Details on the right,
// the viewport panel between them, the hidden status line and the toast) with
// the `data-testid`s Forge's smokes use (`forge-editor`, `editor-save`,
// `editor-undo`, `editor-redo`, `editor-status`, `outliner-row`).
//
// What it draws comes from the editor session: the Outliner
// (outliner/outlinerPanel.ts, step 5a: virtualised, hierarchy, search, eye
// and lock) selects; Details (details/detailsPanel.ts, step 5b) shows the
// selection's name, transform, pivot / placement and every component's form
// from its schema, one undo step per edit.
// The keys are Forge's table (input/shortcuts.ts, step 5f) in one handler:
// each part of the shell adds its actions as it is attached; no shortcut runs
// while the camera flies (WASD / QE are the camera's then).
// The viewport's view controls (step 3) sit in the work bar as Forge's hover
// menus: View Mode (Lit / Wireframe), Quality (Auto and the profiles), Show
// (toggles: Grid, Stats) and Camera (Perspective / Top / Left / Front; keys 1 Top, 2 Front,
// 3 Left, 4 Perspective), F focuses the selection, Escape clears it. The
// shell holds no viewport state: it asks the viewport and follows its changes.
// The transform tools (step 4) put their toolbar in the work bar before the
// view menus (transformToolbar.ts); Details takes their pivot / placement
// actions and live drag preview. The Content Browser (step 6a,
// content/contentPanel.ts) is Forge's drawer under the viewport (Ctrl + Space).
// Text is set with textContent; the only markup is the kit's static icons.

import type { ClassResolver, SchemaRegistry } from "../../core/index.ts";
import type { AssetCatalog } from "../assets/assetCatalog.ts";
import type { ContentPanel } from "../content/contentPanel.ts";
import { createDetailsPanel, type DetailsPanel } from "../details/detailsPanel.ts";
import type { EditCommands } from "../edit/editCommands.ts";
import type { EditorCatalog } from "../host/editorCatalog.ts";
import { IN_FIELDS, isEditableTarget, shortcutOf, type ShortcutId } from "../input/shortcuts.ts";
import type { ActorPlacer } from "../place/actorPlacer.ts";
import { createAddActorMenu } from "../place/addActorMenu.ts";
import { openContextMenu } from "../ui/contextMenu.ts";
import { UI_ICONS } from "../ui/icons.ts";
import { createWorldSettings } from "../world/worldSettingsPanel.ts";
import { createOutlinerPanel } from "../outliner/outlinerPanel.ts";
import type { EditorSession } from "../session/editorSession.ts";
import type { TransformTools } from "../transformTools.ts";
import { createTransformToolbar } from "./transformToolbar.ts";

/** Forge's toolbar glyphs (EditorUi TOOLBAR_ICONS). */
const TOOLBAR_ICONS = {
  save: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3.5h7.4l1.6 1.6v6.9a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5z"/><path d="M5.5 3.5v3h4v-3"/><rect x="5.5" y="9" width="5" height="3.5"/></svg>',
  undo: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4L3 7l3 3"/><path d="M3 7h5.5a3.5 3.5 0 0 1 0 7H7"/></svg>',
  redo: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4l3 3-3 3"/><path d="M13 7H7.5a3.5 3.5 0 0 0 0 7H9"/></svg>',
  viewmode: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" stroke="none"/></svg>',
  camera: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5h6.5L10 3.5h3.5v9H2z"/><circle cx="6.5" cy="9" r="2.4"/></svg>',
} as const;

const MENU_CHEVRON =
  '<svg class="menu-chevron" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5L6 7.5 9 4.5"/></svg>';


/** One choice of a view menu: its id and its label. */
export type MenuChoice = readonly [id: string, label: string];

/** The viewport's view state as the shell's menus read and set it (three-free). */
export interface ViewportMenus {
  /** Camera presets, in menu order. */
  readonly views: readonly MenuChoice[];
  view(): string;
  setView(view: string): void;
  onViewChange(listener: (view: string) => void): void;
  /** Frames the selection (key F). */
  focusSelection(): void;
  readonly viewModes: readonly MenuChoice[];
  viewMode(): string;
  setViewMode(mode: string): void;
  onViewModeChange(listener: (mode: string) => void): void;
  /** Quality choices ("auto" and the profiles). */
  readonly qualities: readonly MenuChoice[];
  quality(): string;
  setQuality(choice: string): void;
  /** Show flags: each a toggle. */
  readonly flags: readonly MenuChoice[];
  flag(id: string): boolean;
  setFlag(id: string, on: boolean): void;
}

export interface ShellOptions {
  readonly document: Document;
  /** Project and level shown in the top bar. */
  readonly projectName: string;
  readonly levelFolder: string;
  /** The project cannot be written (an engine sample): Save stays off. */
  readonly readOnly: boolean;
}

/** What the panels need besides the session. */
export interface ShellContext {
  readonly catalog: EditorCatalog;
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  readonly assets: AssetCatalog;
  /** Duplicate, delete, copy / paste, group (step 5c). */
  readonly commands: EditCommands;
  /** Each editor frame with its seconds (a Details preview that plays); returns the unsubscribe. */
  readonly onFrame: (listener: (dt: number) => void) => () => void;
}

export interface EditorShell {
  readonly root: HTMLElement;
  /** Where the renderer's canvas goes. */
  readonly viewport: HTMLElement;
  /** Binds the shell to an opened level. */
  attach(editor: EditorSession, context: ShellContext): void;
  /** Binds the view controls to the viewport. */
  attachViewport(menus: ViewportMenus): void;
  /** Adds Forge's "+ Add Actor" menu at the start of the work bar; its drags end in the viewport (step 5d). */
  attachPlacer(placer: ActorPlacer): void;
  /** Adds the transform toolbar and Details' pivot and placement actions; `navigating` is true while the camera flies. */
  attachTools(tools: TransformTools, navigating: () => boolean): void;
  /** Adds the Content Browser's drawer (step 6a). */
  attachContent(panel: ContentPanel): void;
  /** Saves the level, as the Save button does (the drawer's Save All). */
  save(): void;
  /** The status line; errors and warnings also show as a toast. */
  status(message: string, tone?: "info" | "warning" | "error"): void;
}

export function createShell(options: ShellOptions): EditorShell {
  const doc = options.document;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const iconButton = (icon: string, label: string, testId: string, hint: string): HTMLButtonElement => {
    const button = el("button", "tool-button");
    button.type = "button";
    button.innerHTML = icon; // The shell's own static SVG.
    button.setAttribute("aria-label", label);
    button.dataset.testid = testId;
    button.title = hint;
    return button;
  };

  const root = el("div", "editor-shell forge-kit");
  root.id = "editor-ui";
  root.dataset.testid = "forge-editor";
  root.addEventListener("contextmenu", (event) => event.preventDefault());

  const viewport = el("div", "editor-viewport-host");
  viewport.dataset.viewportHost = "";

  const topbar = el("header", "editor-topbar");
  const lead = el("div", "editor-lead");
  const brand = el("div", "editor-brand");
  const logo = el("span", "editor-logo", "F");
  logo.setAttribute("aria-hidden", "true");
  const brandText = el("span", "editor-brand-text");
  brandText.append(el("strong", "", options.projectName), el("span", "", options.readOnly ? `${options.levelFolder} (read only)` : options.levelFolder));
  brand.append(logo, brandText);
  const history = el("div", "editor-history-actions");
  const save = iconButton(TOOLBAR_ICONS.save, "Save Level", "editor-save", options.readOnly ? "Bu proje salt okunur (motor örneği); kaydedilmez." : "Değişiklikleri kaydet (Ctrl+S)");
  const undo = iconButton(TOOLBAR_ICONS.undo, "Undo", "editor-undo", "Geri al (Ctrl+Z)");
  const redo = iconButton(TOOLBAR_ICONS.redo, "Redo", "editor-redo", "Yinele (Ctrl+Y)");
  history.append(save, undo, redo);
  // Forge's main menu (hamburger): Save, World Settings (step 5e); Open Level comes with the Content Browser (step 6).
  const mainMenu = iconButton(UI_ICONS.hamburger, "Menu", "editor-main-menu", "Menü");
  mainMenu.classList.add("editor-main-menu-button");
  lead.append(mainMenu, brand, history);
  const workbar = el("div", "editor-workbar");
  const viewControls = el("div", "editor-view-controls");
  let tools: TransformTools | null = null;
  /** Details, once a level is attached. */
  let detailsPanel: DetailsPanel | null = null;
  /** What each shortcut does, filled as the parts are attached. */
  const actions: Partial<Record<ShortcutId, () => void>> = {};
  let navigating = (): boolean => false;
  let focusSelection = (): void => {};
  doc.defaultView?.addEventListener("keydown", (event) => {
    const id = shortcutOf(event);
    if (id === null || navigating()) return;
    if (isEditableTarget(event.target) && !IN_FIELDS.has(id)) return;
    const run = actions[id];
    if (!run) return;
    event.preventDefault();
    run();
  });
  let placerNow: ActorPlacer | null = null;
  let saveNow = (): void => {};
  workbar.append(viewControls);
  topbar.append(lead, workbar);

  /** A Forge hover menu: icon + current label + chevron, a popover of choices. */
  const topbarMenu = (kind: string, icon: string, ariaLabel: string, choices: readonly MenuChoice[], pick: (id: string) => void, fixedLabel?: string) => {
    const menu = el("div", `${kind}-menu topbar-menu`);
    const button = el("button", "topbar-menu-button");
    button.type = "button";
    button.setAttribute("aria-label", ariaLabel);
    button.dataset.testid = `${kind}-button`;
    const label = el("span", "", fixedLabel ?? "");
    button.innerHTML = icon; // The shell's own static SVG.
    button.append(label);
    button.insertAdjacentHTML("beforeend", MENU_CHEVRON);
    // A hover menu: a click must not take focus and pin it open (Forge).
    button.addEventListener("mousedown", (event) => event.preventDefault());
    const popover = el("div", "topbar-popover");
    const options = choices.map(([id, text]) => {
      const option = el("button", "", text);
      option.type = "button";
      option.dataset[`${kind}Choice`] = id;
      option.addEventListener("click", () => pick(id));
      return option;
    });
    popover.append(...options);
    menu.append(button, popover);
    // Entering one menu closes the others at once (Forge's hover intent).
    menu.addEventListener("pointerenter", () => {
      for (const other of viewControls.querySelectorAll(".topbar-menu")) other.classList.toggle("force-closed", other !== menu);
    });
    viewControls.append(menu);
    return {
      /** One choice is current: the label names it. */
      show(id: string) {
        label.textContent = choices.find(([choice]) => choice === id)?.[1] ?? id;
        for (const option of options) option.classList.toggle("active", option.dataset[`${kind}Choice`] === id);
      },
      /** Toggles: each choice on or off, the label stays. */
      mark(isOn: (id: string) => boolean) {
        for (const option of options) {
          const on = isOn(option.dataset[`${kind}Choice`]!);
          option.classList.toggle("active", on);
          option.setAttribute("aria-pressed", String(on));
        }
      },
    };
  };

  const outliner = el("aside", "editor-panel editor-outliner");
  const outlinerHeading = el("div", "editor-panel-heading");
  outlinerHeading.append(el("span", "", "Outliner"));
  outliner.append(outlinerHeading);

  const details = el("aside", "editor-panel editor-details");
  const detailsHeading = el("div", "editor-panel-heading");
  detailsHeading.append(el("span", "", "Details"));
  const detailsBody = el("div", "details-scroll");
  details.append(detailsHeading, detailsBody);

  const statusLine = el("footer", "editor-status");
  const statusText = el("span", "", "Loading level");
  statusText.dataset.testid = "editor-status";
  statusLine.append(statusText);
  const toast = el("div", "editor-toast");
  toast.setAttribute("role", "alert");
  toast.hidden = true;
  const toastText = el("span", "editor-toast-text");
  toastText.dataset.testid = "editor-toast";
  const toastClose = el("button", "editor-toast-close", "✕");
  toastClose.type = "button";
  toastClose.setAttribute("aria-label", "Dismiss");
  toastClose.addEventListener("click", () => (toast.hidden = true));
  toast.append(toastText, toastClose);

  root.append(viewport, topbar, outliner, details, statusLine, toast);
  save.disabled = true;
  undo.disabled = true;
  redo.disabled = true;

  const status = (message: string, tone: "info" | "warning" | "error" = "info"): void => {
    statusText.textContent = message;
    statusLine.dataset.tone = tone;
    if (tone === "info") return;
    toastText.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
  };

  return {
    root,
    viewport,
    status,
    attachViewport(menus) {
      const camera = topbarMenu("camera", TOOLBAR_ICONS.camera, "Camera view", menus.views, (id) => menus.setView(id));
      camera.show(menus.view());
      menus.onViewChange((view) => camera.show(view));
      const viewMode = topbarMenu("viewmode", TOOLBAR_ICONS.viewmode, "View mode", menus.viewModes, (id) => menus.setViewMode(id));
      viewMode.show(menus.viewMode());
      menus.onViewModeChange((mode) => viewMode.show(mode));
      const quality = topbarMenu("quality", "Quality: ", "Graphics quality", menus.qualities, (id) => {
        menus.setQuality(id);
        quality.show(menus.quality());
      });
      quality.show(menus.quality());
      const show = topbarMenu(
        "show",
        "",
        "Show flags",
        menus.flags,
        (id) => {
          menus.setFlag(id, !menus.flag(id));
          show.mark((flag) => menus.flag(flag));
        },
        "Show",
      );
      show.mark((flag) => menus.flag(flag));
      focusSelection = () => menus.focusSelection();
      Object.assign(actions, {
        focus: focusSelection,
        viewTop: () => menus.setView("top"),
        viewFront: () => menus.setView("front"),
        viewLeft: () => menus.setView("left"),
        viewPerspective: () => menus.setView("perspective"),
      } satisfies Partial<Record<ShortcutId, () => void>>);
    },
    attachPlacer(placer) {
      placerNow = placer;
      workbar.prepend(createAddActorMenu({ document: doc, placer, viewport, status }));
    },
    save: () => saveNow(),
    attachContent(panel) {
      root.append(panel.element);
      actions.contentDrawer = () => panel.setOpen(!panel.isOpen());
    },
    attachTools(next, flying) {
      tools = next;
      for (const part of createTransformToolbar({ document: doc, tools: next })) workbar.insertBefore(part, viewControls);
      navigating = flying;
      Object.assign(actions, {
        toolSelect: () => next.setTool("select"),
        toolMove: () => next.setTool("move"),
        toolRotate: () => next.setTool("rotate"),
        toolScale: () => next.setTool("scale"),
        cycleTool: () => next.cycleTool(),
        toggleSpace: () => next.toggleSpace(),
        snapToFloor: () => next.snapToFloor(),
      } satisfies Partial<Record<ShortcutId, () => void>>);
      detailsPanel?.setTools(next);
    },
    attach(editor, context) {
      outliner.append(
        createOutlinerPanel({ document: doc, editor, catalog: context.catalog, resolveClass: context.resolveClass, commands: context.commands, focus: () => focusSelection(), status }).element,
      );
      detailsPanel = createDetailsPanel({
        document: doc,
        editor,
        registry: context.registry,
        resolveClass: context.resolveClass,
        assets: context.assets,
        catalog: context.catalog,
        onFrame: context.onFrame,
        host: details,
        status,
      });
      if (tools) detailsPanel.setTools(tools);
      detailsBody.replaceChildren(detailsPanel.element);

      const renderToolbar = (): void => {
        undo.disabled = !editor.canUndo();
        redo.disabled = !editor.canRedo();
        save.disabled = options.readOnly || editor.dirty() === 0;
      };

      const runSave = async (): Promise<void> => {
        if (options.readOnly) return;
        save.disabled = true;
        status("Saving");
        const report = await editor.save();
        status(report.message, report.ok ? "info" : "error");
        renderToolbar();
      };
      const runUndo = (): void => {
        if (editor.undo()) status("Undo");
      };
      const runRedo = (): void => {
        if (editor.redo()) status("Redo");
      };
      save.addEventListener("click", () => void runSave());
      saveNow = () => void runSave();
      const worldSettings = createWorldSettings({ document: doc, host: root, editor, registry: context.registry, resolveClass: context.resolveClass, placer: () => placerNow });
      mainMenu.addEventListener("click", () => {
        const rect = mainMenu.getBoundingClientRect();
        openContextMenu(
          doc,
          { x: rect.left, y: rect.bottom + 4 },
          [
            { label: "Save Level", shortcut: "Ctrl+S", enabled: !options.readOnly, run: () => void runSave(), testId: "main-menu-save" },
            { separator: true },
            { label: "World Settings…", run: () => worldSettings.open(), testId: "main-menu-world-settings" },
          ],
          "main-menu",
        );
      });
      undo.addEventListener("click", runUndo);
      redo.addEventListener("click", runRedo);
      Object.assign(actions, {
        save: () => void runSave(),
        undo: runUndo,
        redo: runRedo,
        clearSelection: () => editor.selection.set([]),
        // Forge's Ctrl + A: every actor in view (a hidden one stays out).
        selectAll: () => editor.selection.set(editor.level.level.actors.filter((actor) => !editor.visibility.hidden(actor.id)).map((actor) => actor.id)),
        hide: () => {
          const ids = editor.selection.ids();
          if (ids.length === 0) status("No selected object to hide.", "warning");
          else editor.visibility.set(ids, true);
        },
        showHidden: () => editor.visibility.showAll(),
        duplicate: () => void context.commands.duplicate(),
        delete: () => context.commands.remove(),
        copy: () => void context.commands.copy(),
        cut: () => void context.commands.cut(),
        paste: () => void context.commands.paste(),
        group: () => context.commands.group(),
        ungroup: () => context.commands.ungroup(),
      } satisfies Partial<Record<ShortcutId, () => void>>);

      editor.onChange(renderToolbar);
      renderToolbar();
      status("Ready");
      root.dataset.editorReady = "1";
    },
  };
}
